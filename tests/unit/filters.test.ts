import { describe, expect, it } from "vitest";
import { applyFilters, countActive, filtersToParams, parseFilters, parseSort, type FilterBuilder } from "@/lib/filters";

/** Records the PostgREST calls a filter set produces. */
class Recorder implements FilterBuilder<Recorder> {
  calls: string[] = [];
  private add(s: string) { this.calls.push(s); return this; }
  in(c: string, v: readonly unknown[]) { return this.add(`in:${c}:${v.join("|")}`); }
  eq(c: string, v: unknown) { return this.add(`eq:${c}:${v}`); }
  gte(c: string, v: unknown) { return this.add(`gte:${c}:${v}`); }
  lte(c: string, v: unknown) { return this.add(`lte:${c}:${v}`); }
  lt(c: string, v: unknown) { return this.add(`lt:${c}:${v}`); }
  gt(c: string, v: unknown) { return this.add(`gt:${c}:${v}`); }
  is(c: string, v: null | boolean) { return this.add(`is:${c}:${v}`); }
  ilike(c: string, v: string) { return this.add(`ilike:${c}:${v}`); }
  or(f: string) { return this.add(`or:${f}`); }
  overlaps(c: string, v: readonly unknown[]) { return this.add(`ov:${c}:${v.join("|")}`); }
  not(c: string, op: string, v: unknown) { return this.add(`not:${c}:${op}:${v}`); }
}
const ctx = { meId: "me-1", today: "2026-09-28", auctionDays: 60, staleDays: 14, terminalStatuses: ["closed_won", "dead"] };

describe("filters", () => {
  it("round-trips through the URL", () => {
    const f = parseFilters(new URLSearchParams("zone=i10_corridor,i10_near&amin=5&status=new&q=blythe&vacant=y&bogus=1&dmax=abc"));
    expect(f).toEqual({ zone: ["i10_corridor", "i10_near"], amin: 5, status: ["new"], q: "blythe", vacant: "y" });
    expect(parseFilters(filtersToParams(f))).toEqual(f);
    expect(countActive(f)).toBe(4);
  });

  it("maps to PostgREST calls", () => {
    const r = applyFilters(new Recorder(), { zone: ["i10_corridor"], amin: 5, assignee: "me", vacant: "n", tags: ["EV Candidate"], owner: "y" }, ctx);
    expect(r.calls).toEqual([
      "in:corridor_zone:i10_corridor", "gte:acres:5", "eq:assignee_id:me-1", "eq:is_vacant:false", "ov:tags:EV Candidate", "gt:owner_count:0",
    ]);
  });

  it("searches APN digits and text, and escapes PostgREST syntax", () => {
    const r = applyFilters(new Recorder(), { q: "836-121" }, ctx);
    expect(r.calls).toEqual(["or:situs_address.ilike.*836-121*,situs_city.ilike.*836-121*,owner_names.ilike.*836-121*,apn.like.836121*"]);
    const bad = applyFilters(new Recorder(), { q: "a,b(c)" }, ctx);
    expect(bad.calls[0]).not.toMatch(/[()]/);
  });

  it("combines several OR groups into one and(or(),or()) tree", () => {
    const r = applyFilters(new Recorder(), { q: "x", act_before: "2026-01-01" }, ctx);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatch(/^or:and\(or\(.+\),or\(last_activity_at\.is\.null,last_activity_at\.lt\.2026-01-01\)\)$/);
  });

  it("auction window and stale leads", () => {
    const a = applyFilters(new Recorder(), { auction: "soon" }, ctx);
    expect(a.calls).toEqual(["gte:auction_date:2026-09-28", "lte:auction_date:2026-11-27"]);
    const s = applyFilters(new Recorder(), { stale: "1" }, ctx);
    expect(s.calls[0]).toBe("not:lead_status:in:(closed_won,dead)");
    expect(s.calls[1]).toMatch(/^or:and\(or\(lead_status\.neq\.new,assignee_id\.not\.is\.null\),or\(last_activity_at\.lt\./);
  });

  it("only allows known sort keys", () => {
    expect(parseSort(new URLSearchParams("sort=acres.desc"))).toEqual({ key: "acres", asc: false });
    expect(parseSort(new URLSearchParams("sort=password.asc"))).toEqual({ key: "updated_at", asc: false });
  });
});
