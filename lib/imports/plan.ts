import { classifyStrategy, DEFAULT_RULES, type StrategyRule } from "@/lib/rules/strategy";
import type { NormProperty, NormRow } from "./normalize";

/**
 * Import planning (pure): merges duplicate APNs within the file, matches rows
 * to existing properties by (county, apn), and decides per field whether the
 * incoming value is new, unchanged, or a conflict with a user-edited value.
 *
 * Rules (§6.9):
 *   - never create a duplicate APN
 *   - never overwrite a user-edited field without confirmation → "conflict"
 *   - values last written by an import may be refreshed by a newer import
 *   - empty incoming values never blank out existing data
 */

export type Action = "create" | "update" | "unchanged" | "conflict" | "error" | "skip";

export interface ExistingProperty extends NormProperty {
  id: string;
  county: string;
  apn: string;
  source_list?: string | null;
  field_sources: Record<string, { src?: string } | undefined> | null;
}

export interface FieldConflict {
  current: unknown;
  incoming: unknown;
  current_src: string | null;
}

export interface PlannedRow extends NormRow {
  action: Action;
  property_id: string | null;
  /** fields to write (create: everything non-null; update: new/changed non-conflicting) */
  changes: Record<string, unknown>;
  conflicts: Record<string, FieldConflict>;
  merged_rows: number[];
  message: string | null;
}

const key = (county: string | null, apn: string | null) => `${county}:${apn}`;

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return Math.abs(na - nb) < 0.005;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Later duplicate rows fill gaps in the first row and add their owners/contacts/notes. */
function mergeInto(target: NormRow, dup: NormRow) {
  for (const [k, v] of Object.entries(dup.property)) {
    const cur = (target.property as Record<string, unknown>)[k];
    if ((cur === null || cur === undefined) && v !== null && v !== undefined) {
      (target.property as Record<string, unknown>)[k] = v;
    }
  }
  target.create_only.strategy ??= dup.create_only.strategy;
  target.create_only.lead_status ??= dup.create_only.lead_status;
  target.tax ??= dup.tax;
  const known = new Set(target.owners.map((o) => o.name.toLowerCase()));
  const offset = target.owners.length;
  dup.owners.forEach((o) => {
    if (!known.has(o.name.toLowerCase())) target.owners.push(o);
  });
  dup.contacts.forEach((c) => target.contacts.push({ ...c, owner_index: Math.min(c.owner_index + offset, target.owners.length - 1) }));
  if (dup.note && dup.note !== target.note) target.note = [target.note, dup.note].filter(Boolean).join("\n\n");
}

export function planImport(
  rows: NormRow[],
  existing: Map<string, ExistingProperty>,
  rules: StrategyRule[] = DEFAULT_RULES,
): PlannedRow[] {
  const firstByKey = new Map<string, PlannedRow>();
  const out: PlannedRow[] = [];

  for (const row of rows) {
    const base: PlannedRow = {
      ...row,
      action: "error",
      property_id: null,
      changes: {},
      conflicts: {},
      merged_rows: [],
      message: null,
    };
    if (row.errors.length) {
      base.message = row.errors.join("; ");
      out.push(base);
      continue;
    }
    const k = key(row.county, row.apn);
    const first = firstByKey.get(k);
    if (first) {
      mergeInto(first, row);
      first.merged_rows.push(row.row_number);
      out.push({ ...base, action: "skip", message: `Duplicate APN — merged into ${first.sheet} row ${first.row_number}` });
      continue;
    }
    firstByKey.set(k, base);
    out.push(base);
  }

  // Decide actions after merging, so merged values are considered.
  for (const r of firstByKey.values()) {
    const cur = existing.get(key(r.county, r.apn));
    const incoming = Object.entries(r.property).filter(([, v]) => v !== null && v !== undefined && v !== "");

    if (!cur) {
      r.action = "create";
      r.changes = Object.fromEntries(incoming);
      const facts = { ...r.property, years_in_default: r.tax?.years_in_default ?? null };
      r.changes.strategy = r.create_only.strategy ?? classifyStrategy(facts, rules);
      if (r.create_only.lead_status) r.changes.lead_status = r.create_only.lead_status;
      continue;
    }

    r.property_id = cur.id;
    const sources = cur.field_sources ?? {};
    // A parcel located from its real GIS polygon keeps its measured distance.
    const measured = cur.location_method === "gis_polygon";
    for (const [field, value] of incoming) {
      if (measured && (field === "distance_to_i10_mi" || field === "location_method")) continue;
      const current = (cur as unknown as Record<string, unknown>)[field];
      if (current === null || current === undefined || current === "") {
        r.changes[field] = value;
      } else if (!valuesEqual(current, value)) {
        const src = sources[field]?.src ?? null;
        // user-edited (or manually created, which has no import provenance) → ask first
        if (src === "user" || (src === null && cur.source_list === "manual")) {
          r.conflicts[field] = { current, incoming: value, current_src: src };
        } else {
          r.changes[field] = value;
        }
      }
    }
    const extras = !!r.tax || r.owners.length > 0 || r.contacts.length > 0 || !!r.note;
    r.action = Object.keys(r.conflicts).length
      ? "conflict"
      : Object.keys(r.changes).length || extras
        ? "update"
        : "unchanged";
  }
  return out;
}

export function summarize(rows: PlannedRow[]) {
  const counts: Record<Action, number> = { create: 0, update: 0, unchanged: 0, conflict: 0, error: 0, skip: 0 };
  rows.forEach((r) => counts[r.action]++);
  return { ...counts, total: rows.length, matched: counts.update + counts.unchanged + counts.conflict };
}
