"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Earth, ExternalLink, Layers, Mountain, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatApn } from "@/lib/apn";
import { cn, fmtMoney, fmtNumber } from "@/lib/utils";
import {
  FEASIBILITY_FACTORS, SCORE_BANDS, UNSCORED_COLOR, googleEarthUrl, hazardFlags, scoreColor, streetViewUrl,
  type FeasibilityFactor, type NearbyAnchor, type ScoreComponents,
} from "@/lib/site";
import {
  BASEMAPS, FEATURE_SERVICES, OVERLAYS, OVERLAY_GROUPS, PLACE_COLORS, PLACE_LABELS, featureServiceUrl,
  type BasemapKey, type Overlay,
} from "./overlays";
import type { Database } from "@/lib/database.types";
import { Google3DButton } from "./google-3d";

type Site = Database["public"]["Tables"]["site_feasibility"]["Row"];
type Bbox = [number, number, number, number];

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const RIVERSIDE_CENTER: [number, number] = [-116.6, 33.85];

/** Score → fill color expression for the parcel layers. */
const SCORE_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["typeof", ["get", "score"]], "number"],
  ["step", ["get", "score"], SCORE_BANDS[3].color, 4, SCORE_BANDS[2].color, 6, SCORE_BANDS[1].color, 7.5, SCORE_BANDS[0].color],
  UNSCORED_COLOR,
];

interface Selected {
  id: string;
  apn: string;
  county: Database["public"]["Enums"]["county_name"];
  acres: number | null;
  situs: string | null;
  city: string | null;
  land_use: string | null;
  score: number | null;
  lon: number;
  lat: number;
}

