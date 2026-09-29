-- =============================================================================
-- HT Land Acquisitions — functions, triggers, views, RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers (security definer so RLS policies can read profiles without recursion)
-- -----------------------------------------------------------------------------
create or replace function private.user_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function private.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.user_role() = any (roles), false)
$$;

create or replace function private.is_member() returns boolean
language sql stable set search_path = '' as $$ select private.user_role() is not null $$;

create or replace function private.is_admin() returns boolean
language sql stable set search_path = '' as $$ select private.has_role('admin') $$;

-- Admin + Acquisitions: create/edit properties, outreach, imports, offers.
create or replace function private.can_write() returns boolean
language sql stable set search_path = '' as $$ select private.has_role('admin', 'acquisitions') $$;

-- Admin + Acquisitions + Analyst: research fields, notes, tasks, documents.
create or replace function private.can_research() returns boolean
language sql stable set search_path = '' as $$ select private.has_role('admin', 'acquisitions', 'analyst') $$;

-- Where a write came from. Server code sets it per transaction:
--   select set_config('app.change_source', 'import', true);
create or replace function private.change_source() returns text
language sql stable set search_path = ''
as $$ select coalesce(nullif(current_setting('app.change_source', true), ''), 'user') $$;

-- The land-acquisitions tables. Listed explicitly because this project also
-- holds unrelated tables (trucking) that these statements must not touch.
create or replace function private.land_tables() returns text[]
language sql immutable set search_path = ''
as $$ select array[
  'profiles', 'app_settings', 'lead_statuses', 'strategies', 'strategy_rules', 'tags', 'dd_templates',
  'dd_template_items', 'mail_templates', 'provider_settings', 'properties', 'tax_status', 'owners',
  'property_owners', 'contacts', 'do_not_contact', 'notes', 'documents', 'tasks', 'offers',
  'due_diligence_items', 'site_metrics', 'mail_campaigns', 'mail_pieces', 'tracking_numbers',
  'enrichment_requests', 'api_cost_ledger', 'imports', 'import_rows', 'sales_comps', 'saved_views',
  'activities', 'notifications', 'audit_log']::text[] $$;

grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- New users: create a profile. Company-domain users start active as viewers;
-- anyone else is created inactive until an admin turns them on.
-- Emails in app_settings.bootstrap_admin_emails become active admins on first sign-in.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_domain text;
  v_admins text[];
  v_admin  boolean;
begin
  select allowed_email_domain, bootstrap_admin_emails into v_domain, v_admins from public.app_settings where id;
  v_admin := lower(new.email) = any (select lower(unnest(coalesce(v_admins, '{}'))));
  insert into public.profiles (id, email, full_name, avatar_url, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_admin then 'admin' else 'viewer' end::public.app_role,
    v_admin or lower(split_part(new.email, '@', 2)) = lower(coalesce(v_domain, ''))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Only admins change role / activation.
create or replace function private.guard_profile()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active or new.email is distinct from old.email) then
    raise exception 'Only an admin can change role, activation or email' using errcode = '42501';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Columns that change as a side effect and should not create audit noise.
create or replace function private.audit_ignored_columns() returns text[]
language sql immutable set search_path = ''
as $$ select array['updated_at', 'last_activity_at', 'field_sources', 'status_changed_at']::text[] $$;

create or replace function private.audit_trigger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_prop    uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k
      and k <> all (private.audit_ignored_columns());
    if v_changed is null then
      return null;   -- nothing meaningful changed
    end if;
    -- keep only changed fields to keep the log small
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old, v_new
    from unnest(v_changed) k;
  end if;

  -- geometry is large; log that it changed, not the coordinates
  if v_old ? 'geom' then v_old := jsonb_set(v_old, '{geom}', to_jsonb('<geometry>'::text)); end if;
  if v_new ? 'geom' then v_new := jsonb_set(v_new, '{geom}', to_jsonb('<geometry>'::text)); end if;

  v_prop := case when tg_table_name = 'properties' then (v_row ->> 'id')::uuid
                 else (v_row ->> 'property_id')::uuid end;

  insert into public.audit_log (table_name, row_id, property_id, action, changed_fields, old, new, user_id, change_source)
  values (tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'property_id', v_row ->> 'provider', v_row ->> 'key', v_row ->> 'name'),
          v_prop, tg_op, v_changed, v_old, v_new, auth.uid(), private.change_source());
  return null;
end $$;

