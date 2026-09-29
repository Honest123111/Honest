/**
 * Import target fields and the known source formats (§9 Imports). Column
 * headers are matched case/punctuation-insensitively against the aliases.
 */

export type TargetField =
  // property identity / location
  | "apn" | "county" | "map_book" | "map_page" | "map_parcel"
  | "situs_address" | "situs_city" | "zip" | "legal_description" | "tax_rate_area"
  | "thomas_bros_page" | "thomas_bros_grid"
  // size / use / values
  | "acres" | "zoning" | "land_use" | "property_description" | "other_description"
  | "land_value" | "structure_value" | "asking_price" | "mortgages_note"
  // location estimates / classification
  | "distance_to_i10_mi" | "location_method" | "strategy" | "lead_status" | "status_notes"
  // tax snapshot
  | "power_to_sell_date" | "years_in_default" | "advalorem" | "specials" | "redemption_amount" | "owed_to_land_ratio"
  // owners / contacts
  | "owner_name" | "mailing_address" | "mailing_city" | "mailing_state" | "mailing_zip" | "ownership_form"
  | "phone" | "email"
  // free text / comps
  | "notes" | "sale_date" | "sale_price";

export const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  apn: "APN",
  county: "County",
  map_book: "Map book",
  map_page: "Map page",
  map_parcel: "Parcel #",
  situs_address: "Situs address",
  situs_city: "Situs city",
  zip: "ZIP",
  legal_description: "Legal description",
  tax_rate_area: "Tax rate area",
  thomas_bros_page: "Thomas Bros page",
  thomas_bros_grid: "Thomas Bros grid",
  acres: "Acres",
  zoning: "Zoning (listed)",
  land_use: "Land use",
  property_description: "Property description",
  other_description: "Other description",
  land_value: "Land value",
  structure_value: "Structure value",
  asking_price: "Asking / sale price",
  mortgages_note: "Mortgages",
  distance_to_i10_mi: "Est. miles to I-10",
  location_method: "Location method",
  strategy: "Strategy",
  lead_status: "Lead status",
  status_notes: "Status / notes (off-market)",
  power_to_sell_date: "Power-to-sell date",
  years_in_default: "Years in default",
  advalorem: "Ad valorem",
  specials: "Specials",
  redemption_amount: "Redemption / taxes owed",
  owed_to_land_ratio: "Owed / land ratio",
  owner_name: "Owner name",
  mailing_address: "Mailing address",
  mailing_city: "Mailing city",
  mailing_state: "Mailing state",
  mailing_zip: "Mailing ZIP",
  ownership_form: "Ownership (co-owners + %)",
  phone: "Phone",
  email: "Email",
  notes: "Notes",
  sale_date: "Sale date",
  sale_price: "Sale price",
};

export const TARGET_FIELDS = Object.keys(TARGET_FIELD_LABELS) as TargetField[];

export type SourceType =
  | "tax_default_inventory"
  | "i10_leads_workbook"
  | "off_market_list"
  | "sold_comps"
  | "delinquent_list"
  | "assessment_roll"
  | "generic";

export interface FormatSpec {
  label: string;
  /** header aliases → target field */
  aliases: Partial<Record<TargetField, string[]>>;
  /** headers that identify this format (normalized); ≥2 hits = match */
  signature: string[];
  defaultCounty?: "riverside";
  sourceList: "tax_default" | "off_market_list" | "delinquent_list" | "assessment_roll" | "manual" | "google_sheet";
  /** snapshot date for tax rows when the file doesn't carry one */
  snapshotDate?: string;
  skipSheets?: RegExp;
}

export const normalizeHeader = (h: unknown) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COMMON: Partial<Record<TargetField, string[]>> = {
  apn: ["apn", "pin", "parcel number", "assessor parcel number", "apn number"],
  county: ["county"],
  situs_address: ["situs address", "address", "property address", "site address"],
  situs_city: ["situs city", "city"],
  zip: ["situs postal cd", "zip", "zip code", "situs zip"],
  legal_description: ["legal description", "legal"],
  acres: ["acres", "acreage", "lot acres"],
  zoning: ["zoning", "zone"],
  land_value: ["land value", "land"],
  structure_value: ["structure value", "improvements", "improvement value", "structure"],
  property_description: ["property description", "description"],
  owner_name: ["owner name", "owner", "mailname", "mail name", "legalparty1", "legal party 1"],
  mailing_address: ["mailing address", "mailaddress", "mail address"],
  mailing_city: ["mailing city", "mail city"],
  mailing_state: ["mailing state", "mail state"],
  mailing_zip: ["mailing zip", "mail zip"],
  phone: ["phone", "phone number"],
  email: ["email", "email address"],
  notes: ["notes"],
  lead_status: ["lead status"],
};

