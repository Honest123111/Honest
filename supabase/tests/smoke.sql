-- Smoke test for schema, triggers and RLS. Runs in a transaction and rolls back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
-- Every block raises on failure; success prints "ALL SMOKE TESTS PASSED".
begin;

-- users ----------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000b', 'acq@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000c', 'analyst@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000e', 'stranger@gmail.com');
update public.profiles set role = 'admin'        where email like 'admin@%';
update public.profiles set role = 'acquisitions' where email like 'acq@%';
update public.profiles set role = 'analyst'      where email like 'analyst@%';

do $$ begin
  assert (select is_active from public.profiles where email = 'stranger@gmail.com') = false, 'off-domain user must start inactive';
  assert (select is_active from public.profiles where email = 'viewer@honesttransportation.com'), 'company user must start active';
end $$;

-- reference: a straight "I-10" along lat 33.6 and one interchange
insert into reference.i10_centerline (source, geom)
values ('test', extensions.st_multi(extensions.st_geomfromtext('LINESTRING(-115.0 33.6, -114.5 33.6)', 4326)));
insert into reference.interchanges (exit_number, name, geom)
values ('240', 'Test Rd', extensions.st_setsrid(extensions.st_makepoint(-114.8, 33.6), 4326));

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('role', 'authenticated', true)
$$;
create or replace function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claim.sub', '', true)
$$;

-- 1. acquisitions creates a property; APN normalized; geo computed ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.properties (id, county, apn, situs_city, acres, geom)
values ('11111111-1111-1111-1111-111111111111', 'riverside', '836-121-003', 'Blythe', 1.47,
        extensions.st_multi(extensions.st_geomfromtext(
          'POLYGON((-114.801 33.610,-114.799 33.610,-114.799 33.612,-114.801 33.612,-114.801 33.610))', 4326)));
do $$
declare p public.properties;
begin
  select * into p from public.properties where id = '11111111-1111-1111-1111-111111111111';
  assert p.apn = '836121003', 'apn normalized';
  assert public.format_apn(p.county, p.apn) = '836-121-003', 'apn display';
  assert p.distance_to_i10_mi between 0.6 and 0.8, format('distance to I-10 ~0.69 mi, got %s', p.distance_to_i10_mi);
  assert p.corridor_zone = 'i10_corridor', 'corridor zone';
  assert p.location_method = 'gis_polygon', 'location method';
  assert p.nearest_interchange like 'Exit 240%', 'nearest interchange';
end $$;

-- duplicate APN (formatted differently) rejected
do $$ begin
  begin
    insert into public.properties (county, apn) values ('riverside', '836121003');
    raise exception 'duplicate APN was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- 2. status gates ------------------------------------------------------------
do $$ begin
  begin
    update public.properties set lead_status = 'offer_made' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'offer_made without offer accepted';
  exception when raise_exception then
    if sqlerrm not like '%requires an offer%' then raise; end if;
  end;
  begin
    update public.properties set lead_status = 'dead' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'dead without reason accepted';
  exception when raise_exception then
    if sqlerrm not like '%requires a reason%' then raise; end if;
  end;
end $$;
insert into public.offers (property_id, amount, status) values ('11111111-1111-1111-1111-111111111111', 600000, 'sent');
update public.properties set lead_status = 'offer_made' where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert exists (select 1 from public.activities where type = 'status_change'
                 and property_id = '11111111-1111-1111-1111-111111111111'), 'status change activity';
  assert (select field_sources -> 'lead_status' ->> 'src' from public.properties
           where id = '11111111-1111-1111-1111-111111111111') = 'user', 'provenance recorded';
end $$;

-- 3. note with @mention -> activity + notification ---------------------------
insert into public.notes (property_id, body, mentions)
values ('11111111-1111-1111-1111-111111111111', 'Call the co-owners @analyst', array['00000000-0000-0000-0000-00000000000c'::uuid]);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.notifications where kind = 'mention') = 1, 'analyst sees their mention';
  assert exists (select 1 from public.activities where type = 'note'), 'note activity';
  assert (select last_activity_at from public.properties where id = '11111111-1111-1111-1111-111111111111') is not null, 'last_activity_at';
end $$;

