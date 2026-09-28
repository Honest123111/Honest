"use server";

import { revalidatePath } from "next/cache";
import { assertRole, can } from "@/lib/auth";
import { FORMATS, type SourceType } from "@/lib/imports/fields";
import { normalizeRow, type NormRow } from "@/lib/imports/normalize";
import { planImport, summarize, type ExistingProperty, type PlannedRow } from "@/lib/imports/plan";
import { inspect, readWorkbook, sheetRecords, type SheetConfig, type SheetInfo } from "@/lib/imports/workbook";
import type { StrategyRule } from "@/lib/rules/strategy";
import type { County } from "@/lib/apn";
import type { Json } from "@/lib/database.types";

export interface ImportConfig {
  sourceType: SourceType;
  county: County | null;
  snapshotDate: string | null;
  sheets: SheetConfig[];
}

async function loadFile(importId: string) {
  const s = await assertRole(can.write, "run imports");
  const { data: imp, error } = await s.supabase.from("imports").select("*").eq("id", importId).single();
  if (error || !imp?.file_path) throw new Error(error?.message ?? "Import not found");
  const dl = await s.supabase.storage.from("imports").download(imp.file_path);
  if (dl.error) throw new Error(`Couldn't read the uploaded file: ${dl.error.message}`);
  const sheets = await readWorkbook(await dl.data.arrayBuffer(), imp.file_name);
  return { ...s, imp, sheets };
}

/** Step 1: register an upload (already in Storage) and suggest a mapping. */
export async function registerImport(input: { importId: string; path: string; fileName: string }) {
  const { supabase, profile } = await assertRole(can.write, "run imports");
  if (!input.path.startsWith(`${input.importId}/`)) throw new Error("Bad upload path");
  const { error } = await supabase.from("imports").insert({
    id: input.importId, file_name: input.fileName, file_path: input.path, status: "uploaded", imported_by: profile.id,
  });
  if (error) throw new Error(error.message);
  const { sourceType, sheets } = await inspectImport(input.importId);
  await supabase.from("imports").update({ source_type: sourceType, sheet_name: sheets.map((s) => s.name).join(", ") }).eq("id", input.importId);
  return input.importId;
}

export async function inspectImport(importId: string): Promise<{ sourceType: SourceType; sheets: SheetInfo[] }> {
  const { sheets } = await loadFile(importId);
  return inspect(sheets);
}

