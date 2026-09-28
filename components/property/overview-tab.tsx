"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ExternalLink, MapPinned, Pencil, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KeyValue } from "@/components/ui/misc";
import { errorMessage, fmtDate, fmtMoney, fmtNumber } from "@/lib/utils";
import { LOCATION_METHOD_LABELS, SOURCE_LIST_LABELS, TASK_CATEGORY_LABELS, ZONE_LABELS } from "@/lib/labels";
import { usePermissions } from "@/components/layout/app-data";
import type { Note, OwnerLink, Property, PropertyUpdate, Task, Tax } from "./types";

/** Google Maps / Street View links from the centroid when known, else the address. */
function mapLinks(p: Property) {
  const coords = (p as unknown as { centroid?: { coordinates?: [number, number] } }).centroid?.coordinates;
  const place = coords ? `${coords[1]},${coords[0]}` : [p.situs_address, p.situs_city, "CA"].filter(Boolean).join(", ");
  if (!place || place === "CA") return null;
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`,
    street: coords ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords[1]},${coords[0]}` : null,
    sce: "https://drpep.sce.com/drpep/",
  };
}

export function OverviewTab({ property: p, notes, tasks, tax, owners }: {
  property: Property; notes: Note[]; tasks: Task[]; tax: Tax | null; owners: OwnerLink[];
}) {
  const router = useRouter();
  const { canResearch } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [why, setWhy] = useState(p.why_this_property ?? "");
  const pinned = notes.filter((n) => n.pinned);
  const next = tasks.find((t) => t.status !== "done");
  const links = mapLinks(p);

  async function saveWhy() {
    if ((p.why_this_property ?? "") === why) return;
    const { error } = await createClient().from("properties").update({ why_this_property: why || null }).eq("id", p.id);
    if (error) toast.error(errorMessage(error));
    else router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Key numbers</CardTitle>
            {canResearch && <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}><Pencil /> Edit details</Button>}
          </CardHeader>
          <CardContent className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <KeyValue label="Asking price">{fmtMoney(p.asking_price)}</KeyValue>
              <KeyValue label="Land value">{fmtMoney(p.land_value)}</KeyValue>
              <KeyValue label="Structure value">{fmtMoney(p.structure_value)}</KeyValue>
              <KeyValue label="Taxes owed">{fmtMoney(tax?.redemption_amount)}</KeyValue>
              <KeyValue label="Owed / land">{tax?.owed_to_land_ratio === null || tax?.owed_to_land_ratio === undefined ? "—" : `${(tax.owed_to_land_ratio * 100).toFixed(0)}%`}</KeyValue>
              <KeyValue label="Years in default">{fmtNumber(tax?.years_in_default, 1)}</KeyValue>
            </div>
            <div>
              <KeyValue label="Acres">{fmtNumber(p.acres)}</KeyValue>
              <KeyValue label="Zoning (listed)">{p.zoning ?? "—"}{p.zoning_verified ? " ✓" : ""}</KeyValue>
              <KeyValue label="Distance to I-10">
                {p.distance_to_i10_mi === null ? "—" : `${fmtNumber(p.distance_to_i10_mi, 2)} mi`}
                {p.location_method && <span className="block text-xs font-normal text-muted-foreground">{LOCATION_METHOD_LABELS[p.location_method]}</span>}
              </KeyValue>
              <KeyValue label="Corridor zone">{ZONE_LABELS[p.corridor_zone]}</KeyValue>
              <KeyValue label="Nearest interchange">{p.nearest_interchange ? `${p.nearest_interchange} (${fmtNumber(p.distance_to_interchange_mi, 1)} mi)` : "—"}</KeyValue>
              <KeyValue label="Source">{SOURCE_LIST_LABELS[p.source_list]}{p.source_year ? ` ${p.source_year}` : ""}</KeyValue>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Why this property</CardTitle></CardHeader>
          <CardContent>
            {canResearch ? (
              <Textarea value={why} onChange={(e) => setWhy(e.target.value)} onBlur={saveWhy} rows={3} placeholder="The thesis in a sentence or two — saved when you click away." />
            ) : (
              <p className="whitespace-pre-wrap text-sm">{p.why_this_property || "—"}</p>
            )}
          </CardContent>
        </Card>

        {(p.property_description || p.legal_description) && (
          <Card>
            <CardHeader><CardTitle>Descriptions</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {p.property_description && <p>{p.property_description}</p>}
              {p.legal_description && <p className="text-muted-foreground">Legal: {p.legal_description}</p>}
              {p.mortgages_note && <p className="text-muted-foreground">Mortgages: {p.mortgages_note}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle>Owners</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {owners.length === 0 ? <p className="text-muted-foreground">Not found yet.</p> : owners.map((o, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="truncate">{o.owners?.name}</span>
                <span className="shrink-0 text-muted-foreground">{o.ownership_pct !== null ? `${o.ownership_pct}%` : ""}</span>
              </div>
            ))}
            <div className="mt-1 flex flex-wrap gap-1">
              {p.is_vacant && <Badge variant="secondary">Vacant</Badge>}
              {p.is_absentee && <Badge variant="secondary">Absentee</Badge>}
              {p.is_entity_owner && <Badge variant="secondary">Entity owner</Badge>}
              {p.dnc_flag && <Badge variant="destructive">Do not contact</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Next task</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {next ? (
              <>
                <div className="font-medium">{next.title}</div>
                <div className="text-xs text-muted-foreground">{TASK_CATEGORY_LABELS[next.category]} · due {fmtDate(next.due_date)}</div>
              </>
            ) : <p className="text-muted-foreground">No open tasks.</p>}
          </CardContent>
        </Card>

        {pinned.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1"><Pin className="size-3.5" /> Pinned notes</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {pinned.map((n) => (
                <div key={n.id} className="prose-note rounded-md bg-muted/60 p-2 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.body}</ReactMarkdown>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {links && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1"><MapPinned className="size-3.5" /> Look it up</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <a className="inline-flex items-center gap-1 text-primary" href={links.maps} target="_blank" rel="noreferrer">Google Maps <ExternalLink className="size-3" /></a>
              {links.street && <a className="inline-flex items-center gap-1 text-primary" href={links.street} target="_blank" rel="noreferrer">Street View <ExternalLink className="size-3" /></a>}
              <a className="inline-flex items-center gap-1 text-primary" href={links.sce} target="_blank" rel="noreferrer">SCE DRPEP grid capacity <ExternalLink className="size-3" /></a>
              {p.county === "riverside" && (
                <a className="inline-flex items-center gap-1 text-primary" href="https://gis.countyofriverside.us/Html5Viewer/?viewer=MMC_Public" target="_blank" rel="noreferrer">Riverside County Map My County <ExternalLink className="size-3" /></a>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <EditDetailsDialog open={editOpen} onOpenChange={setEditOpen} property={p} />
    </div>
  );
}

function EditDetailsDialog({ open, onOpenChange, property: p }: { open: boolean; onOpenChange: (o: boolean) => void; property: Property }) {
  const router = useRouter();
  const { canWrite } = usePermissions();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => (String(f.get(k) ?? "").trim() || null);
    const num = (k: string) => { const v = String(f.get(k) ?? "").replace(/[$,\s]/g, ""); return v === "" ? null : Number(v); };
    const tri = (k: string) => (f.get(k) === "" ? null : f.get(k) === "true");
    // Only send what changed, so the audit log and field provenance stay precise
    // (and analysts don't trip the column guard on untouched financial fields).
    const next: PropertyUpdate = {
      situs_address: str("situs_address"), situs_city: str("situs_city"), zip: str("zip"),
      acres: num("acres"), zoning: str("zoning"), land_use: str("land_use"),
      is_vacant: tri("is_vacant"), is_absentee: tri("is_absentee"),
      legal_description: str("legal_description"), property_description: str("property_description"),
      distance_to_i10_mi: num("distance_to_i10_mi"),
      ...(canWrite ? { land_value: num("land_value"), structure_value: num("structure_value"), asking_price: num("asking_price") } : {}),
    };
    const changed = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => (p as unknown as Record<string, unknown>)[k] !== v && !(v === null && (p as unknown as Record<string, unknown>)[k] === undefined)),
    ) as PropertyUpdate;
    if (changed.distance_to_i10_mi !== undefined && p.location_method !== "gis_polygon") changed.location_method = changed.distance_to_i10_mi === null ? null : "plss_estimate";
    if (!Object.keys(changed).length) return onOpenChange(false);
    setBusy(true);
    const { error } = await createClient().from("properties").update(changed).eq("id", p.id);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Saved");
    onOpenChange(false);
    router.refresh();
  }

  const triVal = (v: boolean | null) => (v === null ? "" : String(v));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit details" className="sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Situs address" className="sm:col-span-2"><Input name="situs_address" defaultValue={p.situs_address ?? ""} /></Field>
          <Field label="City"><Input name="situs_city" defaultValue={p.situs_city ?? ""} /></Field>
          <Field label="ZIP"><Input name="zip" defaultValue={p.zip ?? ""} inputMode="numeric" /></Field>
          <Field label="Acres"><Input name="acres" type="number" step="0.0001" defaultValue={p.acres ?? ""} /></Field>
          <Field label="Zoning (as listed)"><Input name="zoning" defaultValue={p.zoning ?? ""} /></Field>
          <Field label="Land use"><Input name="land_use" defaultValue={p.land_use ?? ""} /></Field>
          <Field label="Miles to I-10" hint={p.location_method === "gis_polygon" ? "Measured from the parcel polygon" : "Estimate until GIS geometry is loaded (Phase 2)"}>
            <Input name="distance_to_i10_mi" type="number" step="0.01" defaultValue={p.distance_to_i10_mi ?? ""} disabled={p.location_method === "gis_polygon"} />
          </Field>
          {canWrite && (
            <>
              <Field label="Land value $"><Input name="land_value" inputMode="decimal" defaultValue={p.land_value ?? ""} /></Field>
              <Field label="Structure value $"><Input name="structure_value" inputMode="decimal" defaultValue={p.structure_value ?? ""} /></Field>
              <Field label="Asking price $"><Input name="asking_price" inputMode="decimal" defaultValue={p.asking_price ?? ""} /></Field>
            </>
          )}
          <Field label="Vacant">
            <NativeSelect name="is_vacant" defaultValue={triVal(p.is_vacant)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></NativeSelect>
          </Field>
          <Field label="Absentee owner">
            <NativeSelect name="is_absentee" defaultValue={triVal(p.is_absentee)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></NativeSelect>
          </Field>
          <Field label="Property description" className="sm:col-span-2"><Textarea name="property_description" rows={2} defaultValue={p.property_description ?? ""} /></Field>
          <Field label="Legal description" className="sm:col-span-2"><Textarea name="legal_description" rows={2} defaultValue={p.legal_description ?? ""} /></Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
