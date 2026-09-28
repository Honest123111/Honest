/**
 * EV Charging Score (0–10), §7. Each component is scored 0–1, multiplied by
 * its weight, and the weighted sum is scaled so the maximum possible is 10.
 * The dirt-road penalty is subtracted after scaling. Missing inputs score 0
 * for that component, so an unresearched parcel scores low rather than high.
 */

export interface EvWeights {
  interchange_distance: number;
  truck_aadt: number;
  zoning: number;
  utilities: number;
  acreage: number;
  access_quality: number;
  dirt_road_penalty: number; // negative number, applied as-is
  acreage_min_pull_through: number;
}

export const DEFAULT_EV_WEIGHTS: EvWeights = {
  interchange_distance: 3,
  truck_aadt: 2,
  zoning: 1.5,
  utilities: 1.5,
  acreage: 1,
  access_quality: 1,
  dirt_road_penalty: -2,
  acreage_min_pull_through: 1.5,
};

export interface EvInputs {
  distance_to_interchange_mi?: number | null;
  distance_to_i10_mi?: number | null;
  truck_aadt?: number | null;
  zoning?: string | null;
  utilities_on_site?: boolean | null;
  acres?: number | null;
  big_rig_access_score?: number | null; // 0–10, used for access quality
  dirt_road_only?: boolean | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Commercial / industrial zoning scores high; agricultural/residential low. */
export function zoningFactor(zoning: string | null | undefined): number {
  const z = (zoning ?? "").toUpperCase();
  if (!z.trim()) return 0;
  if (/\b(M-?\d|MH|ML|IND|INDUSTRIAL|I-?[1-3]|W-?2-?M)\b/.test(z) || z.includes("INDUSTRIAL")) return 1;
  if (/\b(C-?\d|CP|CR|CH|COMMERCIAL|SP)\b/.test(z) || z.includes("COMMERCIAL")) return 0.85;
  if (/\b(A-?\d|AG|AGRICULTURAL|W-?2)\b/.test(z) || z.includes("AGRICULT")) return 0.35;
  if (/\b(R-?[A-Z0-9]*|RR|RESIDENTIAL)\b/.test(z)) return 0.15;
  return 0.3;
}

export function evScore(input: EvInputs, w: EvWeights = DEFAULT_EV_WEIGHTS): number {
  const dist = input.distance_to_interchange_mi ?? input.distance_to_i10_mi;
  const components = {
    // 1.0 at ≤0.25 mi, falling to 0 at 5 mi
    interchange_distance: dist === null || dist === undefined ? 0 : clamp01(1 - (Math.max(dist, 0.25) - 0.25) / 4.75),
    // 1.0 at ≥ 12,000 trucks/day
    truck_aadt: input.truck_aadt ? clamp01(input.truck_aadt / 12000) : 0,
    zoning: zoningFactor(input.zoning),
    utilities: input.utilities_on_site ? 1 : 0,
    // full credit at ≥ 2× the pull-through minimum
    acreage: input.acres ? clamp01(input.acres / (w.acreage_min_pull_through * 2)) : 0,
    access_quality: input.big_rig_access_score ? clamp01(input.big_rig_access_score / 10) : 0,
  };
  const maxWeight =
    w.interchange_distance + w.truck_aadt + w.zoning + w.utilities + w.acreage + w.access_quality;
  if (maxWeight <= 0) return 0;
  const weighted =
    components.interchange_distance * w.interchange_distance +
    components.truck_aadt * w.truck_aadt +
    components.zoning * w.zoning +
    components.utilities * w.utilities +
    components.acreage * w.acreage +
    components.access_quality * w.access_quality;
  let score = (weighted / maxWeight) * 10;
  if (input.dirt_road_only) score += w.dirt_road_penalty;
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}
