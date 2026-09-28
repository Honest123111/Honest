import "server-only";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { cellText } from "./normalize";
import { detectFormat, detectHeaderRow, FORMATS, suggestMapping, type SourceType, type TargetField } from "./fields";

export interface RawSheet { name: string; rows: unknown[][] }

/** Read every sheet of an .xlsx or a .csv into arrays of cell values. */
export async function readWorkbook(buf: ArrayBuffer, fileName: string): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    await wb.csv.read(Readable.from(Buffer.from(buf)), { parserOptions: { trim: true } } as never);
  } else {
    await wb.xlsx.load(buf);
  }
  const out: RawSheet[] = [];
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals = (row.values as unknown[]).slice(1); // exceljs rows are 1-based
      rows[n - 1] = vals;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    out.push({ name: ws.name, rows });
  });
  return out;
}

export interface SheetConfig {
  name: string;
  include: boolean;
  headerRow: number; // 1-based
  mapping: Record<string, TargetField | null>;
}

export interface SheetInfo extends SheetConfig {
  headers: string[];
  rowCount: number;
  sample: Record<string, string | null>[];
  detected: SourceType;
}

export function headersAt(sheet: RawSheet, headerRow: number): string[] {
  const seen = new Map<string, number>();
  return (sheet.rows[headerRow - 1] ?? []).map((h, i) => {
    const base = cellText(h) ?? `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

export function sheetRecords(sheet: RawSheet, headerRow: number): { rowNumber: number; data: Record<string, unknown> }[] {
  const headers = headersAt(sheet, headerRow);
  const out: { rowNumber: number; data: Record<string, unknown> }[] = [];
  for (let i = headerRow; i < sheet.rows.length; i++) {
    const r = sheet.rows[i] ?? [];
    if (!r.some((v) => cellText(v) !== null)) continue;
    const data: Record<string, unknown> = {};
    headers.forEach((h, j) => { data[h] = r[j] ?? null; });
    out.push({ rowNumber: i + 1, data });
  }
  return out;
}

/** Detect header rows, format and a suggested mapping for each sheet. */
export function inspect(sheets: RawSheet[]): { sheets: SheetInfo[]; sourceType: SourceType } {
  const infos = sheets.map((s) => {
    const headerRow = detectHeaderRow(s.rows) + 1;
    const headers = headersAt(s, headerRow);
    const detected = detectFormat(headers);
    const records = sheetRecords(s, headerRow);
    return {
      name: s.name,
      headerRow,
      headers,
      rowCount: records.length,
      detected,
      include: true,
      mapping: {} as Record<string, TargetField | null>,
      sample: records.slice(0, 3).map((r) => Object.fromEntries(headers.map((h) => [h, cellText(r.data[h])]))),
    };
  });
  // the file's format = the most common detection among sheets with rows
  const votes = new Map<SourceType, number>();
  infos.filter((i) => i.rowCount).forEach((i) => votes.set(i.detected, (votes.get(i.detected) ?? 0) + i.rowCount));
  const sourceType = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "generic";
  const skip = FORMATS[sourceType].skipSheets;
  for (const i of infos) {
    i.mapping = suggestMapping(i.headers, sourceType);
    i.include = i.rowCount > 0 && !(skip && skip.test(i.name));
  }
  // off-market workbooks: Sheet2 is sold history → comps, not active parcels
  if (sourceType === "off_market_list") {
    for (const i of infos.slice(1)) if (/sold|sheet2|comps?/i.test(i.name)) i.include = false;
  }
  return { sheets: infos, sourceType };
}
