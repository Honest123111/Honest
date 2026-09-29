import { describe, expect, it } from "vitest";
import { apnFromBookPageParcel, formatApn, normalizeApn, parseCounty } from "@/lib/apn";

describe("APN", () => {
  it("normalizes any punctuation to digits", () => {
    expect(normalizeApn("836-121-003")).toBe("836121003");
    expect(normalizeApn(" 836 121 003 ")).toBe("836121003");
    expect(normalizeApn(836121003)).toBe("836121003");
    expect(normalizeApn("—")).toBeNull();
  });

  it("formats per county", () => {
    expect(formatApn("riverside", "836121003")).toBe("836-121-003");
    expect(formatApn("san_bernardino", "042403140")).toBe("0424-031-40");
    expect(formatApn("san_bernardino", "0424031400000")).toBe("0424-031-40-0000");
    expect(formatApn("los_angeles", "3045012034")).toBe("3045-012-034");
    expect(formatApn("other", "123456789")).toBe("123456789");
  });

  it("builds APNs from map book / page / parcel with padding", () => {
    expect(apnFromBookPageParcel("riverside", "836", "121", "3")).toBe("836121003");
    expect(apnFromBookPageParcel("san_bernardino", "424", "31", "40")).toBe("042403140");
    expect(apnFromBookPageParcel("los_angeles", 3045, 12, 34)).toBe("3045012034");
    expect(apnFromBookPageParcel("riverside", "8361", "121", "3")).toBeNull();
    expect(apnFromBookPageParcel("riverside", null, "121", "3")).toBeNull();
  });

  it("parses county names", () => {
    expect(parseCounty("Riverside")).toBe("riverside");
    expect(parseCounty("San Bernardino County")).toBe("san_bernardino");
    expect(parseCounty("SB")).toBe("san_bernardino");
    expect(parseCounty("L.A.")).toBe("los_angeles");
    expect(parseCounty("")).toBeNull();
  });
});

import { safePath } from "@/lib/utils";
describe("safePath", () => {
  it("keeps same-site paths and rejects external ones", () => {
    expect(safePath("/properties?x=1")).toBe("/properties?x=1");
    expect(safePath("//evil.com")).toBe("/");
    expect(safePath("/\\evil.com")).toBe("/");
    expect(safePath("https://evil.com")).toBe("/");
    expect(safePath(null)).toBe("/");
  });
});