export const FORMATS: Record<SourceType, FormatSpec> = {
  tax_default_inventory: {
    label: "Riverside TTC tax-default inventory (PTS)",
    signature: ["pin", "power to sell start date", "redemption amount", "advalorem", "tag descr"],
    aliases: {
      ...COMMON,
      apn: ["pin"],
      situs_city: ["situs city"],
      tax_rate_area: ["tag"],
      power_to_sell_date: ["power to sell start date", "power to sell date"],
      advalorem: ["advalorem", "ad valorem"],
      specials: ["specials"],
      redemption_amount: ["redemption amount"],
      other_description: ["other description"],
    },
    defaultCounty: "riverside",
    sourceList: "tax_default",
    snapshotDate: "2025-07-01",
  },
  i10_leads_workbook: {
    label: "I-10 tax-default leads workbook",
    signature: ["strategy", "est mi to i 10", "loc method", "yrs in default", "owed land"],
    aliases: {
      ...COMMON,
      strategy: ["strategy"],
      distance_to_i10_mi: ["est mi to i 10", "est miles to i 10", "mi to i 10"],
      location_method: ["loc method", "location method"],
      tax_rate_area: ["tax area", "tax rate area"],
      redemption_amount: ["taxes owed", "taxes owed oct 2025"],
      owed_to_land_ratio: ["owed land", "owed to land"],
      power_to_sell_date: ["power to sell date", "power to sell start date"],
      years_in_default: ["yrs in default", "years in default"],
    },
    defaultCounty: "riverside",
    sourceList: "tax_default",
    snapshotDate: "2025-10-01",
    skipSheets: /^summary$/i,
  },
  off_market_list: {
    label: "Off-market portfolio list (book / page / parcel)",
    signature: ["map book", "page", "parcel", "thomas bros page", "ownership form", "sale price"],
    aliases: {
      ...COMMON,
      status_notes: ["status notes", "status", "status notes"],
      map_book: ["map book", "book"],
      map_page: ["page"],
      map_parcel: ["parcel"],
      situs_address: ["address"],
      property_description: ["description"],
      thomas_bros_page: ["thomas bros page", "thomas bros"],
      thomas_bros_grid: ["grid"],
      mortgages_note: ["mortgages", "mortgage"],
      asking_price: ["sale price", "asking price", "price"],
      ownership_form: ["ownership form", "ownership", "owners"],
    },
    sourceList: "off_market_list",
  },
  sold_comps: {
    label: "Sold history / comps",
    signature: ["sold", "sale date", "sold price", "sold date"],
    aliases: {
      ...COMMON,
      map_book: ["map book", "book"],
      map_page: ["page"],
      map_parcel: ["parcel"],
      sale_date: ["sale date", "sold date", "date sold", "closing date"],
      sale_price: ["sale price", "sold price", "price"],
    },
    sourceList: "off_market_list",
  },
  delinquent_list: {
    label: "Assessor — Secured Prior Year Unpaid (delinquent list)",
    signature: ["mailname", "mailaddress", "legalparty1"],
    aliases: { ...COMMON },
    defaultCounty: "riverside",
    sourceList: "delinquent_list",
  },
  assessment_roll: {
    label: "Assessor — Current Assessment Roll",
    signature: ["legalparty1", "legalparty2", "mailname"],
    aliases: { ...COMMON },
    defaultCounty: "riverside",
    sourceList: "assessment_roll",
  },
  generic: {
    label: "Other (map columns manually)",
    signature: [],
    aliases: { ...COMMON },
    sourceList: "manual",
  },
};

/** Pick the format whose signature best matches the headers. */
export function detectFormat(headers: string[]): SourceType {
  const set = new Set(headers.map(normalizeHeader));
  let best: SourceType = "generic";
  let bestHits = 1;
  for (const [key, spec] of Object.entries(FORMATS) as [SourceType, FormatSpec][]) {
    const hits = spec.signature.filter((s) => set.has(s)).length;
    if (hits > bestHits) {
      best = key;
      bestHits = hits;
    }
  }
  return best;
}

/** header → target field, using the format's aliases (first alias hit wins, each field used once). */
export function suggestMapping(headers: string[], source: SourceType): Record<string, TargetField | null> {
  const aliases = FORMATS[source].aliases;
  const used = new Set<TargetField>();
  const out: Record<string, TargetField | null> = {};
  for (const h of headers) {
    const n = normalizeHeader(h);
    let hit: TargetField | null = null;
    for (const [field, list] of Object.entries(aliases) as [TargetField, string[]][]) {
      if (!used.has(field) && list.includes(n)) {
        hit = field;
        break;
      }
    }
    // fuzzy: header starts with an alias (e.g. "Taxes owed (Oct 2025)" → "taxes owed")
    if (!hit) {
      for (const [field, list] of Object.entries(aliases) as [TargetField, string[]][]) {
        if (!used.has(field) && list.some((a) => a.length > 3 && n.startsWith(a))) {
          hit = field;
          break;
        }
      }
    }
    if (hit) used.add(hit);
    out[h] = hit;
  }
  return out;
}

/** Find the header row: the first row (of the first 15) with ≥3 cells matching any known alias. */
export function detectHeaderRow(rows: unknown[][]): number {
  const known = new Set<string>();
  for (const spec of Object.values(FORMATS)) {
    for (const list of Object.values(spec.aliases)) list?.forEach((a) => known.add(a));
    spec.signature.forEach((s) => known.add(s));
  }
  let bestIdx = 0;
  let bestHits = 0;
  rows.slice(0, 15).forEach((row, i) => {
    const hits = row.filter((c) => known.has(normalizeHeader(c))).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = i;
    }
  });
  return bestIdx; // 0-based
}
