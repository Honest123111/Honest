"use client";

import Link from "next/link";
import { Earth, ExternalLink, MapPinned } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, KeyValue } from "@/components/ui/misc";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/utils";
import {
  FEASIBILITY_FACTORS, googleEarthUrl, hazardFlags, scoreBand, scoreColor, streetViewUrl,
  type DevCase, type FeasibilityFactor, type NearbyAnchor, type ScoreComponents,
} from "@/lib/site";
import type { Comp, Property, Site } from "./types";
import { formatApn } from "@/lib/apn";
import { Google3DButton } from "@/components/map/google-3d";

export function SiteTab({ property: p, site, comps }: { property: Property; site: Site | null; comps: Comp[] }) {
  const coords = (p as unknown as { centroid?: { coordinates?: [number, number] } }).centroid?.coordinates;
  const [lon, lat] = coords ?? [null, null];

  const links = (
    <div className="flex flex-wrap gap-2">
      <Link href={`/map?property=${p.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"><MapPinned className="size-4" /> View on site map</Link>
      {lat !== null && lon !== null && (
        <>
          <Google3DButton size="default" target={{
            label: formatApn(p.county, p.apn), lat, lon,
            geometry: (p as unknown as { geom?: unknown }).geom, color: scoreColor(site?.feasibility_score),
          }} />
          <a href={googleEarthUrl(lat, lon)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><Earth className="size-4" /> Google Earth 3D</a>
          <a href={streetViewUrl(lat, lon)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Street View</a>
        </>
      )}
    </div>
  );

  if (!site?.fetched_at) {
    return (
      <div className="grid gap-4">
        {links}
        <EmptyState title="Site facts haven't been pulled for this parcel yet">
          The nightly “Site Feasibility Enrichment” workflow fills terrain, utilities, hazards, zoning and nearby development for every parcel with a location.
        </EmptyState>
      </div>
    );
  }

  const sc = site.score_components as ScoreComponents;
  const band = scoreBand(site.feasibility_score);
  const anchors = site.nearest_anchors as unknown as NearbyAnchor[];
  const cases = site.dev_cases as unknown as DevCase[];
  const flags = hazardFlags(site);

  return (
    <div className="grid gap-4">
      {links}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Development feasibility</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: scoreColor(site.feasibility_score) }}>
                <span className="text-2xl font-bold leading-none">{site.feasibility_score ?? "—"}</span>
                <span className="text-[10px] opacity-90">/ 10</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">{band?.label ?? "Not scored"}</p>
                <p className="text-xs text-muted-foreground">Based on {sc.factors_used ?? 0} of {sc.factors_total ?? 6} factors · updated {fmtDate(site.computed_at)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2.5">
              {(Object.keys(FEASIBILITY_FACTORS) as FeasibilityFactor[]).map((k) => {
                const v = sc.components?.[k];
                return (
                  <div key={k}>
                    <div className="flex justify-between text-sm">
                      <span>{FEASIBILITY_FACTORS[k].label} <span className="text-xs text-muted-foreground">×{sc.weights?.[k] ?? "—"}</span></span>
                      <span className="tabular-nums text-muted-foreground">{v === undefined ? "no data" : `${Math.round(v * 100)}%`}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-muted">{v !== undefined && <div className="h-2 rounded" style={{ width: `${v * 100}%`, background: scoreColor(v * 10) }} />}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{FEASIBILITY_FACTORS[k].hint}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Terrain & utilities</CardTitle></CardHeader>
          <CardContent>
            <KeyValue label="Mean slope">{site.slope_mean_deg === null ? "—" : `${site.slope_mean_deg}°`}</KeyValue>
            <KeyValue label="Steepest point">{site.slope_max_deg === null ? "—" : `${site.slope_max_deg}°`}</KeyValue>
            <KeyValue label="Elevation">{site.elev_min_ft === null ? "—" : `${site.elev_min_ft.toLocaleString()}–${site.elev_max_ft?.toLocaleString()} ft`}</KeyValue>
            <KeyValue label="Water district">{site.water_district ?? "None mapped"}</KeyValue>
            <KeyValue label="Nearest storm drain">{site.storm_drain_mi === null ? "—" : `${fmtNumber(site.storm_drain_mi)} mi`}</KeyValue>
            <KeyValue label="Sewer">Ask the water district (lines not published countywide)</KeyValue>
            <KeyValue label="Power">Check SCE DRPEP map</KeyValue>
            <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planning</h4>
            <KeyValue label="Zoning (county)">{site.zoning_county ?? "— (city zoning)"}</KeyValue>
            <KeyValue label="General plan">{site.gp_land_use ?? "—"}</KeyValue>
            <KeyValue label="GP foundation">{site.gp_foundation ?? "—"}</KeyValue>
            <KeyValue label="Specific plan">{site.specific_plan ?? "—"}</KeyValue>
            <KeyValue label="Farmland">{site.farmland ?? "—"}</KeyValue>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Hazards & constraints</CardTitle></CardHeader>
          <CardContent>
            <KeyValue label="Fire hazard">{site.fire_hazard ?? "Not in a mapped zone"}</KeyValue>
            <KeyValue label="Flood zone (FEMA)">{site.flood_zone ? `${site.flood_zone}${site.flood_sfha ? " (100-yr)" : ""}` : "Outside mapped zones"}</KeyValue>
            <KeyValue label="Fault zone">{site.fault_zone ? "Yes" : "No"}</KeyValue>
            <KeyValue label="Liquefaction">{site.liquefaction ?? "—"}</KeyValue>
            <KeyValue label="MSHCP criteria cell">{site.mshcp_criteria_cell ?? "No"}</KeyValue>
            <KeyValue label="Airport influence">{site.airport_influence ?? "No"}</KeyValue>
            {flags.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No mapped constraints.</p>
            ) : (
              <ul className="ml-4 mt-3 list-disc text-sm">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Commercial activity nearby</CardTitle></CardHeader>
          <CardContent>
            <KeyValue label="Anchor stores ≤5 mi">{site.anchors_5mi ?? "—"}</KeyValue>
            <KeyValue label="Restaurants ≤3 mi">{site.restaurants_3mi ?? "—"}</KeyValue>
            <KeyValue label="Grocery ≤3 mi">{site.grocery_3mi ?? "—"}</KeyValue>
            <KeyValue label="Fuel ≤3 mi">{site.fuel_3mi ?? "—"}</KeyValue>
            {anchors.length > 0 && (
              <>
                <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearest anchors</h4>
                {anchors.map((a, i) => <KeyValue key={i} label={a.brand ?? a.name ?? "Store"}>{fmtNumber(a.mi, 1)} mi</KeyValue>)}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>New development within 3 mi ({site.dev_cases_3mi ?? 0})</CardTitle></CardHeader>
          <CardContent>
            {cases.length === 0 ? <p className="text-sm text-muted-foreground">No planning cases filed in the last 3 years.</p> : (
              <ul className="grid gap-2">
                {cases.map((c) => (
                  <li key={c.id} className="border-b pb-2 text-sm last:border-0">
                    <div className="flex justify-between gap-2"><span className="font-medium">{c.type}</span><span className="shrink-0 text-xs text-muted-foreground">{c.mi === null ? "" : `${c.mi} mi · `}{fmtDate(c.applied)}</span></div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.descr}</p>
                    <p className="text-xs">{c.id} · {c.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Estimated value from recent land sales</CardTitle></CardHeader>
        <CardContent>
          {site.est_price_per_acre !== null ? (
            <div className="mb-3 grid gap-x-8 sm:grid-cols-2">
              <KeyValue label="Median $/acre">{fmtMoney(site.est_price_per_acre)}</KeyValue>
              <KeyValue label="Estimated value">{fmtMoney(site.est_value)}</KeyValue>
              <KeyValue label="Comps used">{site.comps_n} within {site.comps_radius_mi} mi (last 3 yrs, similar size)</KeyValue>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">
              Not enough closed land sales nearby yet (needs 3 within 10 mi in the last 3 years). Import comps on the Imports page, or connect a sales-data provider.
            </p>
          )}
          {comps.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Sold</th><th>APN</th><th>City</th><th className="text-right">Acres</th><th className="text-right">Price</th><th className="text-right">$/acre</th><th className="text-right">Dist.</th></tr></thead>
                <tbody>
                  {comps.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-1">{fmtDate(c.sale_date)}</td><td>{c.apn ?? "—"}</td><td>{c.situs_city ?? "—"}</td>
                      <td className="text-right tabular-nums">{fmtNumber(c.acres)}</td><td className="text-right tabular-nums">{fmtMoney(c.sale_price)}</td>
                      <td className="text-right tabular-nums">{fmtMoney(c.price_per_acre)}</td><td className="text-right tabular-nums">{c.distance_mi} mi</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
