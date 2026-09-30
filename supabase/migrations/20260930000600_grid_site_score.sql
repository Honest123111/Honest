-- Show the site feasibility score in the Properties table (sortable).
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
  nt.next_task_title, nt.next_task_due,
  sf.feasibility_score as site_score
from public.properties p
left join public.site_feasibility sf on sf.property_id = p.id
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
