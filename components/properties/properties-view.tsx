"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Bookmark, ChevronLeft, ChevronRight, Download, Filter, Search, Share2, Trash2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, NativeSelect, inputClass } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn, errorMessage, fmtMoney, fmtNumber } from "@/lib/utils";
import { countActive, filtersToParams, SUGGESTED_VIEWS, type PropertyFilters, type SortKey } from "@/lib/filters";
import { ZONE_SHORT } from "@/lib/labels";
import type { Database, Json } from "@/lib/database.types";
import { displayName, useAppData, usePermissions } from "@/components/layout/app-data";
import { COLUMNS, type GridRow } from "./columns";
import { ColumnChooser, normalizeColumnState, type ColumnState } from "./column-chooser";
import { FilterPanel } from "./filter-panel";
import { StatusSelect, StrategyBadge, TagEditor } from "./inline-edits";
import { useStatusChange } from "./status-change";

type SavedView = Database["public"]["Tables"]["saved_views"]["Row"];

const LS_KEY = "ht.properties.columns";

export function PropertiesView({ rows, total, page, pageSize, filters, sort, savedViews, error }: {
  rows: GridRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: PropertyFilters;
  sort: { key: SortKey; asc: boolean };
  savedViews: SavedView[];
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const { me, statuses, team } = useAppData();
  const { canWrite, canResearch } = usePermissions();
  const { request: requestStatus, dialog: statusDialog } = useStatusChange();

  const [cols, setCols] = useState<ColumnState>(() => normalizeColumnState(null));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(filters.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);

  // per-user column layout (browser only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCols(normalizeColumnState(JSON.parse(raw)));
    } catch { /* storage unavailable */ }
  }, []);
  const updateCols = (v: ColumnState) => {
    setCols(v);
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  };
  useEffect(() => setSelected(new Set()), [rows]);

  function navigate(next: PropertyFilters, opts: { sort?: { key: SortKey; asc: boolean }; page?: number } = {}) {
    const p = filtersToParams(next);
    const s = opts.sort ?? sort;
    if (!(s.key === "updated_at" && !s.asc)) p.set("sort", `${s.key}.${s.asc ? "asc" : "desc"}`);
    if (opts.page && opts.page > 1) p.set("page", String(opts.page));
    startTransition(() => router.push(`${pathname}${p.size ? `?${p}` : ""}`));
  }

  // debounce the search box into the URL
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => navigate({ ...filters, q: q || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const visible = cols.order.map((id) => COLUMNS.find((c) => c.id === id)!).filter((c) => c && !cols.hidden.includes(c.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentQuery = useMemo(() => {
    const p = filtersToParams(filters);
    if (!(sort.key === "updated_at" && !sort.asc)) p.set("sort", `${sort.key}.${sort.asc ? "asc" : "desc"}`);
    return p.toString();
  }, [filters, sort]);

  // --- saved views ---------------------------------------------------------
  function openView(query: string, columns?: Json) {
    if (columns && typeof columns === "object" && !Array.isArray(columns)) updateCols(normalizeColumnState(columns as Partial<ColumnState>));
    startTransition(() => router.push(`${pathname}${query ? `?${query}` : ""}`));
  }
  async function saveView(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await createClient().from("saved_views").insert({
      user_id: me.id,
      page: "properties",
      name: String(f.get("name")).trim(),
      filters: { query: currentQuery },
      columns: cols as unknown as Json,
      sort: [{ key: sort.key, asc: sort.asc }],
      shared: f.get("shared") === "on",
    });
    if (error) return toast.error(errorMessage(error));
    toast.success("View saved");
    setSaveOpen(false);
    router.refresh();
  }
  async function deleteView(v: SavedView) {
    const { error } = await createClient().from("saved_views").delete().eq("id", v.id);
    if (error) return toast.error(errorMessage(error));
    router.refresh();
  }

  // --- bulk actions ----------------------------------------------------------
  const ids = [...selected];
  async function bulkUpdate(values: Database["public"]["Tables"]["properties"]["Update"], label: string) {
    const { error } = await createClient().from("properties").update(values).in("id", ids);
    if (error) return toast.error(errorMessage(error));
    toast.success(`${label} — ${ids.length} updated`);
    router.refresh();
  }
  async function bulkStatus(status: string) {
    const st = statuses.find((s) => s.key === status);
    if (st?.requires_offer || st?.requires_contract_doc || st?.requires_reason) {
      return toast.error(`"${st.label}" needs an offer, contract or reason per property — change it from each property.`);
    }
    await bulkUpdate({ lead_status: status }, `Status → ${st?.label}`);
  }
  async function bulkTag(tag: string) {
    const supabase = createClient();
    const current = rows.filter((r) => selected.has(r.id!));
    const results = await Promise.all(
      current.map((r) => supabase.from("properties").update({ tags: Array.from(new Set([...(r.tags ?? []), tag])) }).eq("id", r.id!)),
    );
    const failed = results.filter((r) => r.error).length;
    if (failed) toast.error(`${failed} could not be tagged`);
    else toast.success(`Tagged ${current.length}`);
    router.refresh();
  }

  const sortHeader = (key: SortKey | undefined, label: string, align?: "right") => {
    if (!key) return <span>{label}</span>;
    const active = sort.key === key;
    return (
      <button
        className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse", active && "text-foreground")}
        onClick={() => navigate(filters, { sort: { key, asc: active ? !sort.asc : true } })}
      >
        {label}
        {active && (sort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    );
  };

  const activeFilters = countActive(filters);
  const myViews = savedViews.filter((v) => v.user_id === me.id);
  const sharedViews = savedViews.filter((v) => v.user_id !== me.id && v.shared);
  const viewQuery = (v: SavedView) => ((v.filters as { query?: string } | null)?.query ?? "");

  return (
    <>
      <PageHeader
        title="Properties"
        description={`${total.toLocaleString()} ${total === 1 ? "property" : "properties"}${activeFilters ? " match your filters" : ""}`}
      />

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputClass, "pl-8")} placeholder="Filter by APN, address, city, owner…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
          <Filter /> Filters {activeFilters > 0 && <Badge>{activeFilters}</Badge>}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><Bookmark /> Views</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Suggested</DropdownMenuLabel>
            {SUGGESTED_VIEWS.map((v) => <DropdownMenuItem key={v.name} onSelect={() => openView(v.query)}>{v.name}</DropdownMenuItem>)}
            {myViews.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>My views</DropdownMenuLabel></>}
            {myViews.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => openView(viewQuery(v), v.columns)} className="justify-between">
                <span className="flex items-center gap-1 truncate">{v.shared && <Share2 className="size-3" />}{v.name}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteView(v); }} aria-label={`Delete ${v.name}`} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
            {sharedViews.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>Shared with team</DropdownMenuLabel></>}
            {sharedViews.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => openView(viewQuery(v), v.columns)}>
                {v.name} <span className="ml-auto text-xs text-muted-foreground">{displayName(team.find((t) => t.id === v.user_id))}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSaveOpen(true)}>Save current view…</DropdownMenuItem>
            {currentQuery && <DropdownMenuItem onSelect={() => openView("")}>Clear filters & sort</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden md:block"><ColumnChooser value={cols} onChange={updateCols} /></div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/properties/export${currentQuery ? `?${currentQuery}` : ""}`}><Download /> CSV</a>
        </Button>
      </div>

      {/* active filter chips */}
      {activeFilters > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {Object.entries(filters).filter(([k]) => k !== "q").map(([k, v]) => (
            <button
              key={k}
              onClick={() => navigate({ ...filters, [k]: undefined })}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs hover:bg-muted"
            >
              <span className="text-muted-foreground">{k}:</span> {Array.isArray(v) ? v.join(", ") : String(v)} <X className="size-3" />
            </button>
          ))}
          <Button variant="link" size="sm" onClick={() => navigate({ q: filters.q })}>Clear</Button>
        </div>
      )}

      {/* bulk bar */}
      {selected.size > 0 && (canWrite || canResearch) && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          {canWrite && (
            <>
              <NativeSelect className="h-8 w-auto text-xs" value="" onChange={(e) => e.target.value && bulkUpdate({ assignee_id: e.target.value === "none" ? null : e.target.value }, "Assigned")}>
                <option value="">Assign to…</option>
                <option value="none">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
              </NativeSelect>
              <NativeSelect className="h-8 w-auto text-xs" value="" onChange={(e) => e.target.value && bulkStatus(e.target.value)}>
                <option value="">Change status…</option>
                {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </NativeSelect>
            </>
          )}
          {canResearch && <BulkTag onTag={bulkTag} />}
          <Button variant="outline" size="sm" asChild>
            <a href={`/properties/export?ids=${ids.join(",")}`}><Download /> Export</a>
          </Button>
          <Button variant="outline" size="sm" disabled title="Arrives with Outreach (Phase 4)">Add to mail campaign</Button>
          <Button variant="outline" size="sm" disabled title="Arrives with enrichment & approvals (Phase 3)">Request enrichment</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error && <p className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState title={activeFilters || filters.q ? "No properties match" : "No properties yet"}>
          {activeFilters || filters.q ? "Try removing a filter." : <>Import a list on the <Link className="text-primary underline" href="/imports">Imports</Link> page.</>}
        </EmptyState>
      ) : (
        <div className={cn(pending && "opacity-60 transition-opacity")}>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={selected.size === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id!)) : new Set())}
                    />
                  </th>
                  {visible.map((c) => (
                    <th key={c.id} className={cn("whitespace-nowrap px-2 py-2 font-medium", c.align === "right" && "text-right")} style={{ width: c.width }}>
                      {sortHeader(c.sort, c.label, c.align)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cn("border-b last:border-0 hover:bg-muted/40", selected.has(r.id!) && "bg-accent/40")}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.apn_display}`}
                        checked={selected.has(r.id!)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          if (e.target.checked) n.add(r.id!); else n.delete(r.id!);
                          setSelected(n);
                        }}
                      />
                    </td>
                    {visible.map((c) => (
                      <td key={c.id} className={cn("px-2 py-1.5 align-middle", c.align === "right" && "text-right tabular-nums")}>
                        {c.cell(r, { requestStatus })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="grid gap-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/properties/${r.id}`} className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-primary">{r.apn_display}</div>
                    <div className="truncate text-sm">{r.situs_address ?? "No situs address"}</div>
                    <div className="text-xs text-muted-foreground">{r.situs_city ?? "—"}</div>
                  </Link>
                  <StrategyBadge value={r.strategy} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{fmtNumber(r.acres)} ac</span>
                  <span>{fmtNumber(r.distance_to_i10_mi, 1)} mi to I-10{r.corridor_zone ? ` · ${ZONE_SHORT[r.corridor_zone]}` : ""}</span>
                  {r.redemption_amount !== null && <span>Owed {fmtMoney(r.redemption_amount)}</span>}
                  {r.years_in_default !== null && <span>{fmtNumber(r.years_in_default, 1)} yrs default</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusSelect id={r.id!} value={r.lead_status!} onRequest={requestStatus} />
                  <TagEditor id={r.id!} value={r.tags ?? []} compact />
                </div>
              </Card>
            ))}
          </div>

          {/* pagination */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate(filters, { page: page - 1 })}><ChevronLeft /> Prev</Button>
              <span className="px-2 text-xs text-muted-foreground">{page} / {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => navigate(filters, { page: page + 1 })}>Next <ChevronRight /></Button>
            </div>
          </div>
        </div>
      )}

      <FilterPanel open={filtersOpen} onOpenChange={setFiltersOpen} value={filters} onApply={(f) => navigate({ ...f, q: filters.q })} />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent title="Save view" description="Saves the current filters, sort and columns.">
          <form onSubmit={saveView} className="grid gap-3">
            <Field label="Name"><Input name="name" required autoFocus placeholder="e.g. Blythe ≥ 5 ac, owner found" /></Field>
            {canResearch && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shared" /> Share with the team</label>}
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {statusDialog}
    </>
  );
}

function BulkTag({ onTag }: { onTag: (t: string) => void }) {
  const { tags } = useAppData();
  return (
    <NativeSelect className="h-8 w-auto text-xs" value="" onChange={(e) => e.target.value && onTag(e.target.value)}>
      <option value="">Add tag…</option>
      {tags.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
    </NativeSelect>
  );
}
