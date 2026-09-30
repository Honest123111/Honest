-- =============================================================================
-- Site feasibility: what surrounds each parcel (terrain, utilities, hazards,
-- commercial activity, nearby development) and a 0–10 development-feasibility
-- score built from it. All inputs are free public data:
--
--   County of Riverside GIS (identify)  zoning, general plan, fire hazard, fault
--                                        zone, liquefaction, MSHCP criteria cell,
--                                        airport influence, water district, specific plan
--   USGS 3DEP elevation                 slope + elevation stats over the parcel polygon
--   FEMA NFHL (Esri public copy)        flood zone
--   County PLUS cases                   planning / development cases within 3 mi
--   RCFC + city storm drains            reference.storm_drains (nearest line)
--   OpenStreetMap                       reference.pois (Costco, big-box, restaurants…)
--
-- n8n workflows (service-role key) write the raw facts; the database derives
-- distances, counts, the comps estimate and the score so they can be recomputed
-- whenever a reference layer or the weights change.
-- =============================================================================

-- --- reference layers --------------------------------------------------------
create table reference.pois (
  id        bigserial primary key,
  osm_type  text   not null,
  osm_id    bigint not null,
  category  text   not null check (category in ('anchor', 'grocery', 'restaurant', 'fuel', 'shopping', 'commercial_area', 'industrial_area')),
  brand     text,
  name      text,
  geom      extensions.geometry(Point, 4326) not null,
  unique (osm_type, osm_id)
);
create index pois_gix on reference.pois using gist (geom);
create index pois_category_idx on reference.pois (category);

create table reference.storm_drains (
  id        bigserial primary key,
  source    text not null,              -- 'rcfc_facilities' | 'city_storm_drains'
  owner     text,
  diameter  text,
  geom      extensions.geometry(MultiLineString, 4326) not null
);
create index storm_drains_gix on reference.storm_drains using gist (geom);

alter table reference.pois enable row level security;
alter table reference.storm_drains enable row level security;
create policy "pois: members read" on reference.pois for select to authenticated using (private.is_member());
create policy "storm_drains: members read" on reference.storm_drains for select to authenticated using (private.is_member());
grant select on reference.pois, reference.storm_drains to authenticated;
grant all on reference.pois, reference.storm_drains to service_role;
grant usage, select on all sequences in schema reference to service_role;

