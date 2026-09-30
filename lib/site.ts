/**
 * Site feasibility helpers shared by the map and the property Site tab. The
 * score itself is computed in the database (private.feasibility_score) so it
 * can be recomputed whenever a reference layer or the weights change.
 */

export const FEASIBILITY_FACTORS = {
  terrain: { label: "Terrain", hint: "Mean slope across the parcel (USGS 3DEP). Flat ≤3° scores best; ≥25° hillside scores 0." },
  utilities: { label: "Utilities", hint: "Inside a water district, and distance to the nearest storm drain (RCFC + city lines)." },
  hazards: { label: "Hazards & constraints", hint: "Fire hazard zone, FEMA flood zone, fault zone, liquefaction, MSHCP habitat cell, airport influence." },
  access: { label: "Freeway access", hint: "Distance to the nearest freeway interchange. ≤1 mi scores best; ≥15 mi scores 0." },
  commercial: { label: "Commercial activity", hint: "Anchor stores (Costco, Walmart, Home Depot…) within 5 mi; restaurants and grocery within 3 mi." },
  momentum: { label: "Development momentum", hint: "County planning cases (tract maps, plot plans, specific plans, CUPs…) within 3 mi in the last 3 years." },
} as const;

export type FeasibilityFactor = keyof typeof FEASIBILITY_FACTORS;

export interface ScoreComponents {
  score?: number | null;
  components?: Partial<Record<FeasibilityFactor, number>>;
  weights?: Partial<Record<FeasibilityFactor, number>>;
  factors_used?: number;
  factors_total?: number;
}

export interface DevCase {
  id: string;
  type: string;
  descr: string;
  status: string | null;
  applied: string | null;
  lon: number | null;
  lat: number | null;
  mi: number | null;
}

export interface NearbyAnchor {
  name: string | null;
  brand: string | null;
  mi: number;
}

/** Score bands, low → high. Colors read on both satellite imagery and light/dark UI. */
export const SCORE_BANDS = [
  { min: 7.5, label: "Strong", color: "#16a34a" },
  { min: 6, label: "Good", color: "#84cc16" },
  { min: 4, label: "Fair", color: "#f59e0b" },
  { min: 0, label: "Weak", color: "#dc2626" },
] as const;
export const UNSCORED_COLOR = "#94a3b8";

export function scoreBand(score: number | null | undefined) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export function scoreColor(score: number | null | undefined): string {
  return scoreBand(score)?.color ?? UNSCORED_COLOR;
}

/** Google Earth (web) 3D view looking at a point — free, no API key. */
export function googleEarthUrl(lat: number, lon: number, altitudeM = 450): string {
  return `https://earth.google.com/web/@${lat.toFixed(6)},${lon.toFixed(6)},${altitudeM}a,1200d,35y,0h,60t,0r`;
}

export function streetViewUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}

/** Plain-language flags for the constraints that pulled the hazards factor down. */
export function hazardFlags(s: {
  fire_hazard?: string | null;
  flood_sfha?: boolean | null;
  flood_zone?: string | null;
  fault_zone?: boolean | null;
  liquefaction?: string | null;
  mshcp_criteria_cell?: string | null;
  airport_influence?: string | null;
}): string[] {
  const out: string[] = [];
  if (s.fire_hazard) out.push(`${titleCase(s.fire_hazard)} fire hazard zone`);
  if (s.flood_sfha) out.push(`FEMA flood zone ${s.flood_zone ?? ""}`.trim());
  if (s.fault_zone) out.push("Alquist-Priolo fault zone");
  if (s.liquefaction && /high|moderate/i.test(s.liquefaction)) out.push(`${titleCase(s.liquefaction)} liquefaction`);
  if (s.mshcp_criteria_cell) out.push(`MSHCP criteria cell ${s.mshcp_criteria_cell}`);
  if (s.airport_influence) out.push(`Airport influence area (${s.airport_influence})`);
  return out;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
