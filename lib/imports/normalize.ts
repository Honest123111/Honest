import { apnFromBookPageParcel, isValidApn, normalizeApn, parseCounty, type County } from "@/lib/apn";
import type { TargetField } from "./fields";

export type OwnerType = "individual" | "entity" | "trust" | "estate" | "government" | "unknown";

export interface NormOwner {
  name: string;
  owner_type: OwnerType;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  ownership_pct: number | null;
}

export interface NormContact {
  owner_index: number; // index into owners[]
  phone: string | null;
  email: string | null;
}

export interface NormTax {
  snapshot_date: string;
  source: string;
  power_to_sell_date: string | null;
  years_in_default: number | null;
  advalorem: number | null;
  specials: number | null;
  redemption_amount: number | null;
  owed_to_land_ratio: number | null;
}

export interface NormComp {
  sale_date: string | null;
  sale_price: number | null;
  acres: number | null;
  situs_city: string | null;
  zoning: string | null;
}

/** Columns written straight onto public.properties. */
export interface NormProperty {
  situs_address?: string | null;
  situs_city?: string | null;
  zip?: string | null;
  legal_description?: string | null;
  tax_rate_area?: string | null;
  map_book?: string | null;
  thomas_bros_page?: string | null;
  thomas_bros_grid?: string | null;
  acres?: number | null;
  zoning?: string | null;
  land_use?: string | null;
  property_description?: string | null;
  land_value?: number | null;
  structure_value?: number | null;
  asking_price?: number | null;
  mortgages_note?: string | null;
  distance_to_i10_mi?: number | null;
  location_method?: "gis_polygon" | "plss_estimate" | "mapbook_avg" | "geocode" | null;
  is_vacant?: boolean | null;
  is_absentee?: boolean | null;
  is_entity_owner?: boolean | null;
}

export interface NormRow {
  row_number: number; // 1-based row in the sheet
  sheet: string;
  county: County | null;
  apn: string | null;
  errors: string[];
  property: NormProperty;
  /** only applied when the property is created */
  create_only: { strategy?: string | null; lead_status?: string | null };
  tax: NormTax | null;
  owners: NormOwner[];
  contacts: NormContact[];
  note: string | null;
  comp: NormComp | null;
}

// ---------------------------------------------------------------------------
// value parsers
// ---------------------------------------------------------------------------
export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // exceljs rich text / hyperlink / formula cells
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return cellText(o.richText.map((r) => r.text).join(""));
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return cellText(o.text);
    return null;
  }
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "—" || s === "-" || s.toLowerCase() === "n/a" ? null : s;
}