-- --- per-property facts + score ----------------------------------------------
create table public.site_feasibility (
  property_id            uuid primary key references public.properties (id) on delete cascade,
  -- terrain (USGS 3DEP over the parcel polygon)
  slope_mean_deg         numeric(5,1),
  slope_max_deg          numeric(5,1),
  elev_min_ft            numeric(7,0),
  elev_max_ft            numeric(7,0),
  -- county identify
  zoning_county          text,
  gp_land_use            text,
  gp_foundation          text,
  specific_plan          text,
  fire_hazard            text,          -- VERY HIGH | HIGH | MODERATE | null (not mapped)
  fire_sra               text,
  fault_zone             boolean,
  liquefaction           text,
  mshcp_criteria_cell    text,          -- cell label when the parcel is in a Western Riverside MSHCP criteria cell
  airport_influence      text,
  water_district         text,
  farmland               text,
  -- FEMA
  flood_zone             text,          -- A, AE, AO, AH, X (shaded) … or null = outside mapped hazard area
  flood_sfha             boolean,
  -- nearby development (county PLUS cases, last 3 years, within 3 mi)
  dev_cases_3mi          integer,
  dev_cases              jsonb not null default '[]'::jsonb,
  -- derived in the database from reference layers
  storm_drain_mi         numeric(6,2),
  anchors_5mi            integer,
  restaurants_3mi        integer,
  grocery_3mi            integer,
  fuel_3mi               integer,
  nearest_anchors        jsonb not null default '[]'::jsonb,   -- [{name, brand, mi}] closest big-box / anchor stores
  -- comps estimate (public.sales_comps)
  comps_n                integer,
  comps_radius_mi        numeric(4,1),
  est_price_per_acre     numeric(12,2),
  est_value              numeric(14,2),
  -- score
  feasibility_score      numeric(4,1) check (feasibility_score between 0 and 10),
  score_components       jsonb not null default '{}'::jsonb,
  -- bookkeeping
  fetched_at             timestamptz,   -- when n8n last pulled the external facts
  computed_at            timestamptz,
  fetch_errors           jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index site_feasibility_score_idx on public.site_feasibility (feasibility_score desc nulls last);
create trigger b00_set_updated_at before update on public.site_feasibility
  for each row execute function private.set_updated_at();

alter table public.site_feasibility enable row level security;
revoke all on public.site_feasibility from anon;
create policy "site_feasibility: members read" on public.site_feasibility
  for select to authenticated using (private.is_member());
grant select on public.site_feasibility to authenticated;

-- Default weights (Settings can override under scoring_weights.feasibility).
update public.app_settings
   set scoring_weights = scoring_weights || jsonb_build_object('feasibility', jsonb_build_object(
         'terrain', 2.0, 'utilities', 2.0, 'hazards', 2.0, 'access', 1.5, 'commercial', 1.5, 'momentum', 1.0))
 where id and not (scoring_weights ? 'feasibility');

-- --- scoring -------------------------------------------------------------------
-- Each factor scores 0–1; factors with no data are left out (and reported), so a
-- parcel isn't punished for a layer that doesn't cover it. Result is scaled to 0–10.
create or replace function private.feasibility_score(s public.site_feasibility, p public.properties, w jsonb)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  c   jsonb := '{}'::jsonb;
  num numeric := 0;
  den numeric := 0;
  f   numeric;
  k   text;
  v_haz numeric;
begin
  -- Terrain: flat (≤3° mean slope) = 1, steep hillside (≥25°) = 0.
  if s.slope_mean_deg is not null then
    c := c || jsonb_build_object('terrain', greatest(0, least(1, 1 - (s.slope_mean_deg - 3) / 22.0)));
  end if;

  -- Utilities: inside a water district, and a storm drain close by.
  -- (Sewer mains aren't published countywide; see docs.)
  if s.fetched_at is not null then
    f := case when s.water_district is not null then 0.6 else 0 end;
    if s.storm_drain_mi is not null then
      f := f + 0.4 * greatest(0, least(1, 1 - (s.storm_drain_mi - 0.1) / 1.9));
    end if;
    c := c || jsonb_build_object('utilities', f);
  end if;

  -- Hazards / constraints: start at 1, subtract per constraint.
  if s.fetched_at is not null then
    v_haz := 1;
    v_haz := v_haz - case upper(coalesce(s.fire_hazard, '')) when 'VERY HIGH' then 0.4 when 'HIGH' then 0.25 when 'MODERATE' then 0.1 else 0 end;
    if s.flood_sfha then v_haz := v_haz - 0.35; end if;
    if s.fault_zone then v_haz := v_haz - 0.3; end if;
    v_haz := v_haz - case when s.liquefaction ilike '%very high%' or s.liquefaction ilike 'high%' then 0.15
                          when s.liquefaction ilike '%moderate%' then 0.05 else 0 end;
    if s.mshcp_criteria_cell is not null then v_haz := v_haz - 0.3; end if;
    if s.airport_influence is not null then v_haz := v_haz - 0.05; end if;
    c := c || jsonb_build_object('hazards', greatest(0, v_haz));
  end if;

  -- Access: nearest freeway interchange, 1 at ≤1 mi → 0 at ≥15 mi.
  f := coalesce(p.distance_to_interchange_mi, p.distance_to_i10_mi);
  if f is not null then
    c := c || jsonb_build_object('access', greatest(0, least(1, 1 - (f - 1) / 14.0)));
  end if;

  -- Commercial activity: anchors within 5 mi, restaurants + grocery within 3 mi.
  if s.anchors_5mi is not null then
    c := c || jsonb_build_object('commercial',
      0.5 * least(1, s.anchors_5mi / 3.0) + 0.3 * least(1, coalesce(s.restaurants_3mi, 0) / 30.0)
      + 0.2 * least(1, coalesce(s.grocery_3mi, 0) / 2.0));
  end if;

  -- Development momentum: planning cases within 3 mi in the last 3 years.
  if s.dev_cases_3mi is not null then
    c := c || jsonb_build_object('momentum', least(1, s.dev_cases_3mi / 15.0));
  end if;

  for k in select jsonb_object_keys(c) loop
    num := num + (c ->> k)::numeric * coalesce((w ->> k)::numeric, 0);
    den := den + coalesce((w ->> k)::numeric, 0);
  end loop;

  return jsonb_build_object(
    'score', case when den > 0 then round(num / den * 10, 1) end,
    'components', (select coalesce(jsonb_object_agg(key, round(value::text::numeric, 2)), '{}'::jsonb) from jsonb_each(c)),
    'weights', w,
    'factors_used', (select count(*) from jsonb_object_keys(c)),
    'factors_total', 6);
end $$;

-- Recompute derived fields + score for the given properties.
create or replace function private.site_compute(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_w jsonb;
  n   integer;
begin
  select coalesce(scoring_weights -> 'feasibility', '{}'::jsonb) into v_w from public.app_settings where id;
  v_w := jsonb_build_object('terrain', 2.0, 'utilities', 2.0, 'hazards', 2.0, 'access', 1.5, 'commercial', 1.5, 'momentum', 1.0)
         || coalesce(v_w, '{}'::jsonb);

  insert into public.site_feasibility (property_id)
  select id from public.properties where id = any (p_ids)
  on conflict (property_id) do nothing;

  with pts as (
    select p.id, coalesce(p.centroid, extensions.st_pointonsurface(p.geom)) as c, p.acres
      from public.properties p
     where p.id = any (p_ids) and (p.geom is not null or p.centroid is not null)
  ), d as (
    select pts.id,
      (select round((min(extensions.st_distance(pts.c::extensions.geography, sd.geom::extensions.geography)) / 1609.344)::numeric, 2)
         from (select geom from reference.storm_drains order by geom operator(extensions.<->) pts.c limit 5) sd) as storm_mi,
      case when exists (select 1 from reference.pois) then (
        select count(*) from reference.pois x
         where x.category = 'anchor' and extensions.st_dwithin(x.geom, pts.c, 0.1)
           and extensions.st_distance(x.geom::extensions.geography, pts.c::extensions.geography) <= 8046.72) end as anchors_5,
      case when exists (select 1 from reference.pois) then (
        select count(*) from reference.pois x
         where x.category = 'restaurant' and extensions.st_dwithin(x.geom, pts.c, 0.06)
           and extensions.st_distance(x.geom::extensions.geography, pts.c::extensions.geography) <= 4828.03) end as rest_3,
      case when exists (select 1 from reference.pois) then (
        select count(*) from reference.pois x
         where x.category = 'grocery' and extensions.st_dwithin(x.geom, pts.c, 0.06)
           and extensions.st_distance(x.geom::extensions.geography, pts.c::extensions.geography) <= 4828.03) end as groc_3,
      case when exists (select 1 from reference.pois) then (
        select count(*) from reference.pois x
         where x.category = 'fuel' and extensions.st_dwithin(x.geom, pts.c, 0.06)
           and extensions.st_distance(x.geom::extensions.geography, pts.c::extensions.geography) <= 4828.03) end as fuel_3,
      (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'brand', a.brand, 'mi', a.mi) order by a.mi), '[]'::jsonb)
         from (select x.name, x.brand,
                      round((extensions.st_distance(x.geom::extensions.geography, pts.c::extensions.geography) / 1609.344)::numeric, 1) as mi
                 from reference.pois x where x.category = 'anchor'
                order by x.geom operator(extensions.<->) pts.c limit 6) a) as anchors,
      comps.n, comps.radius, comps.ppa, pts.acres
    from pts
    left join lateral (
      -- Median $/acre of land sales in the last 3 years: within 5 mi, else 10 mi; needs ≥3 comps.
      select r.radius, r.n, r.ppa from (
        select rad as radius, count(*) as n,
               percentile_cont(0.5) within group (order by sc.sale_price / sc.acres) as ppa
          from unnest(array[5, 10]) rad
          join public.sales_comps sc
            on sc.centroid is not null and sc.sale_price > 0 and sc.acres > 0
           and sc.sale_date >= current_date - interval '3 years'
           and extensions.st_dwithin(sc.centroid::extensions.geography, pts.c::extensions.geography, rad * 1609.344)
           and (pts.acres is null or sc.acres between pts.acres / 5 and pts.acres * 5)
         group by rad) r
       where r.n >= 3 order by r.radius limit 1
    ) comps on true
  )
  update public.site_feasibility s set
    storm_drain_mi     = d.storm_mi,
    anchors_5mi        = d.anchors_5,
    restaurants_3mi    = d.rest_3,
    grocery_3mi        = d.groc_3,
    fuel_3mi           = d.fuel_3,
    nearest_anchors    = d.anchors,
    comps_n            = d.n,
    comps_radius_mi    = d.radius,
    est_price_per_acre = round(d.ppa::numeric, 2),
    est_value          = round((d.ppa * d.acres)::numeric, 2)
  from d where s.property_id = d.id;

  -- (An UPDATE can't pass its own target row to a FROM-clause function, so use a row subquery.)
  update public.site_feasibility s set
    score_components = (select private.feasibility_score(s, p, v_w) from public.properties p where p.id = s.property_id),
    computed_at      = now()
  where s.property_id = any (p_ids);
  update public.site_feasibility s set
    feasibility_score = (s.score_components ->> 'score')::numeric
  where s.property_id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- --- RPCs for n8n (service role only) ------------------------------------------
-- Properties that need external facts: never fetched, or older than p_max_age_days.
create or replace function public.site_pending(p_limit integer default 500, p_max_age_days integer default 90)
returns table (property_id uuid, apn text, lon float8, lat float8, polygon jsonb)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.apn,
         extensions.st_x(coalesce(p.centroid, extensions.st_pointonsurface(p.geom))),
         extensions.st_y(coalesce(p.centroid, extensions.st_pointonsurface(p.geom))),
         case when p.geom is not null
              then extensions.st_asgeojson(extensions.st_simplifypreservetopology(p.geom, 0.00002), 6)::jsonb end
    from public.properties p
    left join public.site_feasibility s on s.property_id = p.id
   where p.county = 'riverside'
     and (p.geom is not null or p.centroid is not null)
     and (s.fetched_at is null or s.fetched_at < now() - make_interval(days => greatest(coalesce(p_max_age_days, 90), 1)))
   order by s.fetched_at nulls first, p.apn
   limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

-- p_rows: [{ property_id, slope_mean_deg, slope_max_deg, elev_min_ft, elev_max_ft, zoning_county,
--            gp_land_use, gp_foundation, specific_plan, fire_hazard, fire_sra, fault_zone, liquefaction,
--            mshcp_criteria_cell, airport_influence, water_district, farmland, flood_zone, flood_sfha,
--            dev_cases_3mi, dev_cases, errors }]
create or replace function public.site_apply(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  n     integer;
begin
  create temp table _site_rows on commit drop as
  select (x ->> 'property_id')::uuid as property_id, x
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where exists (select 1 from public.properties p where p.id = (x ->> 'property_id')::uuid);

  insert into public.site_feasibility (property_id)
  select property_id from pg_temp._site_rows
  on conflict (property_id) do nothing;

  -- A key missing from a row means that lookup failed: keep the previous value.
  update public.site_feasibility s set
    slope_mean_deg      = case when r.x ? 'slope_mean_deg' then (r.x ->> 'slope_mean_deg')::numeric else s.slope_mean_deg end,
    slope_max_deg       = case when r.x ? 'slope_max_deg' then (r.x ->> 'slope_max_deg')::numeric else s.slope_max_deg end,
    elev_min_ft         = case when r.x ? 'elev_min_ft' then (r.x ->> 'elev_min_ft')::numeric else s.elev_min_ft end,
    elev_max_ft         = case when r.x ? 'elev_max_ft' then (r.x ->> 'elev_max_ft')::numeric else s.elev_max_ft end,
    zoning_county       = case when r.x ? 'zoning_county' then (r.x ->> 'zoning_county') else s.zoning_county end,
    gp_land_use         = case when r.x ? 'gp_land_use' then (r.x ->> 'gp_land_use') else s.gp_land_use end,
    gp_foundation       = case when r.x ? 'gp_foundation' then (r.x ->> 'gp_foundation') else s.gp_foundation end,
    specific_plan       = case when r.x ? 'specific_plan' then (r.x ->> 'specific_plan') else s.specific_plan end,
    fire_hazard         = case when r.x ? 'fire_hazard' then (r.x ->> 'fire_hazard') else s.fire_hazard end,
    fire_sra            = case when r.x ? 'fire_sra' then (r.x ->> 'fire_sra') else s.fire_sra end,
    fault_zone          = case when r.x ? 'fault_zone' then (r.x ->> 'fault_zone')::boolean else s.fault_zone end,
    liquefaction        = case when r.x ? 'liquefaction' then (r.x ->> 'liquefaction') else s.liquefaction end,
    mshcp_criteria_cell = case when r.x ? 'mshcp_criteria_cell' then (r.x ->> 'mshcp_criteria_cell') else s.mshcp_criteria_cell end,
    airport_influence   = case when r.x ? 'airport_influence' then (r.x ->> 'airport_influence') else s.airport_influence end,
    water_district      = case when r.x ? 'water_district' then (r.x ->> 'water_district') else s.water_district end,
    farmland            = case when r.x ? 'farmland' then (r.x ->> 'farmland') else s.farmland end,
    flood_zone          = case when r.x ? 'flood_zone' then (r.x ->> 'flood_zone') else s.flood_zone end,
    flood_sfha          = case when r.x ? 'flood_sfha' then (r.x ->> 'flood_sfha')::boolean else s.flood_sfha end,
    dev_cases_3mi       = case when r.x ? 'dev_cases_3mi' then (r.x ->> 'dev_cases_3mi')::integer else s.dev_cases_3mi end,
    dev_cases           = case when r.x ? 'dev_cases' then r.x -> 'dev_cases' else s.dev_cases end,
    fetch_errors        = coalesce(r.x -> 'errors', '[]'::jsonb),
    fetched_at          = now()
  from pg_temp._site_rows r
  where s.property_id = r.property_id;

  select array_agg(property_id) into v_ids from pg_temp._site_rows;
  n := private.site_compute(coalesce(v_ids, '{}'));
  return jsonb_build_object('written', coalesce(array_length(v_ids, 1), 0), 'scored', n);
end $$;

-- Replace / append OSM points of interest. p_rows: [{osm_type, osm_id, category, brand, name, lon, lat}]
create or replace function public.site_load_pois(p_rows jsonb, p_reset boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_reset then delete from reference.pois where true; end if;
  insert into reference.pois (osm_type, osm_id, category, brand, name, geom)
  select x ->> 'osm_type', (x ->> 'osm_id')::bigint, x ->> 'category', nullif(x ->> 'brand', ''), nullif(x ->> 'name', ''),
         extensions.st_setsrid(extensions.st_makepoint((x ->> 'lon')::float8, (x ->> 'lat')::float8), 4326)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where x ? 'lon' and x ? 'lat'
  on conflict (osm_type, osm_id) do update set
    category = excluded.category, brand = excluded.brand, name = excluded.name, geom = excluded.geom;
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n, 'total', (select count(*) from reference.pois));
end $$;

-- Replace one source's storm drains page by page. p_rows: [{owner, diameter, paths: [[[lon,lat],…],…]}]
create or replace function public.site_load_storm_drains(p_source text, p_rows jsonb, p_reset boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_reset then delete from reference.storm_drains where source = p_source; end if;
  insert into reference.storm_drains (source, owner, diameter, geom)
  select p_source, nullif(x ->> 'owner', ''), nullif(x ->> 'diameter', ''),
         extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(
           jsonb_build_object('type', 'MultiLineString', 'coordinates', x -> 'paths')::text), 4326))
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where jsonb_typeof(x -> 'paths') = 'array' and jsonb_array_length(x -> 'paths') > 0;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n, 'source_total', (select count(*) from reference.storm_drains where source = p_source));
end $$;

