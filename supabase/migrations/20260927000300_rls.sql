-- =============================================================================
-- HT Land Acquisitions — Row Level Security
--
--   Viewer        read everything (except private notes of others)
--   Analyst       + research fields on properties (column allowlist trigger), owners,
--                   contacts (no consent/DNC), notes, tasks, documents, DD, site metrics
--   Acquisitions  + create/edit properties, tax, offers, outreach, imports, request enrichment
--   Admin         + settings, users, reference layers, delete
--
-- Inactive profiles and anonymous users get nothing: every policy goes through
-- private.user_role(), which returns null unless the profile is active.
-- Service role (Edge Functions, n8n webhook) bypasses RLS by design.
-- =============================================================================

-- Enable RLS on every table in public + reference.
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'reference') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;

-- Shorthand generator: read = member, insert/update = <writer>, delete = admin.
create or replace function private.std_policies(p_table text, p_writer text)
returns void
language plpgsql set search_path = ''
as $$
begin
  execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (private.is_member())', p_table);
  execute format('create policy "%1$s: %2$s insert" on public.%1$I for insert to authenticated with check (private.%2$s())', p_table, p_writer);
  execute format('create policy "%1$s: %2$s update" on public.%1$I for update to authenticated using (private.%2$s()) with check (private.%2$s())', p_table, p_writer);
  execute format('create policy "%1$s: admin delete" on public.%1$I for delete to authenticated using (private.is_admin())', p_table);
end $$;

-- Settings / lookups: admin writes
do $$ begin perform private.std_policies(t, 'is_admin') from unnest(array[
  'app_settings', 'lead_statuses', 'strategies', 'strategy_rules', 'dd_templates', 'dd_template_items',
  'mail_templates', 'provider_settings']) t; end $$;

-- Acquisitions + admin
do $$ begin perform private.std_policies(t, 'can_write') from unnest(array[
  'properties', 'tax_status', 'offers', 'mail_campaigns', 'mail_pieces', 'tracking_numbers',
  'do_not_contact', 'imports', 'import_rows', 'sales_comps', 'tags']) t; end $$;

-- Analyst + acquisitions + admin
do $$ begin perform private.std_policies(t, 'can_research') from unnest(array[
  'owners', 'property_owners', 'contacts', 'tasks', 'documents', 'due_diligence_items', 'site_metrics']) t; end $$;

-- Analysts need UPDATE on properties for research fields; the column allowlist
-- trigger (a10_guard_analyst) blocks everything else.
create policy "properties: analyst update" on public.properties
  for update to authenticated using (private.has_role('analyst')) with check (private.has_role('analyst'));

-- profiles: members read; you edit yourself (role/is_active guarded by trigger); admin edits anyone
create policy "profiles: members read" on public.profiles
  for select to authenticated using (private.is_member() or id = auth.uid());
create policy "profiles: self update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin update" on public.profiles
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- notes: private notes visible to author + admin; authors edit their own
create policy "notes: read" on public.notes for select to authenticated
  using (private.is_member() and (visibility = 'team' or created_by = auth.uid() or private.is_admin()));
create policy "notes: insert" on public.notes for insert to authenticated
  with check (private.can_research() and created_by = auth.uid());
create policy "notes: author update" on public.notes for update to authenticated
  using (created_by = auth.uid() and private.can_research()) with check (created_by = auth.uid());
create policy "notes: admin update" on public.notes for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "notes: delete" on public.notes for delete to authenticated
  using (private.is_admin() or (created_by = auth.uid() and private.can_research()));

-- activities: log calls/visits as analyst+; authors fix their own; triage of inbound = can_write
create policy "activities: members read" on public.activities for select to authenticated
  using (private.is_member() and (note_id is null or exists (select 1 from public.notes n where n.id = note_id)));
create policy "activities: insert" on public.activities for insert to authenticated
  with check (private.can_research() and created_by = auth.uid()
              and type in ('call', 'sms', 'email', 'site_visit', 'mail_sent', 'offer'));
create policy "activities: author update" on public.activities for update to authenticated
  using (created_by = auth.uid() and private.can_research()) with check (created_by = auth.uid());
create policy "activities: triage update" on public.activities for update to authenticated
  using (private.can_write()) with check (private.can_write());
create policy "activities: admin delete" on public.activities for delete to authenticated
  using (private.is_admin());

-- enrichment: read by members; create/decide only through RPCs (request_enrichment, decide_enrichment);
-- status transitions after approval are done by Edge Functions with the service role.
create policy "enrichment: members read" on public.enrichment_requests for select to authenticated
  using (private.is_member());

-- cost ledger: read-only for members (budget meter); written by service role only
create policy "ledger: members read" on public.api_cost_ledger for select to authenticated
  using (private.is_member());

-- saved views: own + shared
create policy "saved_views: read" on public.saved_views for select to authenticated
  using (private.is_member() and (user_id = auth.uid() or shared));
create policy "saved_views: insert" on public.saved_views for insert to authenticated
  with check (private.is_member() and user_id = auth.uid() and (not shared or private.can_research()));
create policy "saved_views: update" on public.saved_views for update to authenticated
  using (user_id = auth.uid() or private.is_admin()) with check (user_id = auth.uid() or private.is_admin());
create policy "saved_views: delete" on public.saved_views for delete to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- notifications: yours only; you can mark read
create policy "notifications: own read" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications: own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: read-only for members (History tab); written only by the audit trigger
create policy "audit: members read" on public.audit_log for select to authenticated
  using (private.is_member());

-- reference layers: members read, admin writes
do $$
declare t text;
begin
  foreach t in array array['i10_centerline', 'interchanges', 'truck_aadt_points'] loop
    execute format('create policy "%1$s: members read" on reference.%1$I for select to authenticated using (private.is_member())', t);
    execute format('create policy "%1$s: admin write" on reference.%1$I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t);
  end loop;
end $$;

-- Table privileges (RLS still applies). anon gets nothing.
grant usage on schema reference to authenticated, service_role;
grant select on all tables in schema reference to authenticated;
grant insert, update, delete on all tables in schema reference to authenticated;
grant all on all tables in schema reference to service_role;
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

-- Direct writes that must go through RPCs / service role only
revoke insert, update, delete on public.enrichment_requests from authenticated;
revoke insert, update, delete on public.api_cost_ledger from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, delete on public.notifications from authenticated;

-- -----------------------------------------------------------------------------
-- Storage: private bucket, path = {property_id}/{uuid}-{filename}
-- imports bucket: path = {import_id}/{filename}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('property-files', 'property-files', false, 52428800),
       ('imports', 'imports', false, 52428800)
on conflict (id) do nothing;

create policy "property-files: members read" on storage.objects for select to authenticated
  using (bucket_id = 'property-files' and private.is_member());
create policy "property-files: research upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-files' and private.can_research()
              and exists (select 1 from public.properties p where p.id::text = (storage.foldername(name))[1]));
create policy "property-files: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-files' and private.is_admin());

create policy "imports: writer read" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and private.can_write());
create policy "imports: writer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and private.can_write());
