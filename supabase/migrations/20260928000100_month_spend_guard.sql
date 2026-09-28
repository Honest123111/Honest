-- month_spend is callable over the API; only active members may see spend.
create or replace function public.month_spend(p_provider public.enrichment_provider default null)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when private.is_member() or auth.uid() is null then coalesce(sum(cost_usd), 0) end
    from public.api_cost_ledger
   where occurred_at >= (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
     and (p_provider is null or provider = p_provider)
$$;