-- Recompute every fetched property in slices (PostgREST caps a call at 8 s).
create or replace function public.site_recompute_batch(p_bucket integer, p_buckets integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_buckets is null or p_buckets < 1 or p_bucket is null or p_bucket < 0 or p_bucket >= p_buckets then
    raise exception 'bad bucket % of %', p_bucket, p_buckets using errcode = '22023';
  end if;
  n := private.site_compute(array(
    select property_id from public.site_feasibility
     where fetched_at is not null and abs(hashtext(property_id::text)) % p_buckets = p_bucket));
  return jsonb_build_object('bucket', p_bucket, 'recomputed', n);
end $$;

revoke all on function public.site_pending(integer, integer)             from public, anon, authenticated;
revoke all on function public.site_apply(jsonb)                          from public, anon, authenticated;
revoke all on function public.site_load_pois(jsonb, boolean)             from public, anon, authenticated;
revoke all on function public.site_load_storm_drains(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.site_recompute_batch(integer, integer)     from public, anon, authenticated;
grant execute on function public.site_pending(integer, integer)             to service_role;
grant execute on function public.site_apply(jsonb)                          to service_role;
grant execute on function public.site_load_pois(jsonb, boolean)             to service_role;
grant execute on function public.site_load_storm_drains(text, jsonb, boolean) to service_role;
grant execute on function public.site_recompute_batch(integer, integer)     to service_role;

-- --- map RPCs (signed-in members) -------------------------------------------------
-- All mapped properties as one GeoJSON FeatureCollection (a single jsonb value, so
-- PostgREST's 1,000-row cap doesn't apply). Polygons are simplified for display.
create or replace function public.map_properties()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.is_member() then jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
    jsonb_build_object(
      'type', 'Feature',
      'id', p.id,
      'geometry', extensions.st_asgeojson(coalesce(extensions.st_simplifypreservetopology(p.geom, 0.00003), p.centroid), 6)::jsonb,
      'properties', jsonb_build_object(
        'id', p.id, 'apn', p.apn, 'county', p.county, 'acres', p.acres, 'situs', p.situs_address, 'city', p.situs_city,
        'land_use', p.land_use, 'zone', p.corridor_zone, 'status', p.lead_status,
        'i10_mi', p.distance_to_i10_mi, 'score', s.feasibility_score,
        'lon', extensions.st_x(coalesce(p.centroid, extensions.st_pointonsurface(p.geom))),
        'lat', extensions.st_y(coalesce(p.centroid, extensions.st_pointonsurface(p.geom))))
    )), '[]'::jsonb)) end
    from public.properties p
    left join public.site_feasibility s on s.property_id = p.id
   where p.geom is not null or p.centroid is not null