export function SiteMap({ focusId }: { focusId?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKey>("imagery");
  const [terrain3d, setTerrain3d] = useState(false);
  const [active, setActive] = useState<Set<string>>(() => new Set(["places", "storm"]));
  const [minScore, setMinScore] = useState(0);
  // Phones start with the map clear; the panel opens from "Layers" or when a parcel is tapped.
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [zoom, setZoom] = useState(9);
  const [counts, setCounts] = useState<{ total: number; scored: number } | null>(null);
  // Full parcel geometry by id (features from map clicks are clipped to tiles).
  const geomById = useRef<Map<string, GeoJSON.Geometry>>(new Map());
  const supabase = useMemo(() => createClient(), []);

  // --- map setup ---------------------------------------------------------------
  useEffect(() => {
    if (!container.current) return;
    const style: maplibregl.StyleSpecification = {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        ...Object.fromEntries(Object.entries(BASEMAPS).map(([k, b]) => [
          `base-${k}`, { type: "raster", tiles: [...b.tiles], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution },
        ])),
        terrain: {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: "Terrain: AWS Open Data / Mapzen",
        },
      },
      layers: Object.keys(BASEMAPS).map((k) => ({
        id: `base-${k}`, type: "raster", source: `base-${k}`,
        layout: { visibility: k === "imagery" ? "visible" : "none" },
      })),
    };
    const map = new maplibregl.Map({
      container: container.current, style, center: RIVERSIDE_CENTER, zoom: 8.6, maxPitch: 75, attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");

    map.on("load", () => {
      // Raster overlays, below the parcels.
      for (const o of OVERLAYS) {
        if (o.kind !== "raster") continue;
        map.addSource(`ov-${o.id}`, { type: "raster", tiles: [o.tiles()], tileSize: 512, minzoom: o.minzoom ?? 0 });
        map.addLayer({ id: `ov-${o.id}`, type: "raster", source: `ov-${o.id}`, paint: { "raster-opacity": o.opacity }, layout: { visibility: "none" }, minzoom: o.minzoom ?? 0 });
      }
      // Vector overlays.
      map.addSource("flood", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "flood", type: "fill", source: "flood", layout: { visibility: "none" },
        paint: { "fill-color": ["case", ["==", ["get", "SFHA_TF"], "T"], "#0284c7", "#7dd3fc"], "fill-opacity": 0.35, "fill-outline-color": "#0369a1" },
      });
      for (const [id, color, width, dash] of [["storm", "#0ea5e9", 2, undefined], ["sewer", "#a16207", 2.5, [2, 1]], ["water", "#2563eb", 3, undefined]] as const) {
        map.addSource(id, { type: "geojson", data: EMPTY });
        map.addLayer({
          id, type: "line", source: id, layout: { visibility: "none", "line-cap": "round" },
          paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 12, width * 0.6, 17, width * 1.8], ...(dash ? { "line-dasharray": [...dash] } : {}) },
        });
      }

      // Parcels (polygons + a dot for every parcel so they're findable when zoomed out).
      map.addSource("parcels", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addLayer({
        id: "parcel-fill", type: "fill", source: "parcels", filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": SCORE_COLOR_EXPR, "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.65, 0.4] },
      });
      map.addLayer({
        id: "parcel-line", type: "line", source: "parcels",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", SCORE_COLOR_EXPR],
          // "zoom" must be the top-level input, so the selected/unselected case goes inside each stop.
          "line-width": ["interpolate", ["linear"], ["zoom"],
            10, ["case", ["boolean", ["feature-state", "selected"], false], 3, 0.5],
            16, ["case", ["boolean", ["feature-state", "selected"], false], 3, 2]],
        },
      });
      map.addSource("parcel-points", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "parcel-dot", type: "circle", source: "parcel-points", maxzoom: 14,
        paint: {
          "circle-color": SCORE_COLOR_EXPR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 13, 6],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
        },
      });

      // Commercial places on top.
      map.addSource("places", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "places", type: "circle", source: "places", layout: { visibility: "visible" },
        paint: {
          "circle-color": ["match", ["get", "category"], ...Object.entries(PLACE_COLORS).flat(), "#888888"] as unknown as maplibregl.ExpressionSpecification,
          "circle-radius": ["match", ["get", "category"], "anchor", 7, "grocery", 5, 3.5],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "places-label", type: "symbol", source: "places", minzoom: 11,
        filter: ["in", ["get", "category"], ["literal", ["anchor", "grocery"]]],
        layout: { "text-field": ["coalesce", ["get", "brand"], ["get", "name"]], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#ffffff", "text-halo-color": "#111827", "text-halo-width": 1.2 },
      });

      map.on("zoomend", () => setZoom(map.getZoom()));
      setReady(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // --- parcels --------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("map_properties");
      if (cancelled || error || !data) return;
      const fc = data as unknown as GeoJSON.FeatureCollection;
      geomById.current = new Map(fc.features.map((f) => [String(f.properties?.id), f.geometry]));
      const map = mapRef.current!;
      (map.getSource("parcels") as GeoJSONSource).setData(fc);
      (map.getSource("parcel-points") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: fc.features.map((f) => ({ type: "Feature", properties: f.properties, geometry: { type: "Point", coordinates: [f.properties!.lon, f.properties!.lat] } })),
      });
      setCounts({ total: fc.features.length, scored: fc.features.filter((f) => typeof f.properties?.score === "number").length });
      if (focusId) {
        const f = fc.features.find((x) => x.properties?.id === focusId);
        if (f) select(f.properties as Selected, true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, supabase, focusId]);

  // --- selection ------------------------------------------------------------------
  const selectedRef = useRef<string | null>(null);
  const select = useCallback((p: Selected, fly = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedRef.current) map.setFeatureState({ source: "parcels", id: selectedRef.current }, { selected: false });
    selectedRef.current = p.id;
    map.setFeatureState({ source: "parcels", id: p.id }, { selected: true });
    setSelected(p);
    setPanelOpen(true);
    if (fly) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15.5), duration: 1200 });
  }, []);

  useEffect(() => {
    if (!selected) { setSite(null); return; }
    let cancelled = false;
    supabase.from("site_feasibility").select("*").eq("property_id", selected.id).maybeSingle().then(({ data }) => {
      if (!cancelled) setSite(data);
    });
    return () => { cancelled = true; };
  }, [selected, supabase]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f?.properties) select(f.properties as unknown as Selected);
    };
    const pointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const unpointer = () => { map.getCanvas().style.cursor = ""; };
    for (const l of ["parcel-fill", "parcel-dot"]) {
      map.on("click", l, onClick);
      map.on("mouseenter", l, pointer);
      map.on("mouseleave", l, unpointer);
    }
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    const showPlace = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popup.setLngLat(e.lngLat).setText(`${p.brand ?? p.name ?? "Unnamed"} · ${PLACE_LABELS[p.category] ?? p.category}`).addTo(map);
    };
    map.on("mousemove", "places", showPlace);
    map.on("mouseleave", "places", () => popup.remove());
    return () => {
      for (const l of ["parcel-fill", "parcel-dot"]) {
        map.off("click", l, onClick);
        map.off("mouseenter", l, pointer);
        map.off("mouseleave", l, unpointer);
      }
      map.off("mousemove", "places", showPlace);
      popup.remove();
    };
  }, [ready, select]);

  // --- basemap, terrain, filters, raster overlays ----------------------------------
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    for (const k of Object.keys(BASEMAPS)) map.setLayoutProperty(`base-${k}`, "visibility", k === basemap ? "visible" : "none");
  }, [ready, basemap]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    if (terrain3d) {
      map.setTerrain({ source: "terrain", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 600 });
    }
  }, [ready, terrain3d]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const f: maplibregl.FilterSpecification | null = minScore > 0 ? [">=", ["coalesce", ["get", "score"], -1], minScore] : null;
    map.setFilter("parcel-fill", f ? ["all", ["==", ["geometry-type"], "Polygon"], f] : ["==", ["geometry-type"], "Polygon"]);
    map.setFilter("parcel-line", f);
    map.setFilter("parcel-dot", f);
  }, [ready, minScore]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    for (const o of OVERLAYS) {
      const layers = o.kind === "raster" ? [`ov-${o.id}`] : o.id === "places" ? ["places", "places-label"] : [o.id];
      for (const l of layers) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", active.has(o.id) ? "visible" : "none");
    }
  }, [ready, active]);

  // --- vector overlays follow the view ------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    let ctrl: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      ctrl?.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      const b = map.getBounds();
      const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const z = map.getZoom();
      const want = (id: string, minzoom: number) => active.has(id) && z >= minzoom;
      const set = (id: string, data: unknown) => { if (!signal.aborted) (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as GeoJSON.FeatureCollection); };
      const [w, s, e, n] = bbox;

      const jobs: PromiseLike<unknown>[] = [];
      if (want("places", 10)) jobs.push(supabase.rpc("map_pois", { p_west: w, p_south: s, p_east: e, p_north: n }).then(({ data }) => set("places", data ?? EMPTY)));
      else set("places", EMPTY);
      if (want("storm", 12)) jobs.push(supabase.rpc("map_storm_drains", { p_west: w, p_south: s, p_east: e, p_north: n }).then(({ data }) => set("storm", data ?? EMPTY)));
      else set("storm", EMPTY);
      for (const id of ["sewer", "water", "flood"] as const) {
        if (!want(id, 12)) { set(id, EMPTY); continue; }
        const fields = id === "flood" ? "FLD_ZONE,SFHA_TF" : "OBJECTID";
        jobs.push(fetch(featureServiceUrl(FEATURE_SERVICES[id], bbox, fields), { signal })
          .then((r) => (r.ok ? r.json() : EMPTY)).then((d) => set(id, d)).catch(() => undefined));
      }
      await Promise.all(jobs);
    }

    const onMove = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    map.on("moveend", onMove);
    refresh();
    return () => { map.off("moveend", onMove); clearTimeout(timer); ctrl?.abort(); };
  }, [ready, active, supabase]);

  function toggle(id: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="relative h-[calc(100dvh-3.5rem-8rem)] min-h-[420px] overflow-hidden rounded-lg border md:h-[calc(100dvh-3.5rem-3rem)]">
      <div ref={container} className="absolute inset-0" aria-label="Site map" />

      {/* toolbar */}
      <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded-md border bg-background/95 text-xs shadow-sm">
          {(Object.keys(BASEMAPS) as BasemapKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setBasemap(k)}
              className={cn("px-2.5 py-1.5", basemap === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {BASEMAPS[k].label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setTerrain3d((v) => !v)}
          className={cn("flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs shadow-sm", terrain3d ? "bg-primary text-primary-foreground" : "bg-background/95 hover:bg-muted")}>
          <Mountain className="size-3.5" /> 3D hills
        </button>
        <button type="button" onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md border bg-background/95 px-2.5 py-1.5 text-xs shadow-sm hover:bg-muted">
          <Layers className="size-3.5" /> Layers
        </button>
      </div>

      {/* side panel */}
      {panelOpen && (
        <div className="absolute bottom-2 left-2 top-12 z-10 flex w-[min(20rem,calc(100%-1rem))] flex-col overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">{selected ? formatApn(selected.county, selected.apn) : "Layers"}</span>
            <button type="button" aria-label="Close panel" onClick={() => (selected ? setSelected(null) : setPanelOpen(false))} className="rounded p-1 hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
            {selected ? <SelectedPanel p={selected} site={site} geometry={geomById.current.get(selected.id)} /> : (
              <LayerPanel active={active} toggle={toggle} zoom={zoom} minScore={minScore} setMinScore={setMinScore} counts={counts} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerPanel({ active, toggle, zoom, minScore, setMinScore, counts }: {
  active: Set<string>; toggle: (id: string) => void; zoom: number;
  minScore: number; setMinScore: (n: number) => void; counts: { total: number; scored: number } | null;
}) {
  return (
    <div className="grid gap-4">
      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parcels · feasibility score</h4>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...SCORE_BANDS].reverse().map((b) => (
            <span key={b.label} className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: b.color }} />{b.label} {b.min > 0 ? `≥${b.min}` : "<4"}</span>
          ))}
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: UNSCORED_COLOR }} />Not scored</span>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs">
          Min score
          <input type="range" min={0} max={9} step={0.5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
          <span className="w-6 tabular-nums">{minScore}</span>
        </label>
        {counts && <p className="mt-1 text-xs text-muted-foreground">{counts.scored.toLocaleString()} of {counts.total.toLocaleString()} parcels scored</p>}
      </section>
      {OVERLAY_GROUPS.map((g) => (
        <section key={g}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
          <div className="grid gap-0.5">
            {OVERLAYS.filter((o) => o.group === g).map((o) => <OverlayToggle key={o.id} o={o} on={active.has(o.id)} toggle={toggle} zoom={zoom} />)}
          </div>
        </section>
      ))}
      <section className="text-xs text-muted-foreground">
        <h4 className="mb-1 font-semibold uppercase tracking-wide">Commercial places</h4>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(PLACE_COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: c }} />{PLACE_LABELS[k]}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverlayToggle({ o, on, toggle, zoom }: { o: Overlay; on: boolean; toggle: (id: string) => void; zoom: number }) {
  const minzoom = o.minzoom ?? 0;
  const hidden = on && zoom < minzoom;
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted" title={o.note}>
      <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="mt-0.5 accent-[var(--primary)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {o.kind === "vector" && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: o.swatch }} />}
          {o.label}
        </span>
        {hidden && <span className="block text-[11px] text-muted-foreground">Zoom in to see</span>}
        {on && o.note && !hidden && <span className="block text-[11px] text-muted-foreground">{o.note}</span>}
      </span>
    </label>
  );
}

function SelectedPanel({ p, site, geometry }: { p: Selected; site: Site | null; geometry?: GeoJSON.Geometry }) {
  const sc = (site?.score_components ?? {}) as ScoreComponents;
  const anchors = (site?.nearest_anchors ?? []) as unknown as NearbyAnchor[];
  const flags = site ? hazardFlags(site) : [];
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-xs text-muted-foreground">{[p.situs, p.city].filter(Boolean).join(", ") || "No situs address"}</p>
        <p className="text-xs text-muted-foreground">{[p.acres ? `${fmtNumber(p.acres)} ac` : null, p.land_use].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg text-white" style={{ background: scoreColor(site?.feasibility_score ?? p.score) }}>
          <span className="text-lg font-bold leading-none">{site?.feasibility_score ?? p.score ?? "—"}</span>
          <span className="text-[10px] opacity-90">/ 10</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Development feasibility
          {sc.factors_used !== undefined && <span className="block">Based on {sc.factors_used} of {sc.factors_total} factors</span>}
          {!site?.fetched_at && <span className="block">Site facts not fetched yet</span>}
        </div>
      </div>
      {sc.components && (
        <div className="grid gap-1.5">
          {(Object.keys(FEASIBILITY_FACTORS) as FeasibilityFactor[]).map((k) => {
            const v = sc.components?.[k];
            return (
              <div key={k} title={FEASIBILITY_FACTORS[k].hint}>
                <div className="flex justify-between text-xs"><span>{FEASIBILITY_FACTORS[k].label}</span><span className="tabular-nums text-muted-foreground">{v === undefined ? "no data" : `${Math.round(v * 100)}%`}</span></div>
                <div className="mt-0.5 h-1.5 rounded bg-muted">{v !== undefined && <div className="h-1.5 rounded" style={{ width: `${v * 100}%`, background: scoreColor(v * 10) }} />}</div>
              </div>
            );
          })}
        </div>
      )}
      {site && (
        <div className="grid gap-1 text-xs">
          {site.slope_mean_deg !== null && <Row k="Slope">{site.slope_mean_deg}° avg · {site.slope_max_deg}° max</Row>}
          {site.elev_min_ft !== null && <Row k="Elevation">{site.elev_min_ft?.toLocaleString()}–{site.elev_max_ft?.toLocaleString()} ft</Row>}
          <Row k="Zoning (county)">{site.zoning_county ?? "—"}</Row>
          <Row k="General plan">{site.gp_land_use ?? "—"}</Row>
          <Row k="Water district">{site.water_district ?? "None mapped"}</Row>
          <Row k="Storm drain">{site.storm_drain_mi === null ? "—" : `${site.storm_drain_mi} mi`}</Row>
          <Row k="Flood zone">{site.flood_zone ?? "Outside mapped zones"}</Row>
          <Row k="Planning cases ≤3 mi">{site.dev_cases_3mi ?? "—"}</Row>
          <Row k="Restaurants ≤3 mi">{site.restaurants_3mi ?? "—"}</Row>
          {site.est_price_per_acre !== null && <Row k="Est. $/acre (comps)">{fmtMoney(site.est_price_per_acre)}</Row>}
        </div>
      )}
      {flags.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="font-medium">Constraints</p>
          <ul className="ml-4 list-disc">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {anchors.length > 0 && (
        <div className="text-xs">
          <p className="mb-0.5 font-medium">Nearest anchor stores</p>
          {anchors.slice(0, 4).map((a, i) => <Row key={i} k={a.brand ?? a.name ?? "Store"}>{a.mi} mi</Row>)}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/properties/${p.id}?tab=site`} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">Open property</Link>
        <Google3DButton className="h-auto px-2.5 py-1.5" target={{
          label: formatApn(p.county, p.apn), lat: p.lat, lon: p.lon, geometry,
          color: scoreColor(site?.feasibility_score ?? p.score),
        }} />
        <a href={googleEarthUrl(p.lat, p.lon)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"><Earth className="size-3.5" /> Google Earth</a>
        <a href={streetViewUrl(p.lat, p.lon)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"><ExternalLink className="size-3.5" /> Street View</a>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-2 border-b py-0.5 last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{children}</span></div>;
}
