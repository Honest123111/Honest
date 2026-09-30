import { describe, expect, it } from "vitest";
import { UNSCORED_COLOR, googleEarthUrl, hazardFlags, scoreBand, scoreColor } from "@/lib/site";

describe("scoreBand", () => {
  it("buckets scores at the band edges", () => {
    expect(scoreBand(9.6)?.label).toBe("Strong");
    expect(scoreBand(7.5)?.label).toBe("Strong");
    expect(scoreBand(7.4)?.label).toBe("Good");
    expect(scoreBand(6)?.label).toBe("Good");
    expect(scoreBand(4)?.label).toBe("Fair");
    expect(scoreBand(3.9)?.label).toBe("Weak");
    expect(scoreBand(0)?.label).toBe("Weak");
  });

  it("treats missing scores as unscored", () => {
    expect(scoreBand(null)).toBeNull();
    expect(scoreBand(undefined)).toBeNull();
    expect(scoreColor(null)).toBe(UNSCORED_COLOR);
  });
});

describe("hazardFlags", () => {
  it("lists only the constraints that apply", () => {
    expect(hazardFlags({})).toEqual([]);
    expect(hazardFlags({
      fire_hazard: "VERY HIGH", flood_sfha: true, flood_zone: "AE", fault_zone: true,
      liquefaction: "HIGH", mshcp_criteria_cell: "1499", airport_influence: "BANNING",
    })).toEqual([
      "Very High fire hazard zone",
      "FEMA flood zone AE",
      "Alquist-Priolo fault zone",
      "High liquefaction",
      "MSHCP criteria cell 1499",
      "Airport influence area (BANNING)",
    ]);
  });

  it("ignores low liquefaction and shaded-X flood zones", () => {
    expect(hazardFlags({ liquefaction: "LOW", flood_sfha: false, flood_zone: "X" })).toEqual([]);
  });
});

describe("googleEarthUrl", () => {
  it("points Google Earth at the parcel", () => {
    expect(googleEarthUrl(33.899752, -116.959524)).toBe("https://earth.google.com/web/@33.899752,-116.959524,450a,1200d,35y,0h,60t,0r");
  });
});
