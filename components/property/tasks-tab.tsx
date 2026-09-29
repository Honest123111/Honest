"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { TaskDialog } from "@/components/shared/task-dialog";
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { cn, errorMessage, fmtDate } from "@/lib/utils";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import type { Task } from "./types";

export function TaskRow({ task, onEdit, showProperty }: { task: Task & { properties?: { apn: string; situs_city: string | null } | null }; onEdit: () => void; showProperty?: React.ReactNode }) {
  const router = useRouter();
  const { team } = useAppData();
  const { canResearch } = usePermissions();
  const done = task.status === "done";
  const overdue = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  async function toggle() {
    const { error } = await createClient().from("tasks").update({ status: done ? "not_started" : "done" }).eq("id", task.id);
    if (error) toast.error(errorMessage(error)); else router.refresh();
  }

  return (
    <div className="flex items-start gap-3 border-b px-3 py-2 last:border-0">
      <input type="checkbox" className="mt-1 size-4" checked={done} onChange={toggle} disabled={!canResearch} aria-label={done ? "Mark not done" : "Mark done"} />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit} disabled={!canResearch}>
        <div className={cn("text-sm", done && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="secondary">{TASK_CATEGORY_LABELS[task.category]}</Badge>
          {task.priority <= 2 && <Badge variant="warning">P{task.priority}</Badge>}
          {task.status !== "not_started" && !done && <span>{TASK_STATUS_LABELS[task.status]}</span>}
          <span className={cn(overdue && "font-medium text-destructive")}>{task.due_date ? `Due ${fmtDate(task.due_date)}` : "No due date"}</span>
          <span>{displayName(team.find((t) => t.id === task.assignee_id))}</span>
          {showProperty}
        </div>
        {task.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>}
      </button>
    </div>
  );
}

export function TasksTab({ propertyId, tasks }: { propertyId: string; tasks: Task[] }) {
  const { canResearch } = usePermissions();
  const [edit, setEdit] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  return (
    <div className="grid gap-3">
      {canResearch && <div><Button size="sm" onClick={() => setAdding(true)}><Plus /> Add task</Button></div>}
      {tasks.length === 0 ? (
        <EmptyState title="No tasks for this property" />
      ) : (
        <div className="rounded-lg border bg-card">
          {[...open, ...done].map((t) => <TaskRow key={t.id} task={t} onEdit={() => setEdit(t)} />)}
        </div>
      )}
      <TaskDialog open={adding} onOpenChange={setAdding} propertyId={propertyId} />
      <TaskDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} task={edit} />
    </div>
  );
}
