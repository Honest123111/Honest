-- =============================================================================
-- I-10 reference data, loaded by the n8n workflow "HT Land – I-10 Centerline &
-- Interchanges" with the service-role key:
--   gis_load_i10_reference(centerline, interchanges) → replaces the Caltrans I-10
--       centerline and upserts the I-10 exits (OSM)
--   gis_recompute_geo_batch(bucket, buckets) → recomputes distance / nearest exit /
--       corridor zone for one slice of properties
--
-- PostgREST caps each call at 8 s and recomputing ~2.6k properties (with their
-- triggers + audit rows) takes longer, so the workflow recomputes in buckets.
-- Interchanges are upserted in place so their ids stay stable: deleting them
-- would cascade (ON DELETE SET NULL) into an update of every property.
--
-- p_centerline:   GeoJSON FeatureCollection of I-10 line segments (EPSG:4326)
-- p_interchanges: [{ exit_number, name, county, lon, lat }]
-- =============================================================================
create or replace function public.gis_load_i10_reference(p_centerline jsonb, p_interchanges jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_line    extensions.geometry;
  v_upd     integer := 0;
  v_ins     integer := 0;
  v_del     integer := 0;
begin
  perform set_config('app.change_source', 'gis', true);

  select extensions.st_multi(extensions.st_collectionextract(extensions.st_union(
           extensions.st_setsrid(extensions.st_geomfromgeojson((f -> 'geometry')::text), 4326)), 2))
    into v_line
    from jsonb_array_elements(coalesce(p_centerline -> 'features', '[]'::jsonb)) f
   where jsonb_typeof(f -> 'geometry') = 'object';

  if v_line is null or extensions.st_isempty(v_line) then
    raise exception 'No I-10 line geometry in payload' using errcode = '22023';
  end if;
  -- Sanity check: statewide I-10 is ~243 mi, so anything under 100 mi is a partial download.
  if extensions.st_length(v_line::extensions.geography) / 1609.344 < 100 then
    raise exception 'I-10 centerline looks truncated (% mi)',
      round((extensions.st_length(v_line::extensions.geography) / 1609.344)::numeric, 1) using errcode = '22023';
  end if;

  delete from reference.i10_centerline where true;  -- pg_safeupdate (PostgREST) rejects a bare DELETE
  insert into reference.i10_centerline (name, source, geom) values ('I-10', 'caltrans_shn', v_line);

  if jsonb_array_length(coalesce(p_interchanges, '[]'::jsonb)) > 0 then
    create temp table _ic on commit drop as
    select nullif(i ->> 'exit_number', '') as exit_number,
           coalesce(nullif(i ->> 'name', ''), 'Exit ' || coalesce(i ->> 'exit_number', '?')) as name,
           case lower(i ->> 'county') when 'riverside' then 'riverside'::public.county_name
                                      when 'san bernardino' then 'san_bernardino'::public.county_name
                                      when 'los angeles' then 'los_angeles'::public.county_name end as county,
           extensions.st_setsrid(extensions.st_makepoint((i ->> 'lon')::float8, (i ->> 'lat')::float8), 4326) as geom
      from jsonb_array_elements(p_interchanges) i
     where i ? 'lon' and i ? 'lat';

    -- Same exit = same county + exit number (or same name when unnumbered).
    update reference.interchanges ic
       set name = x.name, geom = x.geom
      from pg_temp._ic x
     where ic.route = 'I-10'
       and ic.county is not distinct from x.county
       and ic.exit_number is not distinct from x.exit_number
       and (x.exit_number is not null or ic.name = x.name);
    get diagnostics v_upd = row_count;

    insert into reference.interchanges (route, exit_number, name, county, geom)
    select 'I-10', x.exit_number, x.name, x.county, x.geom
      from pg_temp._ic x
     where not exists (
       select 1 from reference.interchanges ic
        where ic.route = 'I-10'
          and ic.county is not distinct from x.county
          and ic.exit_number is not distinct from x.exit_number
          and (x.exit_number is not null or ic.name = x.name));
    get diagnostics v_ins = row_count;

    delete from reference.interchanges ic
     where ic.route = 'I-10'
       and not exists (
         select 1 from pg_temp._ic x
          where ic.county is not distinct from x.county
            and ic.exit_number is not distinct from x.exit_number
            and (x.exit_number is not null or ic.name = x.name));
    get diagnostics v_del = row_count;
  end if;

  return jsonb_build_object(
    'centerline_mi', round((extensions.st_length(v_line::extensions.geography) / 1609.344)::numeric, 1),
    'interchanges_updated', v_upd, 'interchanges_added', v_ins, 'interchanges_removed', v_del);
end $$;

revoke all on function public.gis_load_i10_reference(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gis_load_i10_reference(jsonb, jsonb) to service_role;

-- Recompute distance / nearest exit / corridor zone for one slice of properties.
-- The workflow calls bucket 0..p_buckets-1; each slice stays well under 8 s.
create or replace function public.gis_recompute_geo_batch(p_bucket integer, p_buckets integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if p_buckets is null or p_buckets < 1 or p_bucket is null or p_bucket < 0 or p_bucket >= p_buckets then
    raise exception 'bad bucket % of %', p_bucket, p_buckets using errcode = '22023';
  end if;
  perform set_config('app.change_source', 'system', true);
  update public.properties p
     set (distance_to_i10_mi, nearest_interchange_id, nearest_interchange, distance_to_interchange_mi) =
         (select coalesce(m.distance_to_i10_mi, p.distance_to_i10_mi), m.interchange_id,
                 m.interchange_name, m.distance_to_interchange_mi
            from private.geo_metrics(coalesce(p.geom, p.centroid)) m)
   where (p.geom is not null or p.centroid is not null)
     and abs(hashtext(p.id::text)) % p_buckets = p_bucket;
  get diagnostics n = row_count;
  return jsonb_build_object('bucket', p_bucket, 'recomputed', n);
end $$;

revoke all on function public.gis_recompute_geo_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.gis_recompute_geo_batch(integer, integer) to service_role;

-- Fix: an UPDATE can't reference its target table from a FROM-clause LATERAL
-- ("invalid reference to FROM-clause entry for table p"). Use a row subquery.
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
     set (distance_to_i10_mi, nearest_interchange_id, nearest_interchange, distance_to_interchange_mi) =
         (select coalesce(m.distance_to_i10_mi, p.distance_to_i10_mi), m.interchange_id,
                 m.interchange_name, m.distance_to_interchange_mi
            from private.geo_metrics(coalesce(p.geom, p.centroid)) m)
   where p.geom is not null or p.centroid is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Superseded by gis_load_i10_reference (and its bare DELETE is rejected by
-- pg_safeupdate when called through PostgREST).
drop function if exists public.gis_load_i10_centerline(jsonb, text);

-- Label exits "Exit 93 – Main St", or just "Exit 93" when OSM has no destination
-- (was "Exit 93 – Exit 93").
create or replace function private.geo_metrics(p_geom extensions.geometry)
returns table (distance_to_i10_mi numeric, interchange_id uuid, interchange_name text, distance_to_interchange_mi numeric)
language sql stable set search_path = ''
as $$
  select
    (select round((min(extensions.st_distance(p_geom::extensions.geography, c.geom::extensions.geography)) / 1609.344)::numeric, 3)
       from reference.i10_centerline c),
    i.id,
    case when i.exit_number is null then i.name
         when i.name is null or i.name = 'Exit ' || i.exit_number then 'Exit ' || i.exit_number
         else 'Exit ' || i.exit_number || ' – ' || i.name end,
    round((extensions.st_distance(p_geom::extensions.geography, i.geom::extensions.geography) / 1609.344)::numeric, 3)
  from (select 1) one
  left join lateral (
    select ic.* from reference.interchanges ic
    order by ic.geom operator(extensions.<->) p_geom
    limit 1
  ) i on true
$$;
