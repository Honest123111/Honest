"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/misc";
import { COUNTY_LABELS } from "@/lib/labels";
import { FORMATS, suggestMapping, TARGET_FIELD_LABELS, TARGET_FIELDS, type SourceType, type TargetField } from "@/lib/imports/fields";
import type { SheetInfo } from "@/lib/imports/workbook";
import { cn, errorMessage, fmtDateTime } from "@/lib/utils";
import { formatApn, type County } from "@/lib/apn";
import type { Database, Json } from "@/lib/database.types";
import { cancelImport, commitBatch, previewImport, reopenMapping, resolveConflicts, sheetHeaders, type ImportConfig } from "@/app/(app)/imports/actions";

type Imp = Database["public"]["Tables"]["imports"]["Row"];
type Row = {
  id: number; row_number: number; apn: string | null; action: string | null; error: string | null;
  conflicts: Json | null; conflict_resolution: Json | null; mapped: Json | null; property_id: string | null; committed_at: string | null;
};

// ---------------------------------------------------------------------------
// Step 1 — mapping
// ---------------------------------------------------------------------------
function MappingStep({ imp, sourceType: detected, sheets: initial }: { imp: Imp; sourceType: SourceType; sheets: SheetInfo[] }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>(detected);
  const [county, setCounty] = useState<County | "">(FORMATS[detected].defaultCounty ?? "");
  const [snapshot, setSnapshot] = useState(FORMATS[detected].snapshotDate ?? new Date().toISOString().slice(0, 10));
  const [sheets, setSheets] = useState(initial);
  const [busy, setBusy] = useState(false);

  function changeType(t: SourceType) {
    setSourceType(t);
    setCounty(FORMATS[t].defaultCounty ?? county);
    if (FORMATS[t].snapshotDate) setSnapshot(FORMATS[t].snapshotDate!);
    setSheets((ss) => ss.map((s) => ({ ...s, mapping: suggestMapping(s.headers, t) })));
  }
  async function changeHeaderRow(i: number, headerRow: number) {
    if (!headerRow || headerRow < 1) return;
    try {
      const h = await sheetHeaders(imp.id, sheets[i].name, headerRow);
      setSheets((ss) => ss.map((s, j) => (j === i ? { ...s, headerRow, ...h, mapping: suggestMapping(h.headers, sourceType) } : s)));
    } catch (e) { toast.error(errorMessage(e)); }
  }
  const setMap = (i: number, header: string, target: TargetField | null) =>
    setSheets((ss) => ss.map((s, j) => (j === i ? { ...s, mapping: { ...s.mapping, [header]: target } } : s)));

  const included = sheets.filter((s) => s.include);
  const hasApn = included.every((s) => Object.values(s.mapping).includes("apn") || ["map_book", "map_page", "map_parcel"].every((f) => Object.values(s.mapping).includes(f as TargetField)));
  const needsCounty = included.some((s) => !Object.values(s.mapping).includes("county")) && !county;

  async function preview() {
    setBusy(true);
    try {
      const config: ImportConfig = {
        sourceType,
        county: (county || null) as County | null,
        snapshotDate: snapshot || null,
        sheets: sheets.map(({ name, include, headerRow, mapping }) => ({ name, include, headerRow, mapping })),
      };
      const s = await previewImport(imp.id, config);
      toast.success(`${s.total.toLocaleString()} rows checked`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <Field label="Format">
            <NativeSelect value={sourceType} onChange={(e) => changeType(e.target.value as SourceType)}>
              {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="County (when the file has no county column)">
            <NativeSelect value={county} onChange={(e) => setCounty(e.target.value as County | "")}>
              <option value="">— from file —</option>
              {Object.entries(COUNTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Data as of" hint="Tax snapshots are stored with this date">
            <Input type="date" value={snapshot} onChange={(e) => setSnapshot(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {sheets.map((s, i) => (
        <Card key={s.name} className={cn(!s.include && "opacity-60")}>
          <CardHeader>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.include} onChange={(e) => setSheets((ss) => ss.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
              <CardTitle>{s.name}</CardTitle>
              <span className="text-xs text-muted-foreground">{s.rowCount.toLocaleString()} rows</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Header row
              <Input type="number" min={1} className="h-7 w-16" defaultValue={s.headerRow} onBlur={(e) => Number(e.target.value) !== s.headerRow && changeHeaderRow(i, Number(e.target.value))} />
            </label>
          </CardHeader>
          {s.include && (
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">Column in file</th><th className="pr-3 font-medium">Import as</th><th className="font-medium">Sample</th></tr></thead>
                <tbody>
                  {s.headers.map((h) => (
                    <tr key={h} className="border-t">
                      <td className="py-1 pr-3 font-medium">{h}</td>
                      <td className="pr-3">
                        <NativeSelect className={cn("h-8 w-52 text-xs", s.mapping[h] && "border-primary")} value={s.mapping[h] ?? ""} onChange={(e) => setMap(i, h, (e.target.value || null) as TargetField | null)}>
                          <option value="">— skip —</option>
                          {TARGET_FIELDS.map((f) => <option key={f} value={f}>{TARGET_FIELD_LABELS[f]}</option>)}
                        </NativeSelect>
                      </td>
                      <td className="max-w-64 truncate text-xs text-muted-foreground">{s.sample.map((r) => r[h]).filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={preview} disabled={busy || !included.length || !hasApn || needsCounty}><Play /> {busy ? "Checking every row…" : "Preview matches"}</Button>
        {!hasApn && <span className="text-sm text-destructive">Map an APN column (or map book + page + parcel) on every included sheet.</span>}
        {needsCounty && <span className="text-sm text-destructive">Choose a county — the file has no county column.</span>}
        <Button variant="ghost" onClick={async () => { await cancelImport(imp.id); router.push("/imports"); }}>Cancel import</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — preview + conflicts + commit
// ---------------------------------------------------------------------------
const ACTION_BADGE: Record<string, "default" | "secondary" | "destructive" | "warning" | "outline"> = {
  create: "default", update: "secondary", unchanged: "outline", conflict: "warning", error: "destructive", skip: "outline",
};

function PreviewStep({ imp, rows, show }: { imp: Imp; rows: Row[]; show: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const committed = imp.status === "committed";
  const totalActionable = imp.created + imp.updated + imp.conflicts;
  const errors = (Array.isArray(imp.errors) ? imp.errors : []) as { sheet: string; row: number; apn: string | null; error: string }[];

  async function commit() {
    if (!confirm(`Commit ${totalActionable.toLocaleString()} rows? New parcels are created, matched parcels updated, and conflicts ${imp.conflicts ? "use your keep/overwrite choices (default: keep)" : "—none"}.`)) return;
    setProgress({ done: 0, total: totalActionable });
    try {
      for (let guard = 0; guard < 500; guard++) {
        const r = await commitBatch(imp.id);
        setProgress({ done: totalActionable - r.remaining, total: totalActionable });
        if (r.remaining === 0) break;
      }
      toast.success("Import committed");
      router.refresh();
    } catch (e) {
      toast.error(`${errorMessage(e)} — progress is saved; press Commit again to resume.`);
      router.refresh();
    } finally {
      setProgress(null);
    }
  }

  async function resolve(value: "overwrite" | "keep", rowId?: number, field?: string) {
    try { await resolveConflicts(imp.id, { rowId, field, value }); router.refresh(); } catch (e) { toast.error(errorMessage(e)); }
  }

  const downloadErrors = () => {
    const csv = ["sheet,row,apn,error", ...errors.map((e) => [e.sheet, e.row, e.apn ?? "", `"${(e.error ?? "").replace(/"/g, '""')}"`].join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${imp.file_name}-errors.csv`;
    a.click();
  };

  const tabs = [["attention", "Needs attention"], ["create", "New"], ["update", "Updates"], ["unchanged", "Unchanged"], ["skip", "Merged dupes"], ["all", "All"]];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Rows" value={imp.row_count.toLocaleString()} />
        <Stat label="New parcels" value={imp.created.toLocaleString()} />
        <Stat label="Matched by APN" value={imp.matched.toLocaleString()} hint={`${imp.updated.toLocaleString()} with changes`} />
        <Stat label="Conflicts" value={imp.conflicts.toLocaleString()} hint="user-edited values" />
        <Stat label="Errors" value={errors.length.toLocaleString()} hint={errors.length ? <button className="text-primary" onClick={downloadErrors}>Download report</button> : undefined} />
      </div>

      {committed ? (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
            <CheckCircle2 className="size-5 text-primary" />
            Committed {fmtDateTime(imp.committed_at)}.
            <Link className="text-primary underline" href="/properties?sort=updated_at.desc">See properties</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={commit} disabled={!!progress || totalActionable === 0}>
            {progress ? `Committing ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}…` : imp.status === "committing" ? "Resume commit" : `Commit ${totalActionable.toLocaleString()} rows`}
          </Button>
          {imp.conflicts > 0 && (
            <>
              <Button variant="outline" onClick={() => resolve("overwrite")}>Overwrite all conflicts</Button>
              <Button variant="outline" onClick={() => resolve("keep")}>Keep all current values</Button>
            </>
          )}
          {imp.status === "previewed" && (
            <Button variant="ghost" onClick={async () => { try { await reopenMapping(imp.id); router.refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>
              <ArrowLeft /> Edit mapping
            </Button>
          )}
          {progress && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:w-64" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
              <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`?show=${k}`} className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs", show === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{label}</Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 font-medium">APN</th><th className="px-3 font-medium">Result</th><th className="px-3 font-medium">Details</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nothing in this group.</td></tr>}
            {rows.map((r) => {
              const m = (r.mapped ?? {}) as { sheet?: string; sheet_row?: number; county?: County; changes?: Record<string, unknown>; owners?: { name: string }[]; merged_rows?: number[] };
              const conflicts = (r.conflicts ?? {}) as Record<string, { current: unknown; incoming: unknown }>;
              const res = (r.conflict_resolution ?? {}) as Record<string, string>;
              return (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{m.sheet} · {m.sheet_row}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {r.property_id ? <Link className="text-primary" href={`/properties/${r.property_id}`}>{formatApn(m.county, r.apn)}</Link> : formatApn(m.county, r.apn) || "—"}
                  </td>
                  <td className="px-3 py-2"><Badge variant={ACTION_BADGE[r.action ?? ""] ?? "outline"}>{r.action}</Badge>{r.committed_at && <span className="ml-1 text-xs text-muted-foreground">✓</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.error && <div className="text-destructive">{r.error}</div>}
                    {Object.entries(conflicts).map(([f, c]) => (
                      <div key={f} className="flex flex-wrap items-center gap-2 py-0.5">
                        <span className="font-medium">{TARGET_FIELD_LABELS[f as TargetField] ?? f}:</span>
                        <span>yours <b>{String(c.current)}</b> vs file <b>{String(c.incoming)}</b></span>
                        {!committed && (
                          <NativeSelect className="h-7 w-auto text-xs" value={res[f] ?? "keep"} onChange={(e) => resolve(e.target.value as "keep" | "overwrite", r.id, f)}>
                            <option value="keep">Keep mine</option>
                            <option value="overwrite">Use file</option>
                          </NativeSelect>
                        )}
                      </div>
                    ))}
                    {r.action !== "error" && m.changes && Object.keys(m.changes).length > 0 && (
                      <div className="text-muted-foreground">{r.action === "create" ? "Fields: " : "Changes: "}{Object.keys(m.changes).map((k) => TARGET_FIELD_LABELS[k as TargetField] ?? k).join(", ")}</div>
                    )}
                    {!!m.owners?.length && <div className="text-muted-foreground">Owners: {m.owners.map((o) => o.name).join("; ")}</div>}
                    {!!m.merged_rows?.length && <div className="text-muted-foreground">Merged duplicate rows {m.merged_rows.join(", ")}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 300 && <p className="text-xs text-muted-foreground">Showing the first 300 rows of this group.</p>}
    </div>
  );
}

export function ImportWizard({ imp, inspection, rows, show }: {
  imp: Imp;
  inspection: { sourceType: SourceType; sheets: SheetInfo[] } | { error: string } | null;
  rows: Row[];
  show: string;
}) {
  const steps = useMemo(() => ["Map columns", "Preview & resolve", "Commit"], []);
  const step = imp.status === "uploaded" ? 0 : imp.status === "committed" ? 2 : 1;
  return (
    <>
      <Link href="/imports" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Imports</Link>
      <PageHeader
        title={imp.file_name}
        description={<span className="flex flex-wrap gap-2">{steps.map((s, i) => <span key={s} className={cn(i === step ? "font-medium text-foreground" : "")}>{i + 1}. {s}</span>)}</span>}
        actions={imp.status === "cancelled" ? <Badge variant="destructive">cancelled</Badge> : undefined}
      />
      {imp.status === "uploaded" && inspection && ("error" in inspection
        ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{inspection.error}</p>
        : <MappingStep imp={imp} sourceType={inspection.sourceType} sheets={inspection.sheets} />)}
      {["previewed", "committing", "committed"].includes(imp.status) && <PreviewStep imp={imp} rows={rows} show={show} />}
      {imp.status === "cancelled" && <p className="text-sm text-muted-foreground">This import was cancelled. Upload the file again to start over.</p>}
    </>
  );
}