export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = cellText(v);
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[$,%\s()]/g, "").replace(/^~/, "");
  // ranges like "1.5–2.5": take the midpoint
  const range = cleaned.match(/^(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const m = cleaned.match(/^-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Money like "$630,000", "630K", "1.2M". */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return v;
  const s = cellText(v);
  if (!s) return null;
  const m = s.replace(/[$,\s]/g, "").match(/^(-?\d+(?:\.\d+)?)([kKmM])?/);
  if (!m) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : 1;
  return Number(m[1]) * mult;
}

/** Excel serial, JS Date, ISO, or US m/d/yyyy → yyyy-mm-dd. */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export function guessOwnerType(name: string): OwnerType {
  const n = ` ${name.toUpperCase()} `;
  if (/\b(COUNTY OF|CITY OF|STATE OF|UNITED STATES|U S A|DISTRICT|AUTHORITY)\b/.test(n)) return "government";
  if (/\b(ESTATE OF|EST OF|ESTATE)\b/.test(n)) return "estate";
  if (/\b(TRUST|TRS|TR|TRUSTEE|LIVING TR|FAMILY TR)\b/.test(n)) return "trust";
  if (/\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|PARTNERS|PARTNERSHIP|HOLDINGS|GROUP|BANK|ASSN|ASSOCIATION|PROPERTIES|INVESTMENTS|VENTURES|ENTERPRISES)\b/.test(n))
    return "entity";
  return "individual";
}

/**
 * "Guy Smith 15.36%, Inga Lee 8.34%; Jerry Roe 33%" → [{name, pct}, …].
 * Without percentages, splits on ; / newline / " & ".
 */
export function parseOwnershipForm(text: string | null): { name: string; pct: number | null }[] {
  if (!text) return [];
  const withPct = [...text.matchAll(/([^,;\n%]+?)\s*[-:(]?\s*(\d+(?:\.\d+)?)\s*%\)?/g)];
  if (withPct.length) {
    return withPct
      .map((m) => ({ name: m[1].replace(/^[\s,;&]+|[\s,;&(-]+$/g, "").replace(/^and\s+/i, "").trim(), pct: Number(m[2]) }))
      .filter((o) => o.name.length > 1);
  }
  return text
    .split(/;|\n| & | and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .map((name) => ({ name, pct: null }));
}

/** "123 Main St, Palm Springs, CA 92262" → parts (best effort). */
export function splitMailingAddress(s: string | null): {
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
} {
  if (!s) return { mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null };
  const m = s.match(/^(.*?),\s*([^,]+?),?\s+([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/);
  if (m) return { mailing_address: m[1].trim(), mailing_city: m[2].trim(), mailing_state: m[3].toUpperCase(), mailing_zip: m[4] };
  return { mailing_address: s, mailing_city: null, mailing_state: null, mailing_zip: null };
}

const STRATEGY_LABELS: [RegExp, string][] = [
  [/ev/i, "ev_candidate"],
  [/auction/i, "auction_watch"],
  [/large/i, "large_vacant"],
  [/improved/i, "improved"],
  [/low.?value/i, "low_value_lot"],
  [/vacant|motivated/i, "vacant_lot_motivated"],
];
export function parseStrategy(v: unknown): string | null {
  const s = cellText(v);
  if (!s) return null;
  return STRATEGY_LABELS.find(([re]) => re.test(s))?.[1] ?? null;
}

// Only early pipeline stages can be imported; later stages need offers/contracts.
const STATUS_LABELS: [RegExp, string][] = [
  [/^new/i, "new"],
  [/research/i, "researching"],
  [/owner.?found/i, "owner_found"],
  [/attempt|contacted|left.?(msg|message)|mailed/i, "contact_attempted"],
  [/conversation|talking|interested/i, "in_conversation"],
];
export function parseLeadStatus(v: unknown): string | null {
  const s = cellText(v);
  if (!s) return null;
  return STATUS_LABELS.find(([re]) => re.test(s))?.[1] ?? null;
}

export function parseLocationMethod(v: unknown): NormProperty["location_method"] {
  const s = (cellText(v) ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("gis") || s.includes("polygon")) return "gis_polygon";
  if (s.includes("plss") || s.includes("section")) return "plss_estimate";
  if (s.includes("map") || s.includes("book")) return "mapbook_avg";
  if (s.includes("geocod")) return "geocode";
  return null;
}

const streetKey = (s: string | null | undefined) =>
  (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

// ---------------------------------------------------------------------------
// row normalization
// ---------------------------------------------------------------------------
export interface NormalizeOptions {
  defaultCounty: County | null;
  snapshotDate: string | null;
  taxSource: string;
  /** TTC inventory: derive years in default from the power-to-sell date */
  deriveYearsInDefault: boolean;
}

export function normalizeRow(
  raw: Record<string, unknown>,
  mapping: Record<string, TargetField | null>,
  rowNumber: number,
  sheet: string,
  opts: NormalizeOptions,
): NormRow {
  const get = (f: TargetField): unknown => {
    for (const [header, target] of Object.entries(mapping)) if (target === f) return raw[header];
    return undefined;
  };
  const text = (f: TargetField) => cellText(get(f));
  const errors: string[] = [];

  const county = parseCounty(get("county")) ?? opts.defaultCounty;
  let apn = normalizeApn(text("apn"));
  if (!apn && county) apn = apnFromBookPageParcel(county, text("map_book"), text("map_page"), text("map_parcel"));
  // Excel drops leading zeros on SB books stored as numbers (0424 → 424)
  if (apn && county === "san_bernardino" && (apn.length === 8 || apn.length === 12)) apn = `0${apn}`;
  if (!county) errors.push("County missing");
  if (!isValidApn(apn)) errors.push(apn ? `APN "${apn}" is not 9–14 digits` : "APN missing");

  const land_value = parseMoney(get("land_value"));
  const structure_value = parseMoney(get("structure_value"));
  const situs_zip = text("zip");

  const property: NormProperty = {
    situs_address: text("situs_address"),
    situs_city: text("situs_city"),
    zip: situs_zip,
    legal_description: text("legal_description"),
    tax_rate_area: text("tax_rate_area"),
    map_book: text("map_book"),
    thomas_bros_page: text("thomas_bros_page"),
    thomas_bros_grid: text("thomas_bros_grid"),
    acres: parseNumber(get("acres")),
    zoning: text("zoning"),
    land_use: text("land_use"),
    property_description: [text("property_description"), text("other_description")].filter(Boolean).join(" — ") || null,
    land_value,
    structure_value,
    asking_price: parseMoney(get("asking_price")),
    mortgages_note: text("mortgages_note"),
    distance_to_i10_mi: parseNumber(get("distance_to_i10_mi")),
    location_method: parseLocationMethod(get("location_method")),
    is_vacant: structure_value === null ? null : structure_value <= 0,
  };
  if (property.distance_to_i10_mi !== null && !property.location_method) property.location_method = "plss_estimate";

  // owners: explicit ownership form (co-owners + %) or a single owner name
  const mailing = splitMailingAddress(text("mailing_address"));
  const mailingParts = {
    mailing_address: mailing.mailing_address,
    mailing_city: text("mailing_city") ?? mailing.mailing_city,
    mailing_state: text("mailing_state") ?? mailing.mailing_state,
    mailing_zip: text("mailing_zip") ?? mailing.mailing_zip,
  };
  const ownerList = parseOwnershipForm(text("ownership_form"));
  const singleOwner = text("owner_name");
  if (!ownerList.length && singleOwner) ownerList.push({ name: singleOwner, pct: null });
  const owners: NormOwner[] = ownerList.map((o) => ({
    name: o.name,
    owner_type: guessOwnerType(o.name),
    ...mailingParts,
    ownership_pct: o.pct,
  }));
  if (owners.length) {
    property.is_entity_owner = owners.some((o) => o.owner_type === "entity" || o.owner_type === "trust");
    if (mailingParts.mailing_address && property.situs_address) {
      property.is_absentee =
        streetKey(mailingParts.mailing_address) !== streetKey(property.situs_address) ||
        (!!mailingParts.mailing_zip && !!situs_zip && mailingParts.mailing_zip.slice(0, 5) !== situs_zip.slice(0, 5));
    }
  }

  const phone = text("phone");
  const email = text("email");
  const contacts: NormContact[] =
    owners.length && (phone || email) ? [{ owner_index: 0, phone, email: email?.toLowerCase() ?? null }] : [];

  // tax snapshot
  const pts = parseDate(get("power_to_sell_date"));
  const redemption = parseMoney(get("redemption_amount"));
  let years = parseNumber(get("years_in_default"));
  if (years === null && opts.deriveYearsInDefault && pts && opts.snapshotDate && pts <= opts.snapshotDate) {
    // Power to sell arises after 5 years in default (Rev. & Tax. Code §3691).
    const elapsed = (Date.parse(opts.snapshotDate) - Date.parse(pts)) / (365.25 * 86400 * 1000);
    years = Math.round((5 + elapsed) * 100) / 100;
  }
  let ratio = parseNumber(get("owed_to_land_ratio"));
  if (ratio === null && redemption !== null && land_value) ratio = Math.round((redemption / land_value) * 10000) / 10000;
  const hasTax = pts || redemption !== null || years !== null || parseMoney(get("advalorem")) !== null;
  const tax: NormTax | null =
    hasTax && opts.snapshotDate
      ? {
          snapshot_date: opts.snapshotDate,
          source: opts.taxSource,
          power_to_sell_date: pts,
          years_in_default: years,
          advalorem: parseMoney(get("advalorem")),
          specials: parseMoney(get("specials")),
          redemption_amount: redemption,
          owed_to_land_ratio: ratio,
        }
      : null;

  const noteParts = [text("status_notes"), text("notes")].filter(Boolean);

  const saleDate = parseDate(get("sale_date"));
  const salePrice = parseMoney(get("sale_price"));
  const comp: NormComp | null =
    saleDate || salePrice !== null
      ? { sale_date: saleDate, sale_price: salePrice, acres: property.acres ?? null, situs_city: property.situs_city ?? null, zoning: property.zoning ?? null }
      : null;

  return {
    row_number: rowNumber,
    sheet,
    county,
    apn,
    errors,
    property,
    create_only: {
      strategy: parseStrategy(get("strategy")),
      lead_status: parseLeadStatus(get("lead_status")) ?? parseLeadStatus(get("status_notes")),
    },
    tax,
    owners,
    contacts,
    note: noteParts.length ? noteParts.join("\n\n") : null,
    comp,
  };
}
