import { requireMember } from "@/lib/auth";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export const metadata = { title: "Pipeline" };

const PER_COLUMN = 60;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ strategy?: string; assignee?: string; zone?: string }> }) {
  const { supabase, profile } = await requireMember();
  const sp = await searchParams;
  const { data: statuses } = await supabase.from("lead_statuses").select("*").eq("active", true).order("sort_order");

  const cols = await Promise.all(
    (statuses ?? []).map(async (s) => {
      let q = supabase
        .from("property_grid")
        .select("id, apn_display, situs_city, acres, strategy, assignee_id, assignee_name, lead_status, status_changed_at, next_task_title, next_task_due, priority, ev_score, corridor_zone", { count: "exact" })
        .eq("lead_status", s.key);
      if (sp.strategy) q = q.eq("strategy", sp.strategy);
      if (sp.zone) q = q.eq("corridor_zone", sp.zone as "i10_corridor" | "i10_near" | "other");
      if (sp.assignee === "me") q = q.eq("assignee_id", profile.id);
      else if (sp.assignee === "none") q = q.is("assignee_id", null);
      else if (sp.assignee) q = q.eq("assignee_id", sp.assignee);
      const { data, count } = await q
        .order("priority", { ascending: true, nullsFirst: false })
        .order("status_changed_at", { ascending: true })
        .limit(PER_COLUMN);
      return { key: s.key, cards: data ?? [], count: count ?? 0 };
    }),
  );

  return <PipelineBoard columns={cols} filters={sp} perColumn={PER_COLUMN} />;
}
