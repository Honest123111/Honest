"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag as TagIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn, errorMessage } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/lib/labels";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import type { Database } from "@/lib/database.types";

type PropertyUpdate = Database["public"]["Tables"]["properties"]["Update"];

const selectClass =
  "h-7 max-w-full rounded-md border border-transparent bg-transparent px-1 text-xs hover:border-input focus:border-input focus:outline-none disabled:opacity-100 disabled:hover:border-transparent";

async function patch(id: string, values: PropertyUpdate) {
  const { error } = await createClient().from("properties").update(values).eq("id", id);
  if (error) toast.error(errorMessage(error));
  return !error;
}

export function StatusSelect({ id, value, onRequest, className }: {
  id: string;
  value: string;
  onRequest: (id: string, status: string) => Promise<boolean>;
  className?: string;
}) {
  const { statuses } = useAppData();
  const { canWrite } = usePermissions();
  const current = statuses.find((s) => s.key === value);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: current?.color ?? "var(--muted-foreground)" }} aria-hidden />
      <select
        aria-label="Lead status"
        className={selectClass}
        value={value}
        disabled={!canWrite}
        onChange={(e) => onRequest(id, e.target.value)}
      >
        {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </span>
  );
}

export function AssigneeSelect({ id, value, className }: { id: string; value: string | null; className?: string }) {
  const router = useRouter();
  const { team } = useAppData();
  const { canWrite } = usePermissions();
  return (
    <select
      aria-label="Assignee"
      className={cn(selectClass, className)}
      value={value ?? ""}
      disabled={!canWrite}
      onChange={async (e) => { if (await patch(id, { assignee_id: e.target.value || null })) router.refresh(); }}
    >
      <option value="">Unassigned</option>
      {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
    </select>
  );
}

export function PrioritySelect({ id, value, className }: { id: string; value: number | null; className?: string }) {
  const router = useRouter();
  const { canWrite } = usePermissions();
  return (
    <select
      aria-label="Priority"
      className={cn(selectClass, className)}
      value={value ?? ""}
      disabled={!canWrite}
      onChange={async (e) => { if (await patch(id, { priority: e.target.value ? Number(e.target.value) : null })) router.refresh(); }}
    >
      <option value="">—</option>
      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function TagEditor({ id, value, compact }: { id: string; value: string[]; compact?: boolean }) {
  const router = useRouter();
  const { tags } = useAppData();
  const { canResearch } = usePermissions();
  const [draft, setDraft] = useState("");
  const color = (t: string) => tags.find((x) => x.name === t)?.color ?? null;

  async function set(next: string[]) {
    if (await patch(id, { tags: Array.from(new Set(next)) })) router.refresh();
  }

  const chips = value.map((t) => <Badge key={t} tone={color(t)}>{t}</Badge>);
  if (!canResearch) return <span className="flex flex-wrap gap-1">{chips}</span>;
  return (
    <Popover>
      <PopoverTrigger className="flex flex-wrap items-center gap-1 rounded-md text-left hover:bg-muted">
        {chips}
        {(!compact || !value.length) && <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground"><TagIcon className="size-3" />{value.length ? "" : "Add tag"}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="grid gap-1">
          {Array.from(new Set([...tags.map((t) => t.name), ...value])).map((t) => (
            <label key={t} className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted">
              <input type="checkbox" checked={value.includes(t)} onChange={(e) => set(e.target.checked ? [...value, t] : value.filter((x) => x !== t))} />
              <Badge tone={color(t)}>{t}</Badge>
            </label>
          ))}
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { set([...value, draft.trim()]); setDraft(""); } }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New tag…" className="h-8" />
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StrategyBadge({ value }: { value: string | null }) {
  const { strategies } = useAppData();
  const s = strategies.find((x) => x.key === value);
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge tone={s.color}>{s.label}</Badge>;
}

export function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value === null || value === undefined ? "—" : Number(value).toFixed(1)}</span>
    </span>
  );
}
