import { requireMember } from "@/lib/auth";
import { applyFilters, parseFilters, parseSort } from "@/lib/filters";
import { PropertiesView } from "@/components/properties/properties-view";

export const metadata = { title: "Properties" };

const PAGE_SIZE = 50;

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, profile } = await requireMember();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const sort = parseSort(sp);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [{ data: cfg }, { data: terminal }, { data: views }] = await Promise.all([
    supabase.from("app_settings").select("auction_alert_days, stale_lead_days").maybeSingle(),
    supabase.from("lead_statuses").select("key").eq("is_terminal", true),
    supabase.from("saved_views").select("*").eq("page", "properties").order("name"),
  ]);

  let query = supabase.from("property_grid").select("*", { count: "exact" });
  query = applyFilters(query, filters, {
    meId: profile.id,
    today: new Date().toISOString().slice(0, 10),
    auctionDays: cfg?.auction_alert_days ?? 60,
    staleDays: cfg?.stale_lead_days ?? 14,
    terminalStatuses: (terminal ?? []).map((t) => t.key),
  });
  const { data, count, error } = await query
    .order(sort.key, { ascending: sort.asc, nullsFirst: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <PropertiesView
      rows={data ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      filters={filters}
      sort={sort}
      savedViews={views ?? []}
      error={error?.message ?? null}
    />
  );
}
