-- Home dashboard counters in one round trip. Security invoker: RLS applies.
-- "Stale" = an open lead someone is working (past New, or assigned) with no
-- activity for app_settings.stale_lead_days — untouched New parcels from the
-- county lists would otherwise drown the alert.
create or replace function public.dashboard_stats()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with cfg as (select * from public.app_settings where id),
  bounds as (
    select (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as m0,
           (date_trunc('month', now() at time zone 'America/Los_Angeles') - interval '1 month') at time zone 'America/Los_Angeles' as m_prev
  )
  select jsonb_build_object(
    'total',       (select count(*) from public.properties),
    'corridor',    (select count(*) from public.properties where corridor_zone = 'i10_corridor'),
    'near',        (select count(*) from public.properties where corridor_zone = 'i10_near'),
    'by_status',   (select coalesce(jsonb_object_agg(lead_status, n), '{}'::jsonb)
                      from (select lead_status, count(*) n from public.properties group by 1) s),
    'by_strategy', (select coalesce(jsonb_object_agg(coalesce(strategy, 'unclassified'), n), '{}'::jsonb)
                      from (select strategy, count(*) n from public.properties group by 1) s),
    'with_owner',  (select count(distinct property_id) from public.property_owners),
    'contacted_7d',(select count(distinct property_id) from public.activities
                     where type in ('call', 'sms', 'email', 'mail_sent') and direction = 'outbound'
                       and occurred_at > now() - interval '7 days'),
    'offers_out',  (select count(*) from public.offers where status in ('sent', 'countered')),
    'auction_soon',(select count(distinct t.property_id) from public.tax_status t, cfg
                     where t.auction_date between current_date and current_date + cfg.auction_alert_days),
    'stale',       (select count(*) from public.properties p
                      join public.lead_statuses s on s.key = p.lead_status, cfg
                     where not s.is_terminal
                       and (p.lead_status <> 'new' or p.assignee_id is not null)
                       and coalesce(p.last_activity_at, p.created_at) < now() - make_interval(days => cfg.stale_lead_days)),
    'pending_approvals', (select count(*) from public.enrichment_requests where status = 'requested'),
    'spend_month',      (select coalesce(sum(cost_usd), 0) from public.api_cost_ledger, bounds where occurred_at >= bounds.m0),
    'spend_prev_month', (select coalesce(sum(cost_usd), 0) from public.api_cost_ledger, bounds
                          where occurred_at >= bounds.m_prev and occurred_at < bounds.m0),
    'budget',           (select overall_monthly_budget_usd from cfg),
    'red_flag_spend',   (select red_flag_monthly_spend_usd from cfg),
    'red_flag_growth_pct', (select red_flag_mom_growth_pct from cfg),
    'stale_days',       (select stale_lead_days from cfg),
    'auction_days',     (select auction_alert_days from cfg)
  )
  where private.is_member()
$$;

revoke execute on function public.dashboard_stats() from anon, public;
grant execute on function public.dashboard_stats() to authenticated;
