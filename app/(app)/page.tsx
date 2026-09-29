import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, DollarSign, ShieldCheck } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { BarList } from "@/components/dashboard/bar-list";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { TASK_CATEGORY_LABELS } from "@/lib/labels";

export const metadata = { title: "Home" };

interface Stats {
  total: number; corridor: number; near: number;
  by_status: Record<string, number>; by_strategy: Record<string, number>;
  with_owner: number; contacted_7d: number; offers_out: number; auction_soon: number; stale: number;
  pending_approvals: number; spend_month: number; spend_prev_month: number; budget: number;
  red_flag_spend: number; red_flag_growth_pct: number; stale_days: number; auction_days: number;
}

export default async function HomePage() {
  const { supabase, profile } = await requireMember();
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const [statsRes, statuses, strategies, myTasks, activity] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase.from("lead_statuses").select("key, label, sort_order, is_terminal").order("sort_order"),
    supabase.from("strategies").select("key, label, sort_order").order("sort_order"),
    supabase
      .from("tasks")
      .select("id, title, due_date, category, priority, property_id, properties(apn, county, situs_city)")
      .eq("assignee_id", profile.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase
      .from("activities")
      .select("*, properties(apn, county, situs_city)")
      .order("occurred_at", { ascending: false })
      .limit(15),
  ]);
  const s = (statsRes.data ?? {}) as unknown as Stats;
  const n = (k: string) => s.by_status?.[k] ?? 0;

  // spend: projected month-end from the run rate; red flags per Settings thresholds
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = (Number(s.spend_month ?? 0) / now.getDate()) * daysInMonth;
  const growth = s.spend_prev_month > 0 ? ((projected - s.spend_prev_month) / s.spend_prev_month) * 100 : null;
  const budgetPct = s.budget ? Math.min(100, (Number(s.spend_month ?? 0) / Number(s.budget)) * 100) : 0;
  const spendFlags = [
    projected > Number(s.red_flag_spend ?? 500) && `Projected ${fmtMoney(projected)} this month (limit ${fmtMoney(s.red_flag_spend)})`,
    growth !== null && growth > Number(s.red_flag_growth_pct ?? 50) && `Spend up ${growth.toFixed(0)}% vs last month`,
  ].filter(Boolean) as string[];

  const tasks = myTasks.data ?? [];
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const thisWeek = tasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd);

  const funnel = (statuses.data ?? []).filter((x) => x.key !== "dead").map((x) => ({ label: x.label, value: n(x.key), href: `/properties?status=${x.key}` }));
  const byStrategy = [
    ...(strategies.data ?? []).map((x) => ({ label: x.label, value: s.by_strategy?.[x.key] ?? 0, href: `/properties?strategy=${x.key}` })),
    ...(s.by_strategy?.unclassified ? [{ label: "Unclassified", value: s.by_strategy.unclassified, href: "/properties" }] : []),
  ];

  const alerts = [
    s.auction_soon > 0 && { icon: CalendarClock, text: `${s.auction_soon} parcel${s.auction_soon === 1 ? "" : "s"} with a tax auction in the next ${s.auction_days} days`, href: "/properties?auction=soon" },
    s.stale > 0 && { icon: Clock, text: `${s.stale} active lead${s.stale === 1 ? "" : "s"} with no activity in ${s.stale_days}+ days`, href: "/properties?stale=1" },
    s.pending_approvals > 0 && { icon: ShieldCheck, text: `${s.pending_approvals} enrichment request${s.pending_approvals === 1 ? "" : "s"} waiting for approval`, href: "/properties" },
    ...spendFlags.map((t) => ({ icon: DollarSign, text: t, href: "/settings" })),
  ].filter(Boolean) as { icon: typeof Clock; text: string; href: string }[];

  if (!s.total) {
    return (
      <>
        <PageHeader title="Home" />
        <EmptyState title="No properties yet">
          Start by importing the county tax-default inventory or your off-market list on the <Link className="text-primary underline" href="/imports">Imports</Link> page.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hi ${profile.full_name?.split(" ")[0] ?? "there"}`} description="Land acquisitions at a glance" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Properties" value={s.total.toLocaleString()} />
        <Stat label="I-10 corridor ≤2 mi" value={s.corridor.toLocaleString()} hint={`${s.near.toLocaleString()} more within 5 mi`} />
        <Stat label="Owners found" value={`${s.total ? Math.round((s.with_owner / s.total) * 100) : 0}%`} hint={`${s.with_owner.toLocaleString()} parcels`} />
        <Stat label="Contacted (7 days)" value={s.contacted_7d} />
        <Stat label="In conversation" value={n("in_conversation")} />
        <Stat label="Offers out" value={s.offers_out} />
        <Stat label="Under contract" value={n("under_contract")} />
        <Stat label="Closed" value={n("closed_won")} />
      </div>

      {alerts.length > 0 && (
        <Card className="mt-4 border-warning/60">
          <CardContent className="grid gap-1 py-3">
            {alerts.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                <span className="sr-only">Alert:</span>
                <a.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {a.text}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pipeline</CardTitle><Link href="/pipeline" className="text-xs text-primary">Open board</Link></CardHeader>
          <CardContent><BarList data={funnel} valueLabel="Properties" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By strategy</CardTitle></CardHeader>
          <CardContent><BarList data={byStrategy} valueLabel="Properties" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Spend this month</CardTitle><Badge variant="secondary">Budget {fmtMoney(s.budget)}</Badge></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(s.spend_month)}</div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budgetPct)} aria-label="Share of monthly budget used">
              <div className={budgetPct > 80 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${budgetPct}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {budgetPct.toFixed(0)}% of budget · projected {fmtMoney(projected)} · last month {fmtMoney(s.spend_prev_month)}
            </div>
            <p className="text-xs text-muted-foreground">All paid providers are off until enabled in Settings.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My tasks</CardTitle><Link href="/tasks?mine=1" className="text-xs text-primary">All tasks</Link></CardHeader>
          <CardContent className="grid gap-3">
            {[["Overdue", overdue], ["Today", dueToday], ["This week", thisWeek]].map(([label, list]) => (
              <div key={label as string}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label as string} · {(list as typeof tasks).length}
                </div>
                {(list as typeof tasks).length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  (list as typeof tasks).slice(0, 6).map((t) => (
                    <Link key={t.id} href={t.property_id ? `/properties/${t.property_id}?tab=tasks` : "/tasks"} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                      <span className="truncate">{t.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{TASK_CATEGORY_LABELS[t.category]} · {fmtDate(t.due_date)}</span>
                    </Link>
                  ))
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>
            <ActivityFeed items={activity.data ?? []} showProperty />
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">The corridor mini-map arrives with the Map view in Phase 2.</p>
    </>
  );
}