/** Step 2: map + normalize + plan against existing parcels; stage rows. */
export async function previewImport(importId: string, config: ImportConfig) {
  const { supabase, imp, sheets } = await loadFile(importId);
  if (imp.status === "committed" || imp.status === "committing") throw new Error("This import was already committed.");
  const spec = FORMATS[config.sourceType];
  const taxSource = `${config.sourceType}:${imp.file_name}`;

  const rows: NormRow[] = [];
  for (const sc of config.sheets.filter((s) => s.include)) {
    const sheet = sheets.find((s) => s.name === sc.name);
    if (!sheet) continue;
    for (const r of sheetRecords(sheet, sc.headerRow)) {
      rows.push(
        normalizeRow(r.data, sc.mapping, r.rowNumber, sc.name, {
          defaultCounty: config.county,
          snapshotDate: config.snapshotDate,
          taxSource,
          deriveYearsInDefault: config.sourceType === "tax_default_inventory",
        }),
      );
    }
  }
  if (rows.length > 20000) throw new Error("That's more than 20,000 rows — split the file.");

  let planned: PlannedRow[];
  if (config.sourceType === "sold_comps") {
    planned = rows.map((r) => ({
      ...r,
      action: r.errors.length || !r.comp ? "error" : "create",
      property_id: null, changes: {}, conflicts: {}, merged_rows: [],
      message: r.errors.join("; ") || (r.comp ? null : "No sale date or price"),
    })) as PlannedRow[];
  } else {
    // existing parcels for every (county, apn) in the file
    const existing = new Map<string, ExistingProperty>();
    const byCounty = new Map<string, string[]>();
    rows.forEach((r) => { if (r.county && r.apn && !r.errors.length) byCounty.set(r.county, [...(byCounty.get(r.county) ?? []), r.apn]); });
    for (const [county, apns] of byCounty) {
      const uniq = [...new Set(apns)];
      for (let i = 0; i < uniq.length; i += 300) {
        const { data, error } = await supabase
          .from("properties")
          .select("id, county, apn, source_list, field_sources, situs_address, situs_city, zip, legal_description, tax_rate_area, map_book, thomas_bros_page, thomas_bros_grid, acres, zoning, land_use, property_description, land_value, structure_value, asking_price, mortgages_note, distance_to_i10_mi, location_method, is_vacant, is_absentee, is_entity_owner")
          .eq("county", county as County)
          .in("apn", uniq.slice(i, i + 300));
        if (error) throw new Error(error.message);
        data?.forEach((p) => existing.set(`${p.county}:${p.apn}`, p as unknown as ExistingProperty));
      }
    }
    const { data: ruleRows } = await supabase.from("strategy_rules").select("sort_order, strategy_key, conditions, enabled");
    planned = planImport(rows, existing, (ruleRows ?? []) as unknown as StrategyRule[]);
  }

  // stage rows (replace any earlier preview of this import)
  const del = await supabase.from("import_rows").delete().eq("import_id", importId);
  if (del.error) throw new Error(del.error.message);
  const sourceYear = config.snapshotDate ? Number(config.snapshotDate.slice(0, 4)) : null;
  const staged = planned.map((p, i) => ({
    import_id: importId,
    row_number: i + 1, // unique across sheets; the sheet row is kept in mapped.sheet_row
    apn: p.apn,
    property_id: p.property_id,
    action: p.action,
    raw: {} as Json,
    error: p.message,
    conflicts: Object.keys(p.conflicts).length ? (p.conflicts as unknown as Json) : null,
    mapped: {
      sheet: p.sheet, sheet_row: p.row_number, county: p.county, apn: p.apn,
      source_list: spec.sourceList, source_year: sourceYear,
      changes: p.changes, conflicts: p.conflicts, tax: p.tax, owners: p.owners, contacts: p.contacts,
      note: p.note, comp: p.comp, merged_rows: p.merged_rows,
    } as unknown as Json,
  }));
  for (let i = 0; i < staged.length; i += 500) {
    const { error } = await supabase.from("import_rows").insert(staged.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  const s = summarize(planned);
  const errors = planned.filter((p) => p.action === "error").slice(0, 500).map((p) => ({ sheet: p.sheet, row: p.row_number, apn: p.apn, error: p.message }));
  await supabase.from("imports").update({
    status: "previewed",
    source_type: config.sourceType,
    county: config.county,
    row_count: s.total,
    matched: s.matched,
    created: s.create,
    updated: s.update,
    conflicts: s.conflict,
    errors: errors as unknown as Json,
    column_mapping: config as unknown as Json,
  }).eq("id", importId);
  revalidatePath(`/imports/${importId}`);
  return s;
}

/** Conflict decisions: per row+field, or everything at once. */
export async function resolveConflicts(importId: string, decision: { rowId?: number; field?: string; value: "overwrite" | "keep" }) {
  const { supabase } = await assertRole(can.write, "run imports");
  let q = supabase.from("import_rows").select("id, conflicts, conflict_resolution").eq("import_id", importId).eq("action", "conflict");
  if (decision.rowId) q = q.eq("id", decision.rowId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const fields = decision.field ? [decision.field] : Object.keys((r.conflicts ?? {}) as object);
    const next = { ...((r.conflict_resolution ?? {}) as Record<string, string>) };
    fields.forEach((f) => (next[f] = decision.value));
    const u = await supabase.from("import_rows").update({ conflict_resolution: next }).eq("id", r.id);
    if (u.error) throw new Error(u.error.message);
  }
  revalidatePath(`/imports/${importId}`);
}

/** Step 3: commit one batch; the client calls this until remaining = 0. */
export async function commitBatch(importId: string) {
  const { supabase } = await assertRole(can.write, "run imports");
  const { data, error } = await supabase.rpc("commit_import", { p_import_id: importId, p_limit: 150 });
  if (error) throw new Error(error.message);
  const res = data as { created: number; updated: number; comps: number; remaining: number };
  if (res.remaining === 0) {
    revalidatePath("/imports");
    revalidatePath("/properties");
    revalidatePath("/");
  }
  return res;
}

export async function cancelImport(importId: string) {
  const { supabase } = await assertRole(can.write, "run imports");
  const { data: imp } = await supabase.from("imports").select("status, file_path").eq("id", importId).single();
  if (imp?.status === "committed" || imp?.status === "committing") throw new Error("Committed imports can't be cancelled.");
  await supabase.from("import_rows").delete().eq("import_id", importId);
  await supabase.from("imports").update({ status: "cancelled" }).eq("id", importId);
  revalidatePath("/imports");
}

/** Headers + sample for a sheet when the user picks a different header row. */
export async function sheetHeaders(importId: string, sheetName: string, headerRow: number) {
  const { sheets } = await loadFile(importId);
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error("Sheet not found");
  const { headersAt } = await import("@/lib/imports/workbook");
  const headers = headersAt(sheet, headerRow);
  const records = sheetRecords(sheet, headerRow);
  const { cellText } = await import("@/lib/imports/normalize");
  return {
    headers,
    rowCount: records.length,
    sample: records.slice(0, 3).map((r) => Object.fromEntries(headers.map((h) => [h, cellText(r.data[h])]))),
  };
}

/** Go back from the preview to the mapping step (before commit only). */
export async function reopenMapping(importId: string) {
  const { supabase } = await assertRole(can.write, "run imports");
  const { data: imp } = await supabase.from("imports").select("status").eq("id", importId).single();
  if (imp?.status !== "previewed") throw new Error("Only a previewed import can be re-mapped.");
  await supabase.from("import_rows").delete().eq("import_id", importId);
  await supabase.from("imports").update({ status: "uploaded" }).eq("id", importId);
  revalidatePath(`/imports/${importId}`);
}