-- Analyst column allowlist. TG_ARGV = columns an analyst may change on UPDATE.
-- Other roles pass straight through; service-role calls (no auth.uid()) too.
create or replace function private.guard_analyst_columns()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_bad text[];
begin
  if private.user_role() is distinct from 'analyst' then
    return new;
  end if;
  select array_agg(k) into v_bad
  from jsonb_object_keys(v_new) k
  where v_new -> k is distinct from v_old -> k
    and k <> all (tg_argv::text[])
    and k <> all (private.audit_ignored_columns());
  if v_bad is not null then
    raise exception 'Analysts cannot change: %', array_to_string(v_bad, ', ') using errcode = '42501';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- APN helpers
-- -----------------------------------------------------------------------------
create or replace function public.normalize_apn(p_apn text)
returns text
language sql immutable set search_path = ''
as $$ select nullif(regexp_replace(coalesce(p_apn, ''), '[^0-9]', '', 'g'), '') $$;

-- Riverside ###-###-###; San Bernardino ####-###-##(-####); Los Angeles ####-###-###.
create or replace function public.format_apn(p_county public.county_name, p_apn text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_county = 'riverside' and length(p_apn) = 9
      then substr(p_apn, 1, 3) || '-' || substr(p_apn, 4, 3) || '-' || substr(p_apn, 7, 3)
    when p_county = 'san_bernardino' and length(p_apn) in (9, 13)
      then substr(p_apn, 1, 4) || '-' || substr(p_apn, 5, 3) || '-' || substr(p_apn, 8, 2)
           || case when length(p_apn) = 13 then '-' || substr(p_apn, 10, 4) else '' end
    when p_county = 'los_angeles' and length(p_apn) = 10
      then substr(p_apn, 1, 4) || '-' || substr(p_apn, 5, 3) || '-' || substr(p_apn, 8, 3)
    else p_apn
  end
$$;

-- -----------------------------------------------------------------------------
-- Geo: distance to I-10, nearest interchange, corridor zone
-- -----------------------------------------------------------------------------
create or replace function public.corridor_zone_for(p_miles numeric)
returns public.corridor_zone
language sql immutable set search_path = ''
as $$
  select case when p_miles is null then 'other'::public.corridor_zone
              when p_miles <= 2 then 'i10_corridor'::public.corridor_zone
              when p_miles <= 5 then 'i10_near'::public.corridor_zone
              else 'other'::public.corridor_zone end
$$;

-- Measures from the parcel polygon when present (edge distance), else the centroid.
create or replace function private.geo_metrics(p_geom extensions.geometry)
returns table (distance_to_i10_mi numeric, interchange_id uuid, interchange_name text, distance_to_interchange_mi numeric)
language sql stable set search_path = ''
as $$
  select
    (select round((min(extensions.st_distance(p_geom::extensions.geography, c.geom::extensions.geography)) / 1609.344)::numeric, 3)
       from reference.i10_centerline c),
    i.id,
    coalesce('Exit ' || i.exit_number || ' – ', '') || i.name,
    round((extensions.st_distance(p_geom::extensions.geography, i.geom::extensions.geography) / 1609.344)::numeric, 3)
  from (select 1) one
  left join lateral (
    select ic.* from reference.interchanges ic
    order by ic.geom operator(extensions.<->) p_geom
    limit 1
  ) i on true
$$;

create or replace function private.properties_geo()
returns trigger
language plpgsql set search_path = extensions   -- geometry = / <> operators live in extensions
as $$
declare
  m record;
begin
  if new.geom is not null and (tg_op = 'INSERT' or new.geom is distinct from old.geom) then
    new.centroid := extensions.st_pointonsurface(new.geom);
    new.location_method := 'gis_polygon';
  end if;

  if (new.geom is not null or new.centroid is not null)
     and (tg_op = 'INSERT' or new.geom is distinct from old.geom or new.centroid is distinct from old.centroid) then
    select * into m from private.geo_metrics(coalesce(new.geom, new.centroid));
    if m.distance_to_i10_mi is not null then      -- centerline loaded
      new.distance_to_i10_mi := m.distance_to_i10_mi;
    end if;
    if m.interchange_id is not null then
      new.nearest_interchange_id     := m.interchange_id;
      new.nearest_interchange        := m.interchange_name;
      new.distance_to_interchange_mi := m.distance_to_interchange_mi;
    end if;
  end if;

  -- zone always follows distance (PLSS estimates until real polygons arrive)
  new.corridor_zone := public.corridor_zone_for(new.distance_to_i10_mi);
  return new;
end $$;

-- Admin: recompute after loading/replacing the centerline or interchanges.
create or replace function public.recompute_property_geo()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not private.is_admin() and auth.uid() is not null then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  perform set_config('app.change_source', 'system', true);
  update public.properties p
     set distance_to_i10_mi         = coalesce(m.distance_to_i10_mi, p.distance_to_i10_mi),
         nearest_interchange_id     = m.interchange_id,
         nearest_interchange        = m.interchange_name,
         distance_to_interchange_mi = m.distance_to_interchange_mi
    from lateral private.geo_metrics(coalesce(p.geom, p.centroid)) m
   where p.geom is not null or p.centroid is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- Properties: normalization, status gates, provenance, status activity
-- -----------------------------------------------------------------------------
create or replace function private.properties_before()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  st      public.lead_statuses%rowtype;
  v_src   text := private.change_source();
  v_old   jsonb;
  v_new   jsonb;
  v_patch jsonb;
begin
  new.apn := public.normalize_apn(new.apn);

  if tg_op = 'INSERT' or new.lead_status is distinct from old.lead_status then
    select * into st from public.lead_statuses where key = new.lead_status;
    if st.requires_offer and not exists (select 1 from public.offers o where o.property_id = new.id) then
      raise exception 'Status "%" requires an offer record first', st.label using errcode = 'P0001';
    end if;
    if st.requires_contract_doc and not exists (
         select 1 from public.documents d where d.property_id = new.id and d.doc_type = 'contract') then
      raise exception 'Status "%" requires an uploaded contract document first', st.label using errcode = 'P0001';
    end if;
    if st.requires_reason and new.dead_reason is null then
      raise exception 'Status "%" requires a reason', st.label using errcode = 'P0001';
    end if;
    if not st.requires_reason then
      new.dead_reason := null;
      new.dead_reason_note := null;
    end if;
    if tg_op = 'UPDATE' then
      new.status_changed_at := now();
    end if;
  end if;

  -- Field provenance: remember who/what last set each field, so imports can
  -- detect "user-edited" values and ask before overwriting them.
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(k, jsonb_build_object('src', v_src, 'at', now(), 'by', auth.uid()))
      into v_patch
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k
      and k <> all (private.audit_ignored_columns() ||
                    array['centroid', 'distance_to_i10_mi', 'nearest_interchange_id', 'nearest_interchange',
                          'distance_to_interchange_mi', 'corridor_zone']);
    if v_patch is not null then
      new.field_sources := old.field_sources || v_patch;
    end if;
  end if;
  return new;
end $$;

create or replace function private.properties_after_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.activities (type, property_id, direction, summary, payload, created_by)
  values ('status_change', new.id, 'internal',
          coalesce(old.lead_status, '∅') || ' → ' || new.lead_status,
          jsonb_build_object('from', old.lead_status, 'to', new.lead_status,
                             'dead_reason', new.dead_reason, 'source', private.change_source()),
          auth.uid());
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Activities fan-in: notes, documents, last_activity_at, mentions
-- -----------------------------------------------------------------------------
create or replace function private.activity_touch_property()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.property_id is not null then
    update public.properties
       set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.property_id;
  end if;
  return null;
end $$;

create or replace function private.notes_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_apn text;
begin
  insert into public.activities (type, property_id, note_id, direction, summary, created_by)
  values ('note', new.property_id, new.id, 'internal', left(new.body, 280), new.created_by);

  if cardinality(new.mentions) > 0 then
    select public.format_apn(county, apn) into v_apn from public.properties where id = new.property_id;
    insert into public.notifications (user_id, kind, title, body, link, property_id, created_by)
    select m, 'mention',
           coalesce((select full_name from public.profiles where id = new.created_by), 'Someone')
             || ' mentioned you on ' || coalesce(v_apn, 'a property'),
           left(new.body, 280),
           '/properties/' || new.property_id || '?tab=activity#note-' || new.id,
           new.property_id, new.created_by
      from unnest(new.mentions) m
      join public.profiles p on p.id = m and p.is_active
     where m is distinct from new.created_by
       and (new.visibility = 'team' or p.role = 'admin');
  end if;
  return null;
end $$;

create or replace function private.documents_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.activities (type, property_id, document_id, direction, summary, payload, created_by)
  values ('document', new.property_id, new.id, 'internal', 'Uploaded ' || new.file_name,
          jsonb_build_object('doc_type', new.doc_type), new.created_by);
  return null;
end $$;

create or replace function private.tasks_before()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create or replace function private.tasks_notify_assignee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.notifications (user_id, kind, title, body, link, property_id, created_by)
    values (new.assignee_id, 'assigned', 'Task assigned: ' || new.title, new.description,
            coalesce('/properties/' || new.property_id || '?tab=tasks', '/tasks'), new.property_id, auth.uid());
  end if;
  return null;
end $$;

-- Analysts may add contacts but may not record consent / clear DNC.
create or replace function private.contacts_guard_insert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if private.user_role() = 'analyst' then
    new.consent := false;
    new.consent_at := null;
    new.consent_method := null;
    new.dnc_checked_at := null;
    new.dnc_hit := null;
  end if;
  return new;
end $$;

-- Lazily create the due-diligence checklist from the default template.
create or replace function public.ensure_dd_items(p_property_id uuid)
returns setof public.due_diligence_items
language plpgsql security invoker set search_path = ''
as $$
begin
  if private.can_research() then
    insert into public.due_diligence_items (property_id, template_item_id, sort_order, label)
    select p_property_id, ti.id, ti.sort_order, ti.label
      from public.dd_template_items ti
      join public.dd_templates t on t.id = ti.template_id and t.is_default
    on conflict (property_id, template_item_id) do nothing;
  end if;
  return query select * from public.due_diligence_items where property_id = p_property_id order by sort_order;
end $$;

-- -----------------------------------------------------------------------------
-- Enrichment: request → approve/reject (budget hard stop) → service executes → ledger
-- -----------------------------------------------------------------------------
create or replace function public.month_spend(p_provider public.enrichment_provider default null)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
    from public.api_cost_ledger
   where occurred_at >= (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
     and (p_provider is null or provider = p_provider)
$$;

-- Spend already committed = ledger this month + approved/running requests not yet billed.
create or replace function private.committed_spend(p_provider public.enrichment_provider default null)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select public.month_spend(p_provider) + coalesce((
    select sum(estimated_cost) from public.enrichment_requests
     where status in ('approved', 'running') and (p_provider is null or provider = p_provider)), 0)
$$;

create or replace function public.request_enrichment(
  p_provider public.enrichment_provider,
  p_property_id uuid default null,
  p_owner_id uuid default null,
  p_reveal public.reveal_type default 'none',
  p_units integer default 1,
  p_params jsonb default '{}'::jsonb
) returns public.enrichment_requests
language plpgsql security definer set search_path = ''
as $$
declare
  ps  public.provider_settings%rowtype;
  req public.enrichment_requests;
begin
  if not private.can_write() then
    raise exception 'Only Admin or Acquisitions can request enrichment' using errcode = '42501';
  end if;
  select * into ps from public.provider_settings where provider = p_provider;
  if not found or not ps.enabled then
    raise exception 'Provider % is not enabled in Settings', p_provider using errcode = 'P0001';
  end if;
  insert into public.enrichment_requests
    (property_id, owner_id, provider, reveal, params, estimated_cost, estimated_credits, requested_by, created_by,
     status, approved_by, decided_at)
  values
    (p_property_id, p_owner_id, p_provider, p_reveal, p_params,
     coalesce(ps.unit_cost_usd, 0) * greatest(p_units, 1), greatest(p_units, 1), auth.uid(), auth.uid(),
     -- free providers skip the queue
     case when ps.is_paid then 'requested' else 'approved' end::public.enrichment_status,
     case when ps.is_paid then null else auth.uid() end,
     case when ps.is_paid then null else now() end)
  returning * into req;
  return req;
end $$;

create or replace function public.decide_enrichment(p_ids uuid[], p_approve boolean, p_reason text default null)
returns setof public.enrichment_requests
language plpgsql security definer set search_path = ''
as $$
declare
  r        public.enrichment_requests%rowtype;
  ps       public.provider_settings%rowtype;
  cfg      public.app_settings%rowtype;
  v_role   public.app_role := private.user_role();
begin
  select * into cfg from public.app_settings where id;
  for r in select * from public.enrichment_requests where id = any (p_ids) order by created_at for update loop
    if r.status <> 'requested' then
      raise exception 'Request % is already %', r.id, r.status using errcode = 'P0001';
    end if;
    -- Phone reveals and skip trace: Admin only. Other paid calls: Admin or Acquisitions (not own request).
    if v_role is distinct from 'admin' then
      if r.reveal = 'phone' or r.provider = 'skip_trace' then
        raise exception 'Phone reveals and skip trace need Admin approval' using errcode = '42501';
      elsif v_role is distinct from 'acquisitions' or r.requested_by = auth.uid() then
        raise exception 'Not allowed to decide request %', r.id using errcode = '42501';
      end if;
    end if;

    if p_approve then
      select * into ps from public.provider_settings where provider = r.provider;
      if not ps.enabled then
        raise exception 'Provider % is disabled', r.provider using errcode = 'P0001';
      end if;
      if ps.monthly_budget_usd is not null
         and private.committed_spend(r.provider) + r.estimated_cost > ps.monthly_budget_usd then
        raise exception 'Budget stop: % monthly cap $% would be exceeded', r.provider, ps.monthly_budget_usd using errcode = 'P0001';
      end if;
      if private.committed_spend(null) + r.estimated_cost > cfg.overall_monthly_budget_usd then
        raise exception 'Budget stop: overall monthly cap $% would be exceeded', cfg.overall_monthly_budget_usd using errcode = 'P0001';
      end if;
      update public.enrichment_requests
         set status = 'approved', approved_by = auth.uid(), decided_at = now()
       where id = r.id returning * into r;
    else
      update public.enrichment_requests
         set status = 'rejected', approved_by = auth.uid(), decided_at = now(), rejection_reason = p_reason
       where id = r.id returning * into r;
    end if;
    return next r;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Read models
-- -----------------------------------------------------------------------------
-- Grid/table + map source: property + latest tax snapshot + owner/contact rollups.
create or replace view public.property_grid
with (security_invoker = on) as
select
  p.id, p.county, p.apn, public.format_apn(p.county, p.apn) as apn_display,
  p.situs_address, p.situs_city, p.zip, p.acres, p.zoning, p.zoning_verified, p.land_use,
  p.land_value, p.structure_value, p.asking_price, p.source_list,
  p.distance_to_i10_mi, p.nearest_interchange, p.distance_to_interchange_mi, p.location_method,
  p.corridor_zone, p.strategy, p.tags, p.lead_status, p.status_changed_at, p.assignee_id,
  a.full_name as assignee_name, p.priority,
  p.ev_score, p.big_rig_access_score, p.alt_use_score, p.overall_score,
  p.is_vacant, p.is_absentee, p.is_entity_owner, p.dnc_flag,
  p.last_activity_at, p.created_at, p.updated_at,
  extensions.st_y(p.centroid) as lat, extensions.st_x(p.centroid) as lng,
  t.years_in_default, t.redemption_amount, t.owed_to_land_ratio, t.power_to_sell_date,
  t.auction_status, t.auction_date,
  o.owner_names, coalesce(o.owner_count, 0) as owner_count,
  coalesce(c.has_phone, false) as has_phone, coalesce(c.has_email, false) as has_email,
  nt.next_task_title, nt.next_task_due
from public.properties p
left join public.profiles a on a.id = p.assignee_id
left join lateral (
  select ts.* from public.tax_status ts where ts.property_id = p.id
  order by ts.snapshot_date desc limit 1
) t on true
left join lateral (
  select string_agg(ow.name, '; ' order by po.ownership_pct desc nulls last) as owner_names,
         count(*) as owner_count
  from public.property_owners po join public.owners ow on ow.id = po.owner_id
  where po.property_id = p.id
) o on true
left join lateral (
  select bool_or(ct.phone is not null and not ct.do_not_contact) as has_phone,
         bool_or(ct.email is not null and not ct.do_not_contact) as has_email
  from public.property_owners po join public.contacts ct on ct.owner_id = po.owner_id
  where po.property_id = p.id
) c on true
left join lateral (
  select tk.title as next_task_title, tk.due_date as next_task_due
  from public.tasks tk
  where tk.property_id = p.id and tk.status <> 'done'
  order by tk.due_date nulls last, tk.priority
  limit 1
) nt on true;

-- Global search: APN, address, owner name, contact phone/email.
create or replace function public.search_global(q text, lim integer default 20)
returns table (kind text, id uuid, property_id uuid, label text, sublabel text)
language sql stable security invoker set search_path = ''
as $$
  with term as (
    select trim(q) as t, public.normalize_apn(q) as digits
  )
  (select 'property', p.id, p.id, public.format_apn(p.county, p.apn),
          concat_ws(', ', p.situs_address, p.situs_city)
     from public.properties p, term
    where (length(term.digits) >= 3 and p.apn like term.digits || '%')
       or p.situs_address ilike '%' || term.t || '%'
    limit lim)
  union all
  (select 'owner', ow.id, po.property_id, ow.name, ow.mailing_city
     from public.owners ow
     left join lateral (select property_id from public.property_owners where owner_id = ow.id limit 1) po on true,
     term
    where ow.name_normalized like '%' || lower(regexp_replace(term.t, '[^A-Za-z0-9]+', ' ', 'g')) || '%'
    limit lim)
  union all
  (select 'contact', ct.id, po.property_id, coalesce(ct.name, ct.email, ct.phone), concat_ws(' · ', ct.phone, ct.email)
     from public.contacts ct
     left join lateral (select property_id from public.property_owners where owner_id = ct.owner_id limit 1) po on true,
     term
    where (length(term.digits) >= 4 and ct.phone_e164 like '%' || term.digits || '%')
       or ct.email ilike '%' || term.t || '%'
    limit lim)
$$;

-- -----------------------------------------------------------------------------
-- Attach triggers
-- -----------------------------------------------------------------------------
-- updated_at on every table that has it
do $$
declare t record;
begin
  for t in
    select c.table_schema, c.table_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
       and ((c.table_schema = 'public' and c.table_name = any (private.land_tables()))
            or c.table_schema = 'reference')
  loop
    execute format('create trigger b00_set_updated_at before update on %I.%I
                    for each row execute function private.set_updated_at()', t.table_schema, t.table_name);
  end loop;
end $$;

-- audit on every business table (not the log itself, notifications or staged import rows)
do $$
declare t text;
begin
  foreach t in array array(select unnest(private.land_tables())
                           except select unnest(array['audit_log', 'notifications', 'import_rows']))
  loop
    execute format('create trigger z_audit after insert or update or delete on public.%I
                    for each row execute function private.audit_trigger()', t);
  end loop;
end $$;

create trigger a10_guard_profile before update on public.profiles
  for each row execute function private.guard_profile();

-- properties: analyst allowlist → normalize/gates/provenance → geo
create trigger a10_guard_analyst before update on public.properties
  for each row execute function private.guard_analyst_columns(
    'situs_address', 'situs_city', 'zip', 'legal_description', 'plss_section', 'plss_township', 'plss_range',
    'acres', 'zoning', 'zoning_hint', 'zoning_verified', 'zoning_verified_value', 'zoning_verified_source',
    'zoning_verified_at', 'land_use', 'property_description', 'tags', 'why_this_property',
    'is_vacant', 'is_absentee', 'is_entity_owner', 'geom', 'centroid', 'location_method',
    'distance_to_i10_mi', 'nearest_interchange_id', 'nearest_interchange', 'distance_to_interchange_mi',
    'corridor_zone', 'ev_score', 'big_rig_access_score', 'alt_use_score', 'overall_score');
create trigger b10_properties_before before insert or update on public.properties
  for each row execute function private.properties_before();
create trigger b20_properties_geo before insert or update on public.properties
  for each row execute function private.properties_geo();
create trigger c10_properties_status after update of lead_status on public.properties
  for each row when (old.lead_status is distinct from new.lead_status)
  execute function private.properties_after_status();

create trigger a10_guard_analyst before update on public.contacts
  for each row execute function private.guard_analyst_columns(
    'owner_id', 'name', 'title', 'phone', 'phone_e164', 'phone_type', 'email', 'source', 'verified', 'notes');
create trigger a20_contacts_guard_insert before insert on public.contacts
  for each row execute function private.contacts_guard_insert();

create trigger c10_notes_after_insert after insert on public.notes
  for each row execute function private.notes_after_insert();
create trigger c10_documents_after_insert after insert on public.documents
  for each row execute function private.documents_after_insert();
create trigger b10_tasks_before before insert or update on public.tasks
  for each row execute function private.tasks_before();
create trigger c10_tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function private.tasks_notify_assignee();
create trigger c10_activity_touch after insert on public.activities
  for each row execute function private.activity_touch_property();

-- Big-Rig score = sum of components
create or replace function private.site_metrics_score()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.properties
     set big_rig_access_score = case when coalesce(new.br_interchange, new.br_route_quality,
                                                   new.br_both_directions, new.br_pull_through) is null then null
                                     else coalesce(new.br_interchange, 0) + coalesce(new.br_route_quality, 0)
                                        + coalesce(new.br_both_directions, 0) + coalesce(new.br_pull_through, 0) end
   where id = new.property_id;
  return null;
end $$;
create trigger c10_site_metrics_score after insert or update on public.site_metrics
  for each row execute function private.site_metrics_score();
