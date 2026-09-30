-- Storm drain lines inside a bounding box (max 4,000), as GeoJSON for the map.
create or replace function public.map_storm_drains(p_west float8, p_south float8, p_east float8, p_north float8)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.is_member() then jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
    jsonb_build_object('type', 'Feature', 'geometry', extensions.st_asgeojson(x.geom, 6)::jsonb,
      'properties', jsonb_build_object('owner', x.owner, 'diameter', x.diameter, 'source', x.source))), '[]'::jsonb)) end
    from (select * from reference.storm_drains
           where geom operator(extensions.&&) extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
           limit 4000) x
$$;

revoke all on function public.map_storm_drains(float8, float8, float8, float8) from public, anon;
grant execute on function public.map_storm_drains(float8, float8, float8, float8) to authenticated;
