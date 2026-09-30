/**
 * Property filters, shared by the table, CSV export and (Phase 2) the map.
 * State lives in the URL so views are linkable; saved views store the same
 * query string.
 */

export interface PropertyFilters {
  q?: string;
  county?: string[];
  city?: string;
  zone?: string[];
  dmin?: number; // miles to I-10
  dmax?: number;
  amin?: number; // acres
  amax?: number;
  strategy?: string[];
  status?: string[];
  assignee?: string; // uuid | "me" | "none"
  vacant?: "y" | "n";
  absentee?: "y" | "n";
  entity?: "y" | "n";
  ydmin?: number; // years in default ≥
  olmin?: number; // owed/land ratio
  olmax?: number;
  evmin?: number;
  tags?: string[];
  phone?: "y";
  email?: "y";
  owner?: "y" | "n";
  act_before?: string; // last activity before (yyyy-mm-dd) — "not touched since"
  act_after?: string;
  auction?: "soon";
  stale?: "1";
}

export const SORTABLE = [
  "apn", "situs_city", "acres", "distance_to_i10_mi", "land_value", "asking_price", "lead_status", "strategy",
  "priority", "ev_score", "big_rig_access_score", "overall_score", "site_score", "years_in_default", "owed_to_land_ratio",
  "redemption_amount", "auction_date", "last_activity_at", "created_at", "updated_at",
] as const;
export type SortKey = (typeof SORTABLE)[number];

const LIST = ["county", "zone", "strategy", "status", "tags"] as const;
const NUM = ["dmin", "dmax", "amin", "amax", "ydmin", "olmin", "olmax", "evmin"] as const;
const TEXT = ["q", "city", "assignee", "vacant", "absentee", "entity", "phone", "email", "owner", "act_before", "act_after", "auction", "stale"] as const;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (p: Params, k: string): string | undefined => {
  if (p instanceof URLSearchParams) return p.get(k) ?? undefined;
  const v = p[k];
  return Array.isArray(v) ? v[0] : v;
};

export function parseFilters(p: Params): PropertyFilters {
  const f: Record<string, unknown> = {};
  for (const k of LIST) {
    const v = read(p, k);
    if (v) f[k] = v.split(",").filter(Boolean);
  }
  for (const k of NUM) {
    const v = read(p, k);
    if (v !== undefined && v !== "" && Number.isFinite(Number(v))) f[k] = Number(v);
  }
  for (const k of TEXT) {
    const v = read(p, k);
    if (v) f[k] = v;
  }
  return f as PropertyFilters;
}

export function filtersToParams(f: PropertyFilters): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return out;
}

export function countActive(f: PropertyFilters): number {
  return Object.entries(f).filter(([k, v]) => k !== "q" && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)).length;
}

export function parseSort(p: Params): { key: SortKey; asc: boolean } {
  const raw = read(p, "sort") ?? "";
  const [key, dir] = raw.split(".");
  if ((SORTABLE as readonly string[]).includes(key)) return { key: key as SortKey, asc: dir !== "desc" };
  return { key: "updated_at", asc: false };
}

interface Ctx {
  meId: string;
  today: string; // yyyy-mm-dd
  auctionDays: number;
  staleDays: number;
  /** lead_status keys that count as closed/dead (excluded from "stale") */
  terminalStatuses: string[];
}

// Minimal structural type for the PostgREST filter builder methods we use.
export interface FilterBuilder<T> {
  in(col: string, v: readonly unknown[]): T;
  eq(col: string, v: unknown): T;
  gte(col: string, v: unknown): T;
  lte(col: string, v: unknown): T;
  lt(col: string, v: unknown): T;
  gt(col: string, v: unknown): T;
  is(col: string, v: null | boolean): T;
  ilike(col: string, v: string): T;
  or(filters: string): T;
  overlaps(col: string, v: readonly unknown[]): T;
  not(col: string, op: string, v: unknown): T;
}

const esc = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

