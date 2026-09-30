-- Nearest anchor stores: only list ones within 25 mi (a store 90 mi away isn't "nearby").
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
                order by x.geom operator(extensions.<->) pts.c limit 6) a
        where a.mi <= 25) as anchors,
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
