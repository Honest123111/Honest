import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? usd0.format(n) : "—";
}

export function fmtNumber(v: number | string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00` : v) : v;
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysSince(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

/** Turn a Postgres/PostgREST error into a message worth showing a user. */
export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  const err = e as { message?: string; details?: string; code?: string };
  if (err.code === "42501") return err.message?.includes("row-level security") ? "You don't have permission to do that." : (err.message ?? "Not allowed");
  if (err.code === "23505") return "That already exists (duplicate).";
  return err.message ?? "Something went wrong";
}

/** Same-site path for post-login redirects; anything else becomes "/". */
export function safePath(p: string | null | undefined): string {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/";
}
