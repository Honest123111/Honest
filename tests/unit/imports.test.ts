import { describe, expect, it } from "vitest";
import { detectFormat, detectHeaderRow, suggestMapping } from "@/lib/imports/fields";
import { normalizeRow, parseMoney, parseOwnershipForm, guessOwnerType, parseDate, parseStrategy, type NormalizeOptions } from "@/lib/imports/normalize";
import { planImport, summarize, type ExistingProperty } from "@/lib/imports/plan";

const ttcHeaders = [
  "PIN", "Geocode", "Power to Sell Start Date", "Tag", "Tag Descr", "City", "Advalorem", "Specials",
  "Redemption Amount", "Land Value", "Structure Value", "Situs Address", "Situs City", "Situs State",
  "Situs Postal Cd", "Property Description", "Other Description",
];
const leadsHeaders = [
  "Strategy", "APN", "Est. mi to I-10", "Loc method", "Tax area", "Situs Address", "Situs City", "Acres",
  "Land Value", "Structure Value", "Taxes owed (Oct 2025)", "Owed/Land", "Power-to-sell date", "Yrs in default",
  "Property Description", "Map", "Lead status", "Owner name", "Mailing address", "Phone", "Email", "Notes",
];
const offMarketHeaders = [
  "status/notes", "MAP BOOK", "Page", "Parcel", "County", "Address", "Description", "Thomas Bros Page", "Grid",
  "Legal Description", "Mortgages", "SALE PRICE", "ownership form",
];

const ttcOpts: NormalizeOptions = { defaultCounty: "riverside", snapshotDate: "2025-07-01", taxSource: "ttc", deriveYearsInDefault: true };

describe("format detection + mapping", () => {
  it("recognizes the three seed formats", () => {
    expect(detectFormat(ttcHeaders)).toBe("tax_default_inventory");
    expect(detectFormat(leadsHeaders)).toBe("i10_leads_workbook");
    expect(detectFormat(offMarketHeaders)).toBe("off_market_list");
    expect(detectFormat(["foo", "bar"])).toBe("generic");
  });
  it("finds a header on row 4", () => {
    const rows = [["2025 PTS INVENTORY"], ["As of 7/1/2025"], [], ttcHeaders, ["836121003"]];
    expect(detectHeaderRow(rows)).toBe(3);
  });
  it("maps TTC and leads columns", () => {
    const m = suggestMapping(ttcHeaders, "tax_default_inventory");
    expect(m["PIN"]).toBe("apn");
    expect(m["Redemption Amount"]).toBe("redemption_amount");
    expect(m["Situs Postal Cd"]).toBe("zip");
    expect(m["Geocode"]).toBeNull();
    const l = suggestMapping(leadsHeaders, "i10_leads_workbook");
    expect(l["Taxes owed (Oct 2025)"]).toBe("redemption_amount");
    expect(l["Est. mi to I-10"]).toBe("distance_to_i10_mi");
    expect(l["Owed/Land"]).toBe("owed_to_land_ratio");
    const o = suggestMapping(offMarketHeaders, "off_market_list");
    expect(o["MAP BOOK"]).toBe("map_book");
    expect(o["SALE PRICE"]).toBe("asking_price");
    expect(o["ownership form"]).toBe("ownership_form");
  });
});

describe("value parsing", () => {
  it("money, dates, owners", () => {
    expect(parseMoney("$630,000")).toBe(630000);
    expect(parseMoney("630K")).toBe(630000);
    expect(parseDate("7/1/2025")).toBe("2025-07-01");
    expect(parseDate(45839)).toBe("2025-07-01");
    expect(guessOwnerType("HOBSON TIRE LLC")).toBe("entity");
    expect(guessOwnerType("SMITH FAMILY TRUST")).toBe("trust");
    expect(guessOwnerType("John Smith")).toBe("individual");
  });
  it("parses co-owner percentages", () => {
    const o = parseOwnershipForm("Guy A 15.36%, Inga B 8.34%, YI C 6.46%, Jerry D 33%, Adad E 33%");
    expect(o).toHaveLength(5);
    expect(o[0]).toEqual({ name: "Guy A", pct: 15.36 });
    expect(o.reduce((s, x) => s + (x.pct ?? 0), 0)).toBeCloseTo(96.16, 2);
    expect(parseOwnershipForm("Ann Lee; Bob Lee")).toEqual([{ name: "Ann Lee", pct: null }, { name: "Bob Lee", pct: null }]);
  });
});

