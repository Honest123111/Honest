"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { COUNTY_LABELS, ZONE_LABELS } from "@/lib/labels";
import type { PropertyFilters } from "@/lib/filters";
import { displayName, useAppData } from "@/components/layout/app-data";

function MultiCheck({ options, value, onChange }: { options: [string, string][]; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const set = new Set(value ?? []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, label]) => (
        <label key={k} className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${set.has(k) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
          <input
            type="checkbox"
            className="sr-only"
            checked={set.has(k)}
            onChange={(e) => { const n = new Set(set); if (e.target.checked) n.add(k); else n.delete(k); onChange([...n]); }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

const YesNo = ({ value, onChange }: { value?: "y" | "n"; onChange: (v?: "y" | "n") => void }) => (
  <NativeSelect value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as "y" | "n" | undefined)}>
    <option value="">Any</option>
    <option value="y">Yes</option>
    <option value="n">No</option>
  </NativeSelect>
);

function Range({ min, max, onChange, step = "any" }: { min?: number; max?: number; step?: string; onChange: (min?: number, max?: number) => void }) {
  const n = (s: string) => (s === "" ? undefined : Number(s));
  return (
    <div className="flex items-center gap-2">
      <Input type="number" inputMode="decimal" step={step} placeholder="min" value={min ?? ""} onChange={(e) => onChange(n(e.target.value), max)} />
      <span className="text-muted-foreground">–</span>
      <Input type="number" inputMode="decimal" step={step} placeholder="max" value={max ?? ""} onChange={(e) => onChange(min, n(e.target.value))} />
    </div>
  );
}

export function FilterPanel({ open, onOpenChange, value, onApply }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: PropertyFilters;
  onApply: (f: PropertyFilters) => void;
}) {
  const { statuses, strategies, team, tags } = useAppData();
  const [f, setF] = useState<PropertyFilters>(value);
  const up = (patch: Partial<PropertyFilters>) => setF((cur) => ({ ...cur, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setF(value); onOpenChange(o); }}>
      <DialogContent title="Filters" className="sm:max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="County" className="sm:col-span-2">
            <MultiCheck options={Object.entries(COUNTY_LABELS)} value={f.county} onChange={(county) => up({ county })} />
          </Field>
          <Field label="Corridor zone" className="sm:col-span-2">
            <MultiCheck options={Object.entries(ZONE_LABELS)} value={f.zone} onChange={(zone) => up({ zone })} />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <MultiCheck options={statuses.map((s) => [s.key, s.label])} value={f.status} onChange={(status) => up({ status })} />
          </Field>
          <Field label="Strategy" className="sm:col-span-2">
            <MultiCheck options={strategies.map((s) => [s.key, s.label])} value={f.strategy} onChange={(strategy) => up({ strategy })} />
          </Field>
          {tags.length > 0 && (
            <Field label="Tags (any of)" className="sm:col-span-2">
              <MultiCheck options={tags.map((t) => [t.name, t.name])} value={f.tags} onChange={(tags) => up({ tags })} />
            </Field>
          )}
          <Field label="City"><Input value={f.city ?? ""} onChange={(e) => up({ city: e.target.value || undefined })} /></Field>
          <Field label="Assignee">
            <NativeSelect value={f.assignee ?? ""} onChange={(e) => up({ assignee: e.target.value || undefined })}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="none">Unassigned</option>
              {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Miles to I-10"><Range min={f.dmin} max={f.dmax} onChange={(dmin, dmax) => up({ dmin, dmax })} /></Field>
          <Field label="Acres"><Range min={f.amin} max={f.amax} onChange={(amin, amax) => up({ amin, amax })} /></Field>
          <Field label="Owed / land ratio" hint="0.5 = taxes owed are half the land value"><Range min={f.olmin} max={f.olmax} onChange={(olmin, olmax) => up({ olmin, olmax })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Yrs in default ≥"><Input type="number" inputMode="decimal" value={f.ydmin ?? ""} onChange={(e) => up({ ydmin: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
            <Field label="EV score ≥"><Input type="number" inputMode="decimal" min={0} max={10} value={f.evmin ?? ""} onChange={(e) => up({ evmin: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Vacant"><YesNo value={f.vacant} onChange={(vacant) => up({ vacant })} /></Field>
            <Field label="Absentee"><YesNo value={f.absentee} onChange={(absentee) => up({ absentee })} /></Field>
            <Field label="Entity owner"><YesNo value={f.entity} onChange={(entity) => up({ entity })} /></Field>
            <Field label="Owner found"><YesNo value={f.owner} onChange={(owner) => up({ owner })} /></Field>
            <Field label="Has phone"><YesNo value={f.phone} onChange={(v) => up({ phone: v === "y" ? "y" : undefined })} /></Field>
            <Field label="Has email"><YesNo value={f.email} onChange={(v) => up({ email: v === "y" ? "y" : undefined })} /></Field>
          </div>
          <Field label="No activity since"><Input type="date" value={f.act_before ?? ""} onChange={(e) => up({ act_before: e.target.value || undefined })} /></Field>
          <Field label="Activity since"><Input type="date" value={f.act_after ?? ""} onChange={(e) => up({ act_after: e.target.value || undefined })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.auction === "soon"} onChange={(e) => up({ auction: e.target.checked ? "soon" : undefined })} /> Tax auction coming up</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.stale} onChange={(e) => up({ stale: e.target.checked ? "1" : undefined })} /> Stale active leads</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setF({ q: f.q })}>Clear all</Button>
          <Button onClick={() => { onApply(f); onOpenChange(false); }}>Show results</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
