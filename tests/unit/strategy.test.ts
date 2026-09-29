import { describe, expect, it } from "vitest";
import { classifyStrategy, corridorZone, DEFAULT_RULES, matchCondition } from "@/lib/rules/strategy";
import { evScore, zoningFactor } from "@/lib/rules/scores";

const classify = (facts: Record<string, unknown>) => classifyStrategy(facts, DEFAULT_RULES);

describe("strategy rules (§7, applied in order)", () => {
  it("1. ≥5 years in default → auction watch, even if large and vacant", () => {
    expect(classify({ years_in_default: 5, is_vacant: true, acres: 40 })).toBe("auction_watch");
    expect(classify({ years_in_default: 7.3, structure_value: 90000 })).toBe("auction_watch");
  });
  it("2. vacant and ≥5 acres → large vacant acreage", () => {
    expect(classify({ years_in_default: 4.9, is_vacant: true, acres: 5 })).toBe("large_vacant");
    expect(classify({ is_vacant: false, acres: 50, structure_value: 1 })).toBe("improved");
  });
  it("3. structure value > 0 → improved", () => {
    expect(classify({ structure_value: 1000, land_value: 1000 })).toBe("improved");
  });
  it("4. land value < 5,000 → low-value lot", () => {
    expect(classify({ structure_value: 0, land_value: 4999 })).toBe("low_value_lot");
    expect(classify({ structure_value: 0, land_value: 5000 })).toBe("vacant_lot_motivated");
  });
  it("5. otherwise → vacant lot, motivated owner; missing numbers never match comparisons", () => {
    expect(classify({})).toBe("vacant_lot_motivated");
    expect(matchCondition({}, { field: "acres", op: ">=", value: 5 })).toBe(false);
  });
  it("respects custom order and disabled rules", () => {
    const rules = [
      { sort_order: 1, strategy_key: "x", conditions: [], enabled: false },
      { sort_order: 2, strategy_key: "y", conditions: [{ field: "acres", op: ">" as const, value: 1 }] },
      { sort_order: 3, strategy_key: "z", conditions: [] },
    ];
    expect(classifyStrategy({ acres: 2 }, rules)).toBe("y");
    expect(classifyStrategy({ acres: 1 }, rules)).toBe("z");
  });
});

describe("corridor zone", () => {
  it("≤2 corridor, 2–5 near, else other", () => {
    expect(corridorZone(0)).toBe("i10_corridor");
    expect(corridorZone(2)).toBe("i10_corridor");
    expect(corridorZone(2.01)).toBe("i10_near");
    expect(corridorZone(5)).toBe("i10_near");
    expect(corridorZone(5.1)).toBe("other");
    expect(corridorZone(null)).toBe("other");
  });
});

describe("EV score", () => {
  it("ranks an industrial I-10 frontage site high and a remote residential lot low", () => {
    const hobson = evScore({ distance_to_i10_mi: 0.1, zoning: "M1", acres: 1.47, truck_aadt: 12300, utilities_on_site: true, big_rig_access_score: 7 });
    const remote = evScore({ distance_to_i10_mi: 8, zoning: "R-1", acres: 0.2 });
    expect(hobson).toBeGreaterThan(8);
    expect(remote).toBeLessThan(1);
  });
  it("applies the dirt-road penalty and clamps to 0–10", () => {
    const base = { distance_to_i10_mi: 1, zoning: "C-P", acres: 3 };
    expect(evScore({ ...base, dirt_road_only: true })).toBeCloseTo(Math.max(0, evScore(base) - 2), 1);
    expect(evScore({})).toBe(0);
  });
  it("scores zoning families", () => {
    expect(zoningFactor("M1")).toBe(1);
    expect(zoningFactor("W-2-M")).toBe(1);
    expect(zoningFactor("Commercial (verify)")).toBe(0.85);
    expect(zoningFactor("Agricultural")).toBe(0.35);
    expect(zoningFactor(null)).toBe(0);
  });
});