describe("strategy labels from sheets", () => {
  it("maps the leads sheet's labels without false EV matches", () => {
    expect(parseStrategy("Auction watch (5+ yrs default)")).toBe("auction_watch");
    expect(parseStrategy("Large vacant acreage (5+ ac)")).toBe("large_vacant");
    expect(parseStrategy("Improved property w/ tax distress")).toBe("improved");
    expect(parseStrategy("Vacant lot, motivated owner")).toBe("vacant_lot_motivated");
    expect(parseStrategy("Low-value lot (<$5K)")).toBe("low_value_lot");
    expect(parseStrategy("EV Candidate")).toBe("ev_candidate");
    expect(parseStrategy("Development parcel")).toBeNull();
  });
});

describe("row normalization", () => {
  it("TTC row: apn, tax snapshot with derived years in default, vacancy", () => {
    const mapping = suggestMapping(ttcHeaders, "tax_default_inventory");
    const row = normalizeRow(
      { PIN: "836-121-003", "Power to Sell Start Date": "7/1/2020", "Redemption Amount": "12,000", "Land Value": 40000, "Structure Value": 0, "Situs City": "BLYTHE" },
      mapping, 5, "Sheet1", ttcOpts,
    );
    expect(row.errors).toEqual([]);
    expect(row.apn).toBe("836121003");
    expect(row.property.is_vacant).toBe(true);
    expect(row.tax?.years_in_default).toBeCloseTo(5, 1); // years since power-to-sell (2020 → 2025)
    expect(row.tax?.owed_to_land_ratio).toBeCloseTo(0.3, 4);
  });
  it("TTC row: acres from the description, APN-only 'other description' dropped", () => {
    const mapping = suggestMapping(ttcHeaders, "tax_default_inventory");
    const row = normalizeRow(
      { PIN: "535080011", "Property Description": "4.93 ACRES M/L IN POR NE 1/4 OF SEC 4 T3S R1E", "Other Description": "535080011" },
      mapping, 5, "Sheet1", ttcOpts,
    );
    expect(row.property.acres).toBe(4.93);
    expect(row.property.property_description).toBe("4.93 ACRES M/L IN POR NE 1/4 OF SEC 4 T3S R1E");
    const lot = normalizeRow({ PIN: "535213032", "Property Description": "LOT 10 MB 042/075 MONTCLAIR PARK" }, mapping, 6, "Sheet1", ttcOpts);
    expect(lot.property.acres).toBeNull();
    const half = normalizeRow({ PIN: "535213033", "Property Description": "N 1/2 ACRE OF LOT 4" }, mapping, 7, "Sheet1", ttcOpts);
    expect(half.property.acres).toBeNull();
    const tiny = normalizeRow({ PIN: "540020058", "Property Description": ".01 ACRES M/L IN POR BLK 280" }, mapping, 8, "Sheet1", ttcOpts);
    expect(tiny.property.acres).toBe(0.01);
  });
  it("off-market row: APN from book/page/parcel, co-owners, SB leading zero", () => {
    const mapping = suggestMapping(offMarketHeaders, "off_market_list");
    const row = normalizeRow(
      { "MAP BOOK": 424, Page: 31, Parcel: 40, County: "San Bernardino", "SALE PRICE": "$250,000", "ownership form": "A Corp LLC 50%, Jo Doe 50%" },
      mapping, 2, "Sheet1", { defaultCounty: null, snapshotDate: null, taxSource: "x", deriveYearsInDefault: false },
    );
    expect(row.county).toBe("san_bernardino");
    expect(row.apn).toBe("042403140");
    expect(row.owners.map((o) => o.owner_type)).toEqual(["entity", "individual"]);
    expect(row.property.is_entity_owner).toBe(true);
    expect(row.property.asking_price).toBe(250000);
  });
  it("flags bad APNs", () => {
    const row = normalizeRow({ PIN: "12-34" }, { PIN: "apn" }, 3, "S", ttcOpts);
    expect(row.errors[0]).toMatch(/not 9–14 digits/);
  });
});

