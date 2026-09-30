-- Also retry parcels whose last fetch hit an error (e.g. a USGS 502), a day later,
-- instead of waiting out the full refresh interval.
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
     and (s.fetched_at is null
          or s.fetched_at < now() - make_interval(days => greatest(coalesce(p_max_age_days, 90), 1))
          or (jsonb_array_length(s.fetch_errors) > 0 and s.fetched_at < now() - interval '1 day'))
   order by s.fetched_at nulls first, p.apn
   limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;
