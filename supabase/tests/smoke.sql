-- Smoke test for schema, triggers and RLS. Runs in a transaction and rolls back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
-- Every block raises on failure; success prints "ALL SMOKE TESTS PASSED".
begin;

-- users ----------------------------------------------------------------------
update public.app_settings set bootstrap_admin_emails = array['Boss@HonestTransportation.com'];
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000b', 'acq@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000c', 'analyst@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer@honesttransportation.com'),
  ('00000000-0000-0000-0000-00000000000e', 'stranger@gmail.com'),
  ('00000000-0000-0000-0000-00000000000f', 'boss@honesttransportation.com');
update public.profiles set role = 'admin'        where email like 'admin@%';
update public.profiles set role = 'acquisitions' where email like 'acq@%';
update public.profiles set role = 'analyst'      where email like 'analyst@%';

do $$ begin
  assert (select is_active from public.profiles where email = 'stranger@gmail.com') = false, 'off-domain user must start inactive';
  assert (select is_active from public.profiles where email = 'viewer@honesttransportation.com'), 'company user must start active';
  assert (select role from public.profiles where email = 'boss@honesttransportation.com') = 'admin', 'bootstrap admin promoted';
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

-- inactive users can't read spend
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  assert public.month_spend() is null, 'inactive user must not see spend';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

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


-- 11. import commit: create, dedupe on re-import, conflicts keep user edits unless overwritten
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.imports (id, file_name, source_type, status)
values ('33333333-3333-3333-3333-333333333333', 'leads.xlsx', 'i10_leads_workbook', 'previewed');
insert into public.import_rows (import_id, row_number, apn, action, raw, mapped) values
  ('33333333-3333-3333-3333-333333333333', 2, '821210008', 'create', '{}', '{
     "county":"riverside","apn":"821210008","source_list":"tax_default","source_year":2025,
     "changes":{"situs_city":"Blythe","acres":75.74,"strategy":"large_vacant","lead_status":"offer_made","id":"x"},
     "conflicts":{},
     "tax":{"snapshot_date":"2025-10-01","source":"leads","years_in_default":3.5,"redemption_amount":1200},
     "owners":[{"name":"Wells Road LLC","owner_type":"entity","mailing_address":"1 Main St","ownership_pct":60},
               {"name":"Ann Lee","owner_type":"individual","mailing_address":"1 Main St","ownership_pct":40}],
     "contacts":[{"owner_index":1,"phone":"760-555-0199","email":null}],
     "note":"Gas, electric and water on site"}'),
  ('33333333-3333-3333-3333-333333333333', 3, '836121003', 'conflict', '{}', '{
     "county":"riverside","apn":"836121003","changes":{"situs_city":"Blythe"},
     "conflicts":{"zoning":{"current":"M1","incoming":"C-1"}},"owners":[],"contacts":[],"tax":null,"note":null}');
update public.import_rows set property_id = '11111111-1111-1111-1111-111111111111' where row_number = 3;
do $$
declare res jsonb; p public.properties;
begin
  res := public.commit_import('33333333-3333-3333-3333-333333333333');
  assert (res ->> 'created')::int = 1 and (res ->> 'updated')::int = 1 and (res ->> 'remaining')::int = 0, res::text;
  select * into p from public.properties where apn = '821210008';
  assert p.acres = 75.74 and p.strategy = 'large_vacant', 'created with planned fields';
  assert p.lead_status = 'new', 'late-stage status from a file is ignored';
  assert p.field_sources -> 'acres' ->> 'src' = 'import', 'provenance = import';
  assert (select count(*) from public.property_owners where property_id = p.id) = 2, 'co-owners linked';
  assert (select ownership_pct from public.property_owners po join public.owners o on o.id = po.owner_id
           where po.property_id = p.id and o.name = 'Ann Lee') = 40, 'ownership pct';
  assert (select count(*) from public.contacts where phone_e164 = '+17605550199') = 1, 'contact';
  assert (select count(*) from public.tax_status where property_id = p.id) = 1, 'tax snapshot';
  assert exists (select 1 from public.notes where property_id = p.id and body like 'Gas%'), 'note';
  assert exists (select 1 from public.activities where property_id = p.id and type = 'import'), 'import activity';
  assert exists (select 1 from public.audit_log where property_id = p.id and change_source = 'import'), 'audited as import';
  -- conflict defaulted to keep: zoning unchanged, non-conflicting change applied
  select * into p from public.properties where id = '11111111-1111-1111-1111-111111111111';
  assert p.zoning = 'M1' and p.situs_city = 'Blythe', 'conflict kept, change applied';
  assert (select status from public.imports where id = '33333333-3333-3333-3333-333333333333') = 'committed', 'status';
end $$;

-- re-import the same parcels: no duplicates; overwrite resolution applies; owners/contacts not duplicated
insert into public.imports (id, file_name, source_type, status)
values ('44444444-4444-4444-4444-444444444444', 'leads2.xlsx', 'i10_leads_workbook', 'previewed');
insert into public.import_rows (import_id, row_number, apn, action, raw, mapped, conflict_resolution) values
  ('44444444-4444-4444-4444-444444444444', 2, '821210008', 'create', '{}', '{
     "county":"riverside","apn":"821210008","changes":{"acres":80},"conflicts":{},
     "owners":[{"name":"WELLS ROAD, LLC","owner_type":"entity","mailing_address":"1 Main St.","ownership_pct":null}],
     "contacts":[],"tax":null,"note":"Gas, electric and water on site"}', null),
  ('44444444-4444-4444-4444-444444444444', 3, '836121003', 'conflict', '{}', '{
     "county":"riverside","apn":"836121003","changes":{},
     "conflicts":{"zoning":{"current":"M1","incoming":"C-1"}},"owners":[],"contacts":[],"tax":null,"note":null}',
     '{"zoning":"overwrite"}');
update public.import_rows set property_id = '11111111-1111-1111-1111-111111111111'
 where import_id = '44444444-4444-4444-4444-444444444444' and row_number = 3;
do $$
declare res jsonb;
begin
  res := public.commit_import('44444444-4444-4444-4444-444444444444');
  assert (res ->> 'created')::int = 0 and (res ->> 'updated')::int = 2, 'stale "create" resolves to the existing parcel: ' || res::text;
  assert (select count(*) from public.properties where apn = '821210008') = 1, 'no duplicate APN';
  assert (select acres from public.properties where apn = '821210008') = 80, 'import value refreshed';
  assert (select zoning from public.properties where id = '11111111-1111-1111-1111-111111111111') = 'C-1', 'overwrite applied';
  assert (select count(*) from public.owners where name_normalized = 'wells road llc') = 1, 'owner matched, not duplicated';
  assert (select ownership_pct from public.property_owners po join public.owners o on o.id = po.owner_id
           where o.name_normalized = 'wells road llc') = 60, 'null pct keeps existing';
  assert (select count(*) from public.notes where body like 'Gas%') = 1, 'note not duplicated';
end $$;

-- viewers and analysts cannot commit imports
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin
    perform public.commit_import('44444444-4444-4444-4444-444444444444');
    raise exception 'analyst committed an import';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'ALL SMOKE TESTS PASSED' as result;
rollback;
