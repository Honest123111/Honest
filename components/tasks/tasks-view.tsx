"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { LayoutGrid, List, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TaskDialog } from "@/components/shared/task-dialog";
import { TaskRow } from "@/components/property/tasks-tab";
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { formatApn } from "@/lib/apn";
import { cn, errorMessage } from "@/lib/utils";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import type { Database } from "@/lib/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
  properties: { id: string; apn: string; county: Database["public"]["Enums"]["county_name"]; situs_city: string | null } | null;
};
const STATUSES = Object.keys(TASK_STATUS_LABELS) as Task["status"][];

function PropertyLink({ t }: { t: Task }) {
  if (!t.properties) return <span>General</span>;
  return (
    <Link href={`/properties/${t.properties.id}?tab=tasks`} className="text-primary" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {formatApn(t.properties.county, t.properties.apn)}{t.properties.situs_city ? ` · ${t.properties.situs_city}` : ""}
    </Link>
  );
}

function BoardCard({ t, onEdit, canDrag }: { t: Task; onEdit: () => void; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, data: t, disabled: !canDrag });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("rounded-md border bg-card", isDragging && "opacity-40")}>
      <TaskRow task={t} onEdit={onEdit} showProperty={<PropertyLink t={t} />} />
    </div>
  );
}

function BoardColumn({ status, children, count }: { status: Task["status"]; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-lg bg-muted/50", isOver && "ring-2 ring-primary")}>
      <div className="flex items-center justify-between px-3 py-2 text-sm font-medium">{TASK_STATUS_LABELS[status]}<span className="text-xs text-muted-foreground">{count}</span></div>
      <div className="grid max-h-[calc(100dvh-15rem)] content-start gap-2 overflow-y-auto px-2 pb-2">{children}</div>
    </div>
  );
}

export function TasksView({ tasks, filters }: { tasks: Task[]; filters: Record<string, string | undefined> }) {
  const router = useRouter();
  const pathname = usePathname();
  const { team } = useAppData();
  const { canResearch } = usePermissions();
  const [mode, setMode] = useState<"list" | "board">("list");
  const [edit, setEdit] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState(tasks);
  useEffect(() => setItems(tasks), [tasks]);
  useEffect(() => { try { const m = localStorage.getItem("ht.tasks.mode"); if (m === "board" || m === "list") setMode(m); } catch { /* ignore */ } }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }));

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(Object.entries(filters).filter(([, x]) => x) as [string, string][]);
    if (v) p.set(k, v); else p.delete(k);
    if (k === "assignee") p.delete("mine");
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };
  const switchMode = (m: "list" | "board") => { setMode(m); try { localStorage.setItem("ht.tasks.mode", m); } catch { /* ignore */ } };

  async function onDragEnd(e: DragEndEvent) {
    const t = e.active.data.current as Task | undefined;
    const to = e.over?.id as Task["status"] | undefined;
    if (!t || !to || t.status === to) return;
    setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, status: to } : x)));
    const { error } = await createClient().from("tasks").update({ status: to }).eq("id", t.id);
    if (error) { toast.error(errorMessage(error)); setItems(tasks); } else router.refresh();
  }

  const today = new Date().toISOString().slice(0, 10);
  const groups = [
    { label: "Overdue", items: items.filter((t) => t.status !== "done" && t.due_date && t.due_date < today) },
    { label: "Today", items: items.filter((t) => t.status !== "done" && t.due_date === today) },
    { label: "Upcoming", items: items.filter((t) => t.status !== "done" && t.due_date && t.due_date > today) },
    { label: "No due date", items: items.filter((t) => t.status !== "done" && !t.due_date) },
    { label: "Done (last 7 days)", items: items.filter((t) => t.status === "done") },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <>
            <div className="flex rounded-md border">
              <Button size="sm" variant={mode === "list" ? "secondary" : "ghost"} onClick={() => switchMode("list")} aria-label="List view"><List /></Button>
              <Button size="sm" variant={mode === "board" ? "secondary" : "ghost"} onClick={() => switchMode("board")} aria-label="Board view"><LayoutGrid /></Button>
            </div>
            {canResearch && <Button size="sm" onClick={() => setAdding(true)}><Plus /> New task</Button>}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect className="h-8 w-auto text-xs" value={filters.mine ? "me" : filters.assignee ?? ""} onChange={(e) => (e.target.value === "me" ? setFilter("mine", "1") : setFilter("assignee", e.target.value))}>
          <option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>
          {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
        </NativeSelect>
        <NativeSelect className="h-8 w-auto text-xs" value={filters.category ?? ""} onChange={(e) => setFilter("category", e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <NativeSelect className="h-8 w-auto text-xs" value={filters.due ?? ""} onChange={(e) => setFilter("due", e.target.value)}>
          <option value="">Any due date</option><option value="overdue">Overdue</option><option value="week">Due within a week</option>
        </NativeSelect>
        <NativeSelect className="h-8 w-auto text-xs" value={filters.property ?? ""} onChange={(e) => setFilter("property", e.target.value)}>
          <option value="">All tasks</option><option value="none">General (no property)</option>
        </NativeSelect>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!filters.done} onChange={(e) => setFilter("done", e.target.checked ? "1" : "")} /> Include all done</label>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No tasks match" />
      ) : mode === "list" ? (
        <div className="grid gap-4">
          {groups.filter((g) => g.items.length).map((g) => (
            <section key={g.label}>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label} · {g.items.length}</h2>
              <div className="rounded-lg border bg-card">{g.items.map((t) => <TaskRow key={t.id} task={t} onEdit={() => setEdit(t)} showProperty={<PropertyLink t={t} />} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-4 md:-mx-6 md:px-6">
            {STATUSES.map((s) => {
              const list = items.filter((t) => t.status === s);
              return (
                <BoardColumn key={s} status={s} count={list.length}>
                  {list.map((t) => <BoardCard key={t.id} t={t} onEdit={() => setEdit(t)} canDrag={canResearch} />)}
                </BoardColumn>
              );
            })}
          </div>
        </DndContext>
      )}
      <TaskDialog open={adding} onOpenChange={setAdding} />
      <TaskDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} task={edit} />
    </>
  );
}
