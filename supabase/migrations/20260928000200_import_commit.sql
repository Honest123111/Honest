-- =============================================================================
-- Import commit: applies planned import_rows in batches, as the calling user
-- (RLS applies), with change_source = 'import' so the audit log and field
-- provenance show where each value came from.
-- =============================================================================

alter table public.import_rows add column committed_at timestamptz;
create index import_rows_pending_idx on public.import_rows (import_id, row_number) where committed_at is null;

-- Record provenance on INSERT too, so values typed into a manually created
-- property count as user-edited when a later import disagrees with them.
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
  v_skip  text[] := private.audit_ignored_columns() ||
                    array['id', 'county', 'apn', 'created_at', 'created_by', 'centroid', 'distance_to_i10_mi',
                          'nearest_interchange_id', 'nearest_interchange', 'distance_to_interchange_mi', 'corridor_zone'];
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

  -- Field provenance: who/what last set each field. Imports use it to ask
  -- before overwriting user-edited values.
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  select jsonb_object_agg(k, jsonb_build_object('src', v_src, 'at', now(), 'by', auth.uid()))
    into v_patch
  from jsonb_object_keys(v_new) k
  where v_new -> k is distinct from v_old -> k
    and v_new -> k <> 'null'::jsonb
    and k <> all (v_skip);
  if v_patch is not null then
    new.field_sources := coalesce(case when tg_op = 'UPDATE' then old.field_sources end, '{}'::jsonb) || v_patch;
  end if;
  return new;
end $$;

