-- =============================================================================
-- GIS sync RPCs, called by the n8n workflow "HT Land – Riverside GIS Parcel Sync"
-- with the service-role key. Not exposed to signed-in users.
--
--   gis_pending_apns(limit)       → Riverside APNs that still need a parcel polygon
--   gis_apply_parcels(rows jsonb) → writes polygons + assessor facts, logs each lookup
--   gis_load_i10_centerline(geojson) → replaces the I-10 centerline, recomputes distances
-- =============================================================================

-- APNs with no polygon yet, skipping ones the county already said it can't find
-- in the last 30 days (so a nightly run doesn't retry dead APNs forever).
create or replace function public.gis_pending_apns(p_limit integer default 500)
returns table (apn text)
language sql stable security definer set search_path = ''
as $$
  select p.apn
    from public.properties p
   where p.county = 'riverside'
     and p.geom is null
     and not exists (
       select 1 from public.enrichment_requests e
        where e.property_id = p.id
          and e.provider = 'gis'
          and e.status = 'failed'
          and e.created_at > now() - interval '30 days')
   order by p.apn
   limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

-- p_rows: [{ apn, geometry (GeoJSON, EPSG:4326) | null, class_code, acreage,
--            situs_address, situs_city, situs_zip, homeowners_exempt, tax_year }]
-- Only fills blanks for descriptive fields (acres, land use, situs); never
-- overwrites values a user or earlier import set. Geometry is always refreshed.
create or replace function public.gis_apply_parcels(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r        jsonb;
  v_id     uuid;
  v_geom   extensions.geometry;
  v_found  integer := 0;
  v_missing integer := 0;
  v_unknown integer := 0;
begin
  perform set_config('app.change_source', 'gis', true);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select id into v_id from public.properties
     where county = 'riverside' and apn = public.normalize_apn(r ->> 'apn');
    if v_id is null then
      v_unknown := v_unknown + 1;
      continue;
    end if;

    v_geom := null;
    if jsonb_typeof(r -> 'geometry') = 'object' then
      begin
        v_geom := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
                    extensions.st_setsrid(extensions.st_geomfromgeojson((r -> 'geometry')::text), 4326)), 3));
        if extensions.st_isempty(v_geom) then v_geom := null; end if;
      exception when others then
        v_geom := null;
      end;
    end if;

    if v_geom is null then
      v_missing := v_missing + 1;
      insert into public.enrichment_requests (property_id, provider, status, params, error, finished_at, requested_by)
      values (v_id, 'gis', 'failed', jsonb_build_object('apn', r ->> 'apn', 'layer', 'Assessor/40'),
              'No parcel polygon returned by Riverside County GIS', now(), null);
      continue;
    end if;

    update public.properties p set
      geom          = v_geom,
      acres         = coalesce(p.acres, nullif(r ->> 'acreage', '')::numeric),
      land_use      = coalesce(p.land_use, nullif(r ->> 'class_code', '')),
      situs_address = coalesce(p.situs_address, nullif(r ->> 'situs_address', '')),
      situs_city    = coalesce(p.situs_city, nullif(r ->> 'situs_city', '')),
      zip           = coalesce(p.zip, nullif(r ->> 'situs_zip', '')),
      -- A homeowner's exemption means the owner lives there: not absentee.
      is_absentee   = case when coalesce((r ->> 'homeowners_exempt')::numeric, 0) > 0 then false else p.is_absentee end
    where p.id = v_id;

    insert into public.enrichment_requests (property_id, provider, status, params, result, finished_at, requested_by)
    values (v_id, 'gis', 'done', jsonb_build_object('apn', r ->> 'apn', 'layer', 'Assessor/40'),
            r - 'geometry', now(), null);
    v_found := v_found + 1;
  end loop;

  return jsonb_build_object('updated', v_found, 'no_polygon', v_missing, 'unknown_apn', v_unknown);
end $$;

-- p_geojson: a GeoJSON LineString / MultiLineString / GeometryCollection /
-- FeatureCollection of I-10 segments in EPSG:4326.
create or replace function public.gis_load_i10_centerline(p_geojson jsonb, p_source text default 'caltrans_shn')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_geom extensions.geometry;
  v_n    integer;
begin
  if p_geojson ->> 'type' = 'FeatureCollection' then
    select extensions.st_union(extensions.st_setsrid(extensions.st_geomfromgeojson((f -> 'geometry')::text), 4326))
      into v_geom
      from jsonb_array_elements(p_geojson -> 'features') f
     where jsonb_typeof(f -> 'geometry') = 'object';
  else
    v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  end if;

  v_geom := extensions.st_multi(extensions.st_collectionextract(v_geom, 2));
  if v_geom is null or extensions.st_isempty(v_geom) then
    raise exception 'No line geometry in payload' using errcode = '22023';
  end if;

  delete from reference.i10_centerline;
  insert into reference.i10_centerline (name, source, geom) values ('I-10', coalesce(p_source, 'caltrans_shn'), v_geom);

  -- The properties trigger re-derives corridor_zone from the new distances.
  v_n := public.recompute_property_geo();

  return jsonb_build_object('vertices', extensions.st_npoints(v_geom),
                            'length_mi', round((extensions.st_length(v_geom::extensions.geography) / 1609.344)::numeric, 1),
                            'properties_recomputed', v_n);
end $$;

revoke all on function public.gis_pending_apns(integer)          from public, anon, authenticated;
revoke all on function public.gis_apply_parcels(jsonb)            from public, anon, authenticated;
revoke all on function public.gis_load_i10_centerline(jsonb, text) from public, anon, authenticated;
grant execute on function public.gis_pending_apns(integer)          to service_role;
grant execute on function public.gis_apply_parcels(jsonb)            to service_role;
grant execute on function public.gis_load_i10_centerline(jsonb, text) to service_role;
