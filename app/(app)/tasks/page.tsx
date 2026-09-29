import { requireMember } from "@/lib/auth";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase, profile } = await requireMember();
  const sp = await searchParams;
  let q = supabase
    .from("tasks")
    .select("*, properties(id, apn, county, situs_city)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority")
    .limit(1000);
  if (sp.category) q = q.eq("category", sp.category as never);
  if (sp.mine) q = q.eq("assignee_id", profile.id);
  else if (sp.assignee === "none") q = q.is("assignee_id", null);
  else if (sp.assignee) q = q.eq("assignee_id", sp.assignee);
  if (sp.due === "overdue") q = q.lt("due_date", new Date().toISOString().slice(0, 10)).neq("status", "done");
  if (sp.due === "week") q = q.lte("due_date", new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  if (sp.property === "none") q = q.is("property_id", null);
  if (!sp.done) q = q.or(`status.neq.done,completed_at.gt.${new Date(Date.now() - 7 * 86_400_000).toISOString()}`);
  const { data } = await q;
  return <TasksView tasks={data ?? []} filters={sp} />;
}