describe("import dedupe + conflict planning", () => {
  const mapping = suggestMapping(leadsHeaders, "i10_leads_workbook");
  const opts: NormalizeOptions = { defaultCounty: "riverside", snapshotDate: "2025-10-01", taxSource: "leads", deriveYearsInDefault: false };
  const r = (n: number, data: Record<string, unknown>, sheet = "I-10 Corridor") => normalizeRow(data, mapping, n, sheet, opts);

  it("never creates duplicate APNs: same APN in two tabs/rows merges into one create", () => {
    const plan = planImport(
      [
        r(2, { APN: "836-121-003", Acres: 1.47, "Owner name": "HOBSON TIRE LLC" }),
        r(9, { APN: "836121003", "Land Value": 90000, "Owner name": "JANE ROE" }, "Auction watch"),
      ],
      new Map(),
    );
    expect(summarize(plan)).toMatchObject({ create: 1, skip: 1 });
    const created = plan.find((p) => p.action === "create")!;
    expect(created.changes).toMatchObject({ acres: 1.47, land_value: 90000 });
    expect(created.owners.map((o) => o.name)).toEqual(["HOBSON TIRE LLC", "JANE ROE"]);
    expect(created.merged_rows).toEqual([9]);
  });

  it("matches existing by county+APN; fills blanks, refreshes import data, flags user edits as conflicts", () => {
    const existing: ExistingProperty = {
      id: "p1", county: "riverside", apn: "836121003", source_list: "tax_default",
      acres: 1.4, zoning: "M1", land_value: 80000, situs_city: null,
      field_sources: { acres: { src: "user" }, land_value: { src: "import" } },
    };
    const plan = planImport(
      [r(2, { APN: "836-121-003", Acres: 1.47, "Land Value": 90000, "Situs City": "Blythe" })],
      new Map([["riverside:836121003", existing]]),
    );
    const p = plan[0];
    expect(p.action).toBe("conflict");
    expect(p.property_id).toBe("p1");
    expect(p.changes).toEqual({ land_value: 90000, situs_city: "Blythe" });
    expect(p.conflicts.acres).toMatchObject({ current: 1.4, incoming: 1.47, current_src: "user" });
  });

  it("reports unchanged when nothing new arrives", () => {
    const existing: ExistingProperty = { id: "p1", county: "riverside", apn: "836121003", acres: 1.47, field_sources: {} };
    const plan = planImport([r(2, { APN: "836121003", Acres: "1.470" })], new Map([["riverside:836121003", existing]]));
    expect(plan[0].action).toBe("unchanged");
  });

  it("keeps a GIS-measured distance over a PLSS estimate", () => {
    const existing: ExistingProperty = {
      id: "p1", county: "riverside", apn: "836121003", distance_to_i10_mi: 0.4, location_method: "gis_polygon", field_sources: {},
    };
    const plan = planImport(
      [r(2, { APN: "836121003", "Est. mi to I-10": 1.2, "Loc method": "PLSS" })],
      new Map([["riverside:836121003", existing]]),
    );
    expect(plan[0].changes).not.toHaveProperty("distance_to_i10_mi");
    expect(plan[0].action).toBe("unchanged");
  });

  it("classifies strategy on create when the file has none; takes the file's when present", () => {
    const plan = planImport(
      [
        r(2, { APN: "111111111", "Yrs in default": 6, "Structure Value": 0 }),
        r(3, { APN: "222222222", Strategy: "Large acreage", "Structure Value": 0, Acres: 1 }),
      ],
      new Map(),
    );
    expect(plan[0].changes.strategy).toBe("auction_watch");
    expect(plan[1].changes.strategy).toBe("large_vacant");
  });

  it("marks rows with invalid APNs as errors and leaves them out of matching", () => {
    const plan = planImport([r(2, { APN: "abc" })], new Map());
    expect(plan[0].action).toBe("error");
    expect(summarize(plan).error).toBe(1);
  });
});
