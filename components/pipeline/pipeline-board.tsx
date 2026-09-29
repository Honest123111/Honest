"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { NativeSelect } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/misc";
import { cn, daysSince, fmtDate, fmtNumber } from "@/lib/utils";
import { ZONE_LABELS } from "@/lib/labels";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import { StrategyBadge } from "@/components/properties/inline-edits";
import { useStatusChange } from "@/components/properties/status-change";

interface CardRow {
  id: string | null; apn_display: string | null; situs_city: string | null; acres: number | null; strategy: string | null;
  assignee_id: string | null; assignee_name: string | null; lead_status: string | null; status_changed_at: string | null;
  next_task_title: string | null; next_task_due: string | null; priority: number | null; ev_score: number | null;
}
interface Column { key: string; cards: CardRow[]; count: number }

function Card({ c, dragging }: { c: CardRow; dragging?: boolean }) {
  const days = daysSince(c.status_changed_at);
  return (
    <div className={cn("rounded-md border bg-card p-2 text-sm shadow-xs", dragging && "rotate-1 shadow-lg")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/properties/${c.id}`} className="font-mono text-xs font-semibold text-primary hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {c.apn_display}
        </Link>
        {c.assignee_id && <Avatar name={c.assignee_name} className="size-5" />}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{c.situs_city ?? "—"} · {fmtNumber(c.acres)} ac</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <StrategyBadge value={c.strategy} />
        {days !== null && <span className="text-[11px] text-muted-foreground">{days}d in stage</span>}
      </div>
      {c.next_task_title && (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">→ {c.next_task_title}{c.next_task_due ? ` · ${fmtDate(c.next_task_due)}` : ""}</div>
      )}
    </div>
  );
}

function DraggableCard({ c, disabled }: { c: CardRow; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id!, data: c, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation", !disabled && "cursor-grab", isDragging && "opacity-30")}>
      <Card c={c} />
    </div>
  );
}

function ColumnView({ col, label, color, perColumn, canDrag }: { col: Column; label: string; color: string | null; perColumn: number; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={cn("flex w-64 shrink-0 flex-col rounded-lg bg-muted/50 md:w-72", isOver && "ring-2 ring-primary")}>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />
        {label}
        <span className="ml-auto rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{col.count.toLocaleString()}</span>
      </div>
      <div className="grid max-h-[calc(100dvh-15rem)] content-start gap-2 overflow-y-auto px-2 pb-2">
        {col.cards.map((c) => <DraggableCard key={c.id} c={c} disabled={!canDrag} />)}
        {col.count > perColumn && (
          <Link href={`/properties?status=${col.key}`} className="py-1 text-center text-xs text-primary">
            + {(col.count - perColumn).toLocaleString()} more in the table
          </Link>
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({ columns, filters, perColumn }: { columns: Column[]; filters: { strategy?: string; assignee?: string; zone?: string }; perColumn: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { statuses, strategies, team } = useAppData();
  const { canWrite } = usePermissions();
  const [cols, setCols] = useState(columns);
  const [active, setActive] = useState<CardRow | null>(null);
  useEffect(() => setCols(columns), [columns]);
  const { request, dialog } = useStatusChange();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  async function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const card = e.active.data.current as CardRow | undefined;
    const to = e.over?.id as string | undefined;
    if (!card || !to || card.lead_status === to) return;
    // optimistic move; the refresh after the update (or a cancelled gate dialog) resyncs
    const from = card.lead_status!;
    setCols((cs) => cs.map((c) =>
      c.key === from ? { ...c, cards: c.cards.filter((x) => x.id !== card.id), count: c.count - 1 }
      : c.key === to ? { ...c, cards: [{ ...card, lead_status: to, status_changed_at: new Date().toISOString() }, ...c.cards], count: c.count + 1 }
      : c));
    const ok = await request(card.id!, to);
    if (!ok) setCols(columns);
  }

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(filters as Record<string, string>);
    if (v) p.set(k, v); else p.delete(k);
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={canWrite ? "Drag a card to change its status — every move is logged." : "Read-only for your role."}
        actions={
          <>
            <NativeSelect className="h-8 w-auto text-xs" value={filters.strategy ?? ""} onChange={(e) => setFilter("strategy", e.target.value)}>
              <option value="">All strategies</option>
              {strategies.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </NativeSelect>
            <NativeSelect className="h-8 w-auto text-xs" value={filters.assignee ?? ""} onChange={(e) => setFilter("assignee", e.target.value)}>
              <option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>
              {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
            </NativeSelect>
            <NativeSelect className="h-8 w-auto text-xs" value={filters.zone ?? ""} onChange={(e) => setFilter("zone", e.target.value)}>
              <option value="">All zones</option>
              {Object.entries(ZONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </>
        }
      />
      <DndContext sensors={sensors} onDragStart={(e) => setActive(e.active.data.current as CardRow)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-4 md:-mx-6 md:px-6">
          {cols.map((c) => {
            const s = statuses.find((x) => x.key === c.key);
            return <ColumnView key={c.key} col={c} label={s?.label ?? c.key} color={s?.color ?? null} perColumn={perColumn} canDrag={canWrite} />;
          })}
        </div>
        <DragOverlay>{active ? <div className="w-64"><Card c={active} dragging /></div> : null}</DragOverlay>
      </DndContext>
      {dialog}
    </>
  );
}
