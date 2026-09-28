"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtMoney, fmtNumber, daysSince } from "@/lib/utils";
import { COUNTY_LABELS, LOCATION_METHOD_LABELS, ZONE_SHORT } from "@/lib/labels";
import type { SortKey } from "@/lib/filters";
import type { Database } from "@/lib/database.types";
import { AssigneeSelect, PrioritySelect, StatusSelect, StrategyBadge, TagEditor } from "./inline-edits";

export type GridRow = Database["public"]["Views"]["property_grid"]["Row"];

export interface ColumnCtx {
  requestStatus: (id: string, status: string) => Promise<boolean>;
}

export interface ColumnDef {
  id: string;
  label: string;
  sort?: SortKey;
  align?: "right";
  defaultVisible?: boolean;
  width?: string;
  cell: (r: GridRow, ctx: ColumnCtx) => React.ReactNode;
}

const num = (v: number | null, d = 2) => fmtNumber(v, d);

export const COLUMNS: ColumnDef[] = [
  {
    id: "apn", label: "APN", sort: "apn", defaultVisible: true, width: "9.5rem",
    cell: (r) => (
      <Link href={`/properties/${r.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
        {r.apn_display}
      </Link>
    ),
  },
  {
    id: "address", label: "Address", sort: "situs_city", defaultVisible: true,
    cell: (r) => (
      <div className="min-w-40">
        <div className="truncate">{r.situs_address ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{[r.situs_city, r.county ? COUNTY_LABELS[r.county] : null].filter(Boolean).join(" · ")}</div>
      </div>
    ),
  },
  { id: "acres", label: "Acres", sort: "acres", align: "right", defaultVisible: true, cell: (r) => num(r.acres) },
  {
    id: "distance", label: "Mi to I-10", sort: "distance_to_i10_mi", align: "right", defaultVisible: true,
    cell: (r) => (
      <span title={r.location_method ? LOCATION_METHOD_LABELS[r.location_method] : undefined}>
        {num(r.distance_to_i10_mi, 1)}
        {r.location_method && r.location_method !== "gis_polygon" && r.distance_to_i10_mi !== null && <span className="text-muted-foreground">~</span>}
      </span>
    ),
  },
  { id: "zone", label: "Zone", defaultVisible: true, cell: (r) => (r.corridor_zone ? <Badge variant={r.corridor_zone === "i10_corridor" ? "default" : "secondary"}>{ZONE_SHORT[r.corridor_zone]}</Badge> : "—") },
  { id: "strategy", label: "Strategy", sort: "strategy", defaultVisible: true, cell: (r) => <StrategyBadge value={r.strategy} /> },
  { id: "status", label: "Status", sort: "lead_status", defaultVisible: true, cell: (r, ctx) => <StatusSelect id={r.id!} value={r.lead_status!} onRequest={ctx.requestStatus} /> },
  { id: "assignee", label: "Assignee", defaultVisible: true, cell: (r) => <AssigneeSelect id={r.id!} value={r.assignee_id} /> },
  { id: "priority", label: "Priority", sort: "priority", defaultVisible: false, cell: (r) => <PrioritySelect id={r.id!} value={r.priority} /> },
  { id: "tags", label: "Tags", defaultVisible: true, cell: (r) => <TagEditor id={r.id!} value={r.tags ?? []} compact /> },
  { id: "land_value", label: "Land value", sort: "land_value", align: "right", defaultVisible: true, cell: (r) => fmtMoney(r.land_value) },
  { id: "structure_value", label: "Structure", align: "right", cell: (r) => fmtMoney(r.structure_value) },
  { id: "asking", label: "Asking", sort: "asking_price", align: "right", cell: (r) => fmtMoney(r.asking_price) },
  { id: "owed", label: "Taxes owed", sort: "redemption_amount", align: "right", defaultVisible: true, cell: (r) => fmtMoney(r.redemption_amount) },
  { id: "owed_land", label: "Owed/Land", sort: "owed_to_land_ratio", align: "right", cell: (r) => (r.owed_to_land_ratio === null ? "—" : `${(Number(r.owed_to_land_ratio) * 100).toFixed(0)}%`) },
  { id: "yid", label: "Yrs default", sort: "years_in_default", align: "right", defaultVisible: true, cell: (r) => num(r.years_in_default, 1) },
  { id: "auction", label: "Auction", sort: "auction_date", cell: (r) => (r.auction_date ? `${fmtDate(r.auction_date)}${r.auction_status && r.auction_status !== "none" ? ` · ${r.auction_status}` : ""}` : "—") },
  { id: "owner", label: "Owner(s)", cell: (r) => <span className="line-clamp-2 min-w-32 text-xs">{r.owner_names ?? "—"}</span> },
  { id: "contact", label: "Contact", cell: (r) => <span className="text-xs">{[r.has_phone && "Phone", r.has_email && "Email"].filter(Boolean).join(" · ") || "—"}</span> },
  { id: "flags", label: "Flags", cell: (r) => <span className="flex gap-1">{r.is_vacant && <Badge variant="secondary">Vacant</Badge>}{r.is_absentee && <Badge variant="secondary">Absentee</Badge>}{r.is_entity_owner && <Badge variant="secondary">Entity</Badge>}</span> },
  { id: "ev", label: "EV", sort: "ev_score", align: "right", cell: (r) => num(r.ev_score, 1) },
  { id: "bigrig", label: "Big-rig", sort: "big_rig_access_score", align: "right", cell: (r) => num(r.big_rig_access_score, 1) },
  { id: "zoning", label: "Zoning", cell: (r) => r.zoning ?? "—" },
  { id: "interchange", label: "Nearest interchange", cell: (r) => <span className="text-xs">{r.nearest_interchange ?? "—"}</span> },
  { id: "next_task", label: "Next task", cell: (r) => (r.next_task_title ? <span className="text-xs">{r.next_task_title}{r.next_task_due ? ` · ${fmtDate(r.next_task_due)}` : ""}</span> : "—") },
  {
    id: "last_activity", label: "Last activity", sort: "last_activity_at", defaultVisible: true,
    cell: (r) => {
      const d = daysSince(r.last_activity_at);
      return <span className="text-xs text-muted-foreground">{d === null ? "never" : d === 0 ? "today" : `${d}d ago`}</span>;
    },
  },
];

export const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
export const DEFAULT_HIDDEN = COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.id);
