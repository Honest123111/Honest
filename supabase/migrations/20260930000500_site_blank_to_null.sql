-- ArcGIS identify returns " " for unclassified areas (e.g. LRA land with no
-- fire hazard class). Store those as null so "not in a mapped zone" reads right.
create or replace function private.site_feasibility_blanks()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.zoning_county       := nullif(btrim(new.zoning_county), '');
  new.gp_land_use         := nullif(btrim(new.gp_land_use), '');
  new.gp_foundation       := nullif(btrim(new.gp_foundation), '');
  new.specific_plan       := nullif(btrim(new.specific_plan), '');
  new.fire_hazard         := nullif(btrim(new.fire_hazard), '');
  new.fire_sra            := nullif(btrim(new.fire_sra), '');
  new.liquefaction        := nullif(btrim(new.liquefaction), '');
  new.mshcp_criteria_cell := nullif(btrim(new.mshcp_criteria_cell), '');
  new.airport_influence   := nullif(btrim(new.airport_influence), '');
  new.water_district      := nullif(btrim(new.water_district), '');
  new.farmland            := nullif(btrim(new.farmland), '');
  new.flood_zone          := nullif(btrim(new.flood_zone), '');
  return new;
end $$;

create trigger b10_site_feasibility_blanks before insert or update on public.site_feasibility
  for each row execute function private.site_feasibility_blanks();

-- Clean rows already written (the trigger normalizes them on this no-op update).
update public.site_feasibility set fire_hazard = fire_hazard where true;