-- Timeline entry for an imported/updated property (activities of type 'import'
-- aren't insertable by users directly).
create or replace function private.log_import_activity(p_property_id uuid, p_import_id uuid, p_summary text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.activities (type, property_id, import_id, direction, summary, created_by)
  select 'import', p_property_id, p_import_id, 'internal', p_summary, auth.uid()
  where private.can_write()
$$;

-- Columns an import may write on public.properties.
create or replace function private.importable_property_columns() returns text[]
language sql immutable set search_path = ''
as $$ select array[
  'situs_address', 'situs_city', 'zip', 'legal_description', 'tax_rate_area', 'map_book', 'thomas_bros_page',
  'thomas_bros_grid', 'acres', 'zoning', 'land_use', 'property_description', 'land_value', 'structure_value',
  'asking_price', 'mortgages_note', 'distance_to_i10_mi', 'location_method', 'is_vacant', 'is_absentee',
  'is_entity_owner', 'strategy', 'lead_status', 'source_list', 'source_year', 'county', 'apn']::text[] $$;

grant execute on function private.log_import_activity(uuid, uuid, text) to authenticated;
grant execute on function private.importable_property_columns() to authenticated;

/*
 * import_rows.mapped holds the planned row written by the preview step:
 *   { county, apn, source_list, source_year, changes:{col:val}, conflicts:{col:{current,incoming}},
 *     tax:{…}|null, owners:[{name, owner_type, mailing_*, ownership_pct}], contacts:[{owner_index, phone, email}],
 *     note, comp:{…}|null }
 * import_rows.conflict_resolution = {col: 'overwrite' | 'keep'}; conflicts default to keep.
 */
create or replace function public.commit_import(p_import_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  imp        public.imports%rowtype;
  r          public.import_rows%rowtype;
  plan       jsonb;
  v_changes  jsonb;
  v_prop     uuid;
  v_cols     text;
  v_set      text;
  v_owner    uuid;
  v_owner_ids uuid[];
  o          jsonb;
  c          jsonb;
  v_contact_source public.contact_source;
  n_created  integer := 0;
  n_updated  integer := 0;
  n_comps    integer := 0;
  v_remaining integer;
  v_allowed  text[] := private.importable_property_columns();
begin
  if not private.can_write() then
    raise exception 'Only Admin or Acquisitions can commit imports' using errcode = '42501';
  end if;
  select * into imp from public.imports where id = p_import_id for update;
  if not found then
    raise exception 'Import % not found', p_import_id using errcode = 'P0002';
  end if;
  if imp.status not in ('previewed', 'committing') then
    raise exception 'Import is %, preview it first', imp.status using errcode = 'P0001';
  end if;

  perform set_config('app.change_source', 'import', true);
  v_contact_source := case when imp.source_type in ('tax_default_inventory', 'delinquent_list', 'assessment_roll')
                           then 'county' else 'manual' end;
  update public.imports set status = 'committing' where id = p_import_id;

  for r in
    select * from public.import_rows
     where import_id = p_import_id and committed_at is null and action in ('create', 'update', 'conflict')
     order by row_number
     limit greatest(1, least(p_limit, 1000))
  loop
    plan := r.mapped;

    -- comps file: sales_comps only, never properties
    if imp.source_type = 'sold_comps' then
      if plan -> 'comp' is not null and jsonb_typeof(plan -> 'comp') = 'object' then
        insert into public.sales_comps (county, apn, sale_date, sale_price, acres, situs_city, zoning, source, import_id)
        values ((plan ->> 'county')::public.county_name, plan ->> 'apn', (plan -> 'comp' ->> 'sale_date')::date,
                (plan -> 'comp' ->> 'sale_price')::numeric, (plan -> 'comp' ->> 'acres')::numeric,
                plan -> 'comp' ->> 'situs_city', plan -> 'comp' ->> 'zoning', imp.file_name, p_import_id);
        n_comps := n_comps + 1;
      end if;
      update public.import_rows set committed_at = now() where id = r.id;
      continue;
    end if;

    -- planned changes + conflicts the user chose to overwrite, limited to importable columns
    select coalesce(plan -> 'changes', '{}'::jsonb) || coalesce(jsonb_object_agg(e.key, plan -> 'conflicts' -> e.key -> 'incoming'), '{}'::jsonb)
      into v_changes
      from jsonb_each_text(coalesce(r.conflict_resolution, '{}'::jsonb)) e
     where e.value = 'overwrite' and (plan -> 'conflicts') ? e.key;
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_changes
      from jsonb_each(v_changes) where key = any (v_allowed) and key not in ('county', 'apn');

    -- re-resolve at commit time: another import may have created it since the preview
    v_prop := r.property_id;
    if v_prop is null then
      select p.id into v_prop from public.properties p
       where p.county = (plan ->> 'county')::public.county_name and p.apn = plan ->> 'apn';
    end if;

    if v_prop is null then
      v_changes := v_changes || jsonb_strip_nulls(jsonb_build_object(
        'county', plan ->> 'county', 'apn', plan ->> 'apn',
        'source_list', plan ->> 'source_list', 'source_year', plan -> 'source_year'));
      -- only early pipeline stages can be imported
      if v_changes ->> 'lead_status' is not null
         and v_changes ->> 'lead_status' not in ('new', 'researching', 'owner_found', 'contact_attempted', 'in_conversation') then
        v_changes := v_changes - 'lead_status';
      end if;
      select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(v_changes) k;
      execute format('insert into public.properties (%s) select %s from jsonb_populate_record(null::public.properties, $1) returning id',
                     v_cols, v_cols)
        into v_prop using v_changes;
      n_created := n_created + 1;
      perform private.log_import_activity(v_prop, p_import_id, 'Created by import: ' || imp.file_name);
    else
      v_changes := v_changes - 'lead_status' - 'strategy' - 'source_list' - 'source_year';   -- never move an existing lead
      if v_changes <> '{}'::jsonb then
        select string_agg(format('%I = r.%I', k, k), ', ') into v_set from jsonb_object_keys(v_changes) k;
        execute format('update public.properties p set %s from jsonb_populate_record(null::public.properties, $1) r where p.id = $2',
                       v_set)
          using v_changes, v_prop;
      end if;
      n_updated := n_updated + 1;
      perform private.log_import_activity(v_prop, p_import_id,
        'Updated by import: ' || imp.file_name ||
        case when v_changes <> '{}'::jsonb
             then ' (' || (select string_agg(k, ', ') from jsonb_object_keys(v_changes) k) || ')' else '' end);
    end if;

    -- tax snapshot (history; one row per property/date/source)
    if jsonb_typeof(plan -> 'tax') = 'object' then
      insert into public.tax_status (property_id, snapshot_date, source, power_to_sell_date, years_in_default,
                                     advalorem, specials, redemption_amount, owed_to_land_ratio, import_id)
      select v_prop, t.snapshot_date, t.source, t.power_to_sell_date, t.years_in_default,
             t.advalorem, t.specials, t.redemption_amount, t.owed_to_land_ratio, p_import_id
        from jsonb_populate_record(null::public.tax_status, plan -> 'tax') t
      on conflict (property_id, snapshot_date, source) do update
        set power_to_sell_date = excluded.power_to_sell_date, years_in_default = excluded.years_in_default,
            advalorem = excluded.advalorem, specials = excluded.specials,
            redemption_amount = excluded.redemption_amount, owed_to_land_ratio = excluded.owed_to_land_ratio,
            import_id = excluded.import_id;
    end if;

    -- owners: same normalized name + same mailing address = same owner (portfolio sellers link up)
    v_owner_ids := '{}';
    for o in select * from jsonb_array_elements(coalesce(plan -> 'owners', '[]'::jsonb)) loop
      v_owner := null;
      select ow.id into v_owner from public.owners ow
       where ow.merged_into_id is null
         and ow.name_normalized = lower(regexp_replace(o ->> 'name', '[^A-Za-z0-9]+', ' ', 'g'))
         and upper(regexp_replace(coalesce(ow.mailing_address, ''), '[^A-Za-z0-9]', '', 'g'))
           = upper(regexp_replace(coalesce(o ->> 'mailing_address', ''), '[^A-Za-z0-9]', '', 'g'))
       limit 1;
      if v_owner is null then
        insert into public.owners (name, owner_type, mailing_address, mailing_city, mailing_state, mailing_zip, source)
        values (o ->> 'name', coalesce(o ->> 'owner_type', 'unknown')::public.owner_type, o ->> 'mailing_address',
                o ->> 'mailing_city', o ->> 'mailing_state', o ->> 'mailing_zip', 'import:' || imp.source_type)
        returning id into v_owner;
      else
        update public.owners
           set mailing_city  = coalesce(mailing_city, o ->> 'mailing_city'),
               mailing_state = coalesce(mailing_state, o ->> 'mailing_state'),
               mailing_zip   = coalesce(mailing_zip, o ->> 'mailing_zip')
         where id = v_owner
           and (mailing_city is null or mailing_state is null or mailing_zip is null);
      end if;
      insert into public.property_owners (property_id, owner_id, role, ownership_pct)
      values (v_prop, v_owner, 'owner', (o ->> 'ownership_pct')::numeric)
      on conflict (property_id, owner_id, role) do update
        set ownership_pct = coalesce(excluded.ownership_pct, public.property_owners.ownership_pct);
      v_owner_ids := v_owner_ids || v_owner;
    end loop;

    -- contacts (additive; skip if this owner already has the phone/email)
    for c in select * from jsonb_array_elements(coalesce(plan -> 'contacts', '[]'::jsonb)) loop
      v_owner := v_owner_ids[(c ->> 'owner_index')::integer + 1];
      continue when v_owner is null or (c ->> 'phone' is null and c ->> 'email' is null);
      if not exists (
        select 1 from public.contacts ct
         where ct.owner_id = v_owner
           and ((c ->> 'phone' is not null
                 and right(regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g'), 10)
                   = right(regexp_replace(c ->> 'phone', '\D', '', 'g'), 10))
             or (c ->> 'email' is not null and lower(ct.email) = lower(c ->> 'email')))) then
        insert into public.contacts (owner_id, phone, email, source)
        values (v_owner, c ->> 'phone', c ->> 'email', v_contact_source);
      end if;
    end loop;

    -- notes column → a pinned-free team note (once)
    if nullif(plan ->> 'note', '') is not null
       and not exists (select 1 from public.notes n where n.property_id = v_prop and n.body = plan ->> 'note') then
      insert into public.notes (property_id, body, created_by) values (v_prop, plan ->> 'note', auth.uid());
    end if;

    update public.import_rows set committed_at = now(), property_id = v_prop where id = r.id;
  end loop;

  select count(*) into v_remaining from public.import_rows
   where import_id = p_import_id and committed_at is null and action in ('create', 'update', 'conflict');

  update public.imports
     set status = case when v_remaining = 0 then 'committed'::public.import_status else 'committing'::public.import_status end,
         committed_at = case when v_remaining = 0 then now() else committed_at end
   where id = p_import_id;

  return jsonb_build_object('created', n_created, 'updated', n_updated, 'comps', n_comps, 'remaining', v_remaining);
end $$;

grant execute on function public.commit_import(uuid, integer) to authenticated;
revoke execute on function public.commit_import(uuid, integer) from anon, public;