-- 4. analyst: research fields OK, status/price blocked -----------------------
update public.properties set zoning = 'M1', tags = array['EV Candidate'] where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    update public.properties set asking_price = 1 where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'analyst changed asking_price';
  exception when insufficient_privilege then null;
  end;
end $$;
-- analyst cannot insert properties (RLS)
do $$ begin
  begin
    insert into public.properties (county, apn) values ('riverside', '999999999');
    raise exception 'analyst inserted a property';
  exception when insufficient_privilege then null;
  end;
end $$;
-- analyst contact insert: consent is stripped
insert into public.owners (id, name, owner_type) values ('22222222-2222-2222-2222-222222222222', 'Hobson Tire LLC', 'entity');
insert into public.contacts (owner_id, phone, consent, consent_method)
values ('22222222-2222-2222-2222-222222222222', '(760) 555-0100', true, 'made up');
do $$ begin
  assert (select consent from public.contacts where owner_id = '22222222-2222-2222-2222-222222222222') = false, 'analyst consent stripped';
  assert (select phone_e164 from public.contacts where owner_id = '22222222-2222-2222-2222-222222222222') = '+17605550100', 'e164';
end $$;

-- 5. viewer: read only; private notes hidden ---------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.notes (property_id, body, visibility) values ('11111111-1111-1111-1111-111111111111', 'secret', 'private');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$
declare n int;
begin
  assert (select count(*) from public.properties) = 1, 'viewer reads properties';
  assert not exists (select 1 from public.notes where body = 'secret'), 'viewer cannot see private note';
  update public.properties set zoning = 'X';
  get diagnostics n = row_count;
  assert n = 0, 'viewer update must affect 0 rows';
end $$;

-- 6. stranger (inactive): sees nothing ---------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  assert (select count(*) from public.properties) = 0, 'inactive user sees nothing';
end $$;

-- 7. enrichment approval rules + budget stop ---------------------------------
select pg_temp.as_postgres();
update public.provider_settings set enabled = true, monthly_budget_usd = 1.00, unit_cost_usd = 0.40 where provider = 'apollo';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    perform public.request_enrichment('apollo', null, '22222222-2222-2222-2222-222222222222');
    raise exception 'analyst requested paid enrichment';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table req as
  select (public.request_enrichment('apollo', null, '22222222-2222-2222-2222-222222222222', 'email')).id as email_id,
         (public.request_enrichment('apollo', null, '22222222-2222-2222-2222-222222222222', 'phone')).id as phone_id,
         (public.request_enrichment('apollo', null, '22222222-2222-2222-2222-222222222222', 'email', 2)).id as big_id;
do $$ begin
  -- acquisitions can't approve own request, nor any phone reveal
  begin
    perform public.decide_enrichment(array[(select email_id from req)], true);
    raise exception 'self-approval allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.enrichment_requests (owner_id, provider, status) values ('22222222-2222-2222-2222-222222222222', 'apollo', 'approved');
    raise exception 'direct insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.decide_enrichment(array[(select email_id from req), (select phone_id from req)], true);  -- $0.80 of $1.00
do $$ begin
  begin
    perform public.decide_enrichment(array[(select big_id from req)], true);   -- +$0.80 > cap
    raise exception 'budget cap not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Budget stop%' then raise; end if;
  end;
end $$;

-- 8. audit + history --------------------------------------------------------
do $$ begin
  assert (select count(*) from public.audit_log where property_id = '11111111-1111-1111-1111-111111111111'
          and table_name = 'properties' and action = 'UPDATE') >= 2, 'property field changes audited';
  assert exists (select 1 from public.audit_log where table_name = 'properties' and 'zoning' = any (changed_fields)
                 and user_id = '00000000-0000-0000-0000-00000000000c'), 'audit records the analyst';
end $$;

-- 9. grid view + search -----------------------------------------------------
do $$ begin
  assert (select owner_count from public.property_grid) = 0, 'grid view';
  assert (select count(*) from public.search_global('836-121')) = 1, 'search by formatted APN';
  assert (select count(*) from public.search_global('hobson tire')) = 1, 'search by owner';
end $$;

-- 10. profile guard ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'viewer promoted self';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'ALL SMOKE TESTS PASSED' as result;
rollback;
