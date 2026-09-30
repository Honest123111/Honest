import { describe, expect, it } from "vitest";
import { googleMapsScriptUrl, outerRing } from "@/lib/google-maps";

describe("googleMapsScriptUrl", () => {
  it("builds an async bootstrap URL with the callback", () => {
    const u = new URL(googleMapsScriptUrl("KEY123", "beta", "__cb"));
    expect(u.origin + u.pathname).toBe("https://maps.googleapis.com/maps/api/js");
    expect(u.searchParams.get("key")).toBe("KEY123");
    expect(u.searchParams.get("v")).toBe("beta");
    expect(u.searchParams.get("loading")).toBe("async");
    expect(u.searchParams.get("callback")).toBe("__cb");
  });
});

describe("outerRing", () => {
  const ring = [[-116.96, 33.9], [-116.95, 33.9], [-116.95, 33.91], [-116.96, 33.9]];
  it("reads Polygon and MultiPolygon outer rings as lat/lng", () => {
    expect(outerRing({ type: "Polygon", coordinates: [ring] })?.[1]).toEqual({ lat: 33.9, lng: -116.95 });
    expect(outerRing({ type: "MultiPolygon", coordinates: [[ring]] })).toHaveLength(4);
  });
  it("returns null for points, empties and junk", () => {
    expect(outerRing({ type: "Point", coordinates: [-116.9, 33.9] })).toBeNull();
    expect(outerRing(null)).toBeNull();
    expect(outerRing({ type: "Polygon", coordinates: [[[0, 0]]] })).toBeNull();
  });
});