export function applyFilters<T extends FilterBuilder<T>>(query: T, f: PropertyFilters, ctx: Ctx): T {
  let q = query;
  // OR-groups are combined into a single and(or(..),or(..)) at the end
  const orGroups: string[] = [];
  if (f.q) {
    const term = esc(f.q);
    const digits = f.q.replace(/\D/g, "");
    const parts = [`situs_address.ilike.*${term}*`, `situs_city.ilike.*${term}*`, `owner_names.ilike.*${term}*`];
    if (digits.length >= 3) parts.push(`apn.like.${digits}*`);
    orGroups.push(parts.join(","));
  }
  if (f.county?.length) q = q.in("county", f.county);
  if (f.city) q = q.ilike("situs_city", `%${esc(f.city)}%`);
  if (f.zone?.length) q = q.in("corridor_zone", f.zone);
  if (f.dmin !== undefined) q = q.gte("distance_to_i10_mi", f.dmin);
  if (f.dmax !== undefined) q = q.lte("distance_to_i10_mi", f.dmax);
  if (f.amin !== undefined) q = q.gte("acres", f.amin);
  if (f.amax !== undefined) q = q.lte("acres", f.amax);
  if (f.strategy?.length) q = q.in("strategy", f.strategy);
  if (f.status?.length) q = q.in("lead_status", f.status);
  if (f.assignee === "me") q = q.eq("assignee_id", ctx.meId);
  else if (f.assignee === "none") q = q.is("assignee_id", null);
  else if (f.assignee) q = q.eq("assignee_id", f.assignee);
  for (const [k, col] of [["vacant", "is_vacant"], ["absentee", "is_absentee"], ["entity", "is_entity_owner"]] as const) {
    if (f[k]) q = q.eq(col, f[k] === "y");
  }
  if (f.ydmin !== undefined) q = q.gte("years_in_default", f.ydmin);
  if (f.olmin !== undefined) q = q.gte("owed_to_land_ratio", f.olmin);
  if (f.olmax !== undefined) q = q.lte("owed_to_land_ratio", f.olmax);
  if (f.evmin !== undefined) q = q.gte("ev_score", f.evmin);
  if (f.tags?.length) q = q.overlaps("tags", f.tags);
  if (f.phone) q = q.eq("has_phone", true);
  if (f.email) q = q.eq("has_email", true);
  if (f.owner === "y") q = q.gt("owner_count", 0);
  if (f.owner === "n") q = q.eq("owner_count", 0);
  if (f.act_before) orGroups.push(`last_activity_at.is.null,last_activity_at.lt.${f.act_before}`);
  if (f.act_after) q = q.gte("last_activity_at", f.act_after);
  if (f.auction === "soon") {
    const end = new Date(Date.parse(ctx.today) + ctx.auctionDays * 86_400_000).toISOString().slice(0, 10);
    q = q.gte("auction_date", ctx.today).lte("auction_date", end);
  }
  if (f.stale) {
    const cutoff = new Date(Date.now() - ctx.staleDays * 86_400_000).toISOString();
    q = q.not("lead_status", "in", `(${ctx.terminalStatuses.join(",")})`);
    orGroups.push(`lead_status.neq.new,assignee_id.not.is.null`);
    // same rule as dashboard_stats(): no activity since the cutoff, counting creation as activity
    orGroups.push(`last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff})`);
  }
  if (orGroups.length === 1) q = q.or(orGroups[0]);
  else if (orGroups.length > 1) q = q.or(`and(${orGroups.map((g) => `or(${g})`).join(",")})`);
  return q;
}

/** Built-in starting views (users can save their own on top). */
export const SUGGESTED_VIEWS: { name: string; query: string }[] = [
  { name: "I-10 ≤2 mi – Large acreage", query: "zone=i10_corridor&amin=5&sort=acres.desc" },
  { name: "Auction watch – next 60 days", query: "auction=soon&sort=auction_date.asc" },
  { name: "Owner found – not contacted", query: "status=owner_found&sort=last_activity_at.asc" },
  { name: "EV candidates", query: "tags=EV Candidate&sort=big_rig_access_score.desc" },
];
