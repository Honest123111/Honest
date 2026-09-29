import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { applyFilters, parseFilters, parseSort } from "@/lib/filters";
import { formatApn } from "@/lib/apn";

const COLUMNS = [
  "apn_display", "county", "situs_address", "situs_city", "zip", "acres", "zoning", "land_value", "structure_value",
  "asking_price", "distance_to_i10_mi", "nearest_interchange", "corridor_zone", "strategy", "lead_status",
  "assignee_name", "priority", "ev_score", "big_rig_access_score", "years_in_default", "redemption_amount",
  "owed_to_land_ratio", "power_to_sell_date", "auction_status", "auction_date", "owner_names", "has_phone", "has_email",
  "is_vacant", "is_absentee", "is_entity_owner", "tags", "last_activity_at",
] as const;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  // neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of every row matching the current filters (max 10,000), or of ?ids=… */
export async function GET(request: NextRequest) {
  const { supabase, profile } = await getSession();
  if (!profile?.is_active) return new NextResponse("Unauthorized", { status: 401 });
  const sp = request.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const sort = parseSort(sp);
  const { data: terminal } = await supabase.from("lead_statuses").select("key").eq("is_terminal", true);

  let query = supabase.from("property_grid").select(COLUMNS.join(",") + ",apn");
  const ids = sp.get("ids");
  if (ids) query = query.in("id", ids.split(",").slice(0, 10000));
  else
    query = applyFilters(query, filters, {
      meId: profile.id,
      today: new Date().toISOString().slice(0, 10),
      auctionDays: 60,
      staleDays: 14,
      terminalStatuses: (terminal ?? []).map((t) => t.key),
    });
  const { data, error } = await query.order(sort.key, { ascending: sort.asc, nullsFirst: false }).limit(10000);
  if (error) return new NextResponse(error.message, { status: 400 });

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    r.apn_display = r.apn_display ?? formatApn(r.county as never, r.apn as string);
    lines.push(COLUMNS.map((c) => csvCell(r[c])).join(","));
  }
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="properties-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