$$;

-- Points of interest inside a bounding box (max 3,000), as GeoJSON.
create or replace function public.map_pois(p_west float8, p_south float8, p_east float8, p_north float8)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.is_member() then jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
    jsonb_build_object('type', 'Feature', 'geometry', extensions.st_asgeojson(x.geom, 6)::jsonb,
      'properties', jsonb_build_object('name', x.name, 'brand', x.brand, 'category', x.category))), '[]'::jsonb)) end
    from (select * from reference.pois
           where geom operator(extensions.&&) extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
           order by case category when 'anchor' then 0 when 'grocery' then 1 when 'shopping' then 2 else 3 end
           limit 3000) x
$$;

-- Comparable land sales near a property (for the Site tab).
create or replace function public.property_nearby_comps(p_property_id uuid, p_radius_mi numeric default 10)
returns table (id uuid, apn text, sale_date date, sale_price numeric, acres numeric, price_per_acre numeric,
               situs_city text, zoning text, source text, distance_mi numeric)
language sql stable security definer set search_path = ''
as $$
  select sc.id, sc.apn, sc.sale_date, sc.sale_price, sc.acres,
         case when sc.acres > 0 then round(sc.sale_price / sc.acres, 0) end,
         sc.situs_city, sc.zoning, sc.source,
         round((extensions.st_distance(sc.centroid::extensions.geography, c.pt::extensions.geography) / 1609.344)::numeric, 1)
    from (select coalesce(p.centroid, extensions.st_pointonsurface(p.geom)) as pt
            from public.properties p where p.id = p_property_id and private.is_member()) c
    join public.sales_comps sc
      on sc.centroid is not null
     and extensions.st_dwithin(sc.centroid::extensions.geography, c.pt::extensions.geography, least(coalesce(p_radius_mi, 10), 25) * 1609.344)
   order by sc.sale_date desc nulls last
   limit 50
$$;

revoke all on function public.map_properties() from public, anon;
revoke all on function public.map_pois(float8, float8, float8, float8) from public, anon;
revoke all on function public.property_nearby_comps(uuid, numeric) from public, anon;
grant execute on function public.map_properties() to authenticated;
grant execute on function public.map_pois(float8, float8, float8, float8) to authenticated;
grant execute on function public.property_nearby_comps(uuid, numeric) to authenticated;
