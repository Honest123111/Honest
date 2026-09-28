import type { Database } from "@/lib/database.types";

export type County = Database["public"]["Enums"]["county_name"];

/** Digits only; null when nothing usable remains. Mirrors public.normalize_apn(). */
export function normalizeApn(input: string | number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "");
  return digits.length ? digits : null;
}

/**
 * Display format per county. Mirrors public.format_apn().
 *   Riverside       ###-###-###
 *   San Bernardino  ####-###-##(-####)
 *   Los Angeles     ####-###-###
 */
export function formatApn(county: County | null | undefined, apn: string | null | undefined): string {
  if (!apn) return "";
  if (county === "riverside" && apn.length === 9) {
    return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6)}`;
  }
  if (county === "san_bernardino" && (apn.length === 9 || apn.length === 13)) {
    const base = `${apn.slice(0, 4)}-${apn.slice(4, 7)}-${apn.slice(7, 9)}`;
    return apn.length === 13 ? `${base}-${apn.slice(9)}` : base;
  }
  if (county === "los_angeles" && apn.length === 10) {
    return `${apn.slice(0, 4)}-${apn.slice(4, 7)}-${apn.slice(7)}`;
  }
  return apn;
}

export function isValidApn(apn: string | null): apn is string {
  return !!apn && /^\d{9,14}$/.test(apn);
}

/**
 * Off-market list: APN = map book + page + parcel. Riverside books are 3 digits,
 * pages 3, parcels 3; San Bernardino 4-3-2; Los Angeles 4-3-3. Pads each part.
 */
export function apnFromBookPageParcel(
  county: County,
  book: string | number | null | undefined,
  page: string | number | null | undefined,
  parcel: string | number | null | undefined,
): string | null {
  const b = normalizeApn(book as string);
  const p = normalizeApn(page as string);
  const r = normalizeApn(parcel as string);
  if (!b || !p || !r) return null;
  const widths: Record<string, [number, number, number]> = {
    riverside: [3, 3, 3],
    san_bernardino: [4, 3, 2],
    los_angeles: [4, 3, 3],
  };
  const [wb, wp, wr] = widths[county] ?? [3, 3, 3];
  if (b.length > wb || p.length > wp || r.length > wr) return null;
  return b.padStart(wb, "0") + p.padStart(wp, "0") + r.padStart(wr, "0");
}

/** Best-effort county from a free-text value ("Riverside", "SB", "L.A. County", …). */
export function parseCounty(value: unknown): County | null {
  const v = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!v) return null;
  if (v.startsWith("riv")) return "riverside";
  if (v.startsWith("sanbern") || v === "sb" || v === "sbd" || v.startsWith("sbcounty")) return "san_bernardino";
  if (v.startsWith("losang") || v === "la" || v === "lacounty") return "los_angeles";
  if (v.startsWith("imp")) return "imperial";
  if (v.startsWith("kern")) return "kern";
  return "other";
}
