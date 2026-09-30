/**
 * Map overlays. Raster overlays are live ArcGIS "export" images the map requests
 * per tile ({bbox-epsg-3857}); vector overlays are GeoJSON fetched for the
 * current view. Every source is free public data and allows browser (CORS) access.
 */

const COUNTY = "https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/General/MapServer";
const DEM = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer";

function countyTiles(layerIds: number[], layerDefs?: Record<number, string>): string {
  const defs = layerDefs ? `&layerDefs=${encodeURIComponent(JSON.stringify(layerDefs))}` : "";
  return `${COUNTY}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&format=png32&transparent=true&f=image&layers=show:${layerIds.join(",")}${defs}`;
}

function demTiles(rasterFunction: string): string {
  return `${DEM}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png&f=image&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction }))}`;
}

function planningCasesSince(): string {
  const d = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
  return `CASE_MODULE = 'PLAN' AND APPLIED_DATE >= DATE '${d}'`;
}

export type OverlayGroup = "Utilities" | "Terrain" | "Hazards" | "Planning" | "Commercial";

export interface RasterOverlay {
  kind: "raster";
  id: string;
  label: string;
  group: OverlayGroup;
  tiles: () => string;
  opacity: number;
  minzoom?: number;
  note?: string;
}

export interface VectorOverlay {
  kind: "vector";
  id: string;
  label: string;
  group: OverlayGroup;
  minzoom: number;
  note?: string;
  swatch: string;
}

export type Overlay = RasterOverlay | VectorOverlay;

export const OVERLAYS: Overlay[] = [
  // Utilities
  { kind: "vector", id: "storm", label: "Storm drains", group: "Utilities", minzoom: 12, swatch: "#0ea5e9", note: "RCFC + city storm drain lines" },
  { kind: "vector", id: "sewer", label: "Sewer mains", group: "Utilities", minzoom: 12, swatch: "#a16207", note: "Mission Springs WD only (Desert Hot Springs area). Other districts don't publish sewer lines." },
  { kind: "vector", id: "water", label: "Water transmission mains", group: "Utilities", minzoom: 12, swatch: "#2563eb", note: "Mission Springs WD only" },
  { kind: "raster", id: "water_districts", label: "Water districts", group: "Utilities", tiles: () => countyTiles([470]), opacity: 0.45 },
  // Terrain
  { kind: "raster", id: "slope", label: "Slope (steepness)", group: "Terrain", tiles: () => demTiles("Slope Map"), opacity: 0.5, minzoom: 10, note: "USGS 3DEP — red/orange is steep hillside" },
  { kind: "raster", id: "hillshade", label: "Hillshade", group: "Terrain", tiles: () => demTiles("Hillshade Multidirectional"), opacity: 0.45 },
  { kind: "raster", id: "contours", label: "Contours (25 m)", group: "Terrain", tiles: () => demTiles("Contour Smoothed 25"), opacity: 0.8, minzoom: 13 },
  // Hazards
  { kind: "vector", id: "flood", label: "FEMA flood zones", group: "Hazards", minzoom: 12, swatch: "#38bdf8", note: "Esri's public copy of FEMA NFHL" },
  { kind: "raster", id: "fire", label: "Fire hazard severity", group: "Hazards", tiles: () => countyTiles([220]), opacity: 0.45 },
  { kind: "raster", id: "faults", label: "Fault zones", group: "Hazards", tiles: () => countyTiles([200, 210]), opacity: 0.6 },
  { kind: "raster", id: "liquefaction", label: "Liquefaction", group: "Hazards", tiles: () => countyTiles([250]), opacity: 0.45 },
  { kind: "raster", id: "mshcp", label: "MSHCP habitat cells", group: "Hazards", tiles: () => countyTiles([520]), opacity: 0.45, note: "Western Riverside habitat plan — conservation may be required" },
  // Planning
  { kind: "raster", id: "zoning", label: "Zoning (county)", group: "Planning", tiles: () => countyTiles([620]), opacity: 0.5 },
  { kind: "raster", id: "general_plan", label: "General plan land use", group: "Planning", tiles: () => countyTiles([230]), opacity: 0.5 },
  { kind: "raster", id: "specific_plans", label: "Specific plans", group: "Planning", tiles: () => countyTiles([380]), opacity: 0.5 },
  { kind: "raster", id: "dev_cases", label: "Planning cases (last 3 yrs)", group: "Planning", tiles: () => countyTiles([280], { 280: planningCasesSince() }), opacity: 0.6, minzoom: 11, note: "County PLUS cases: tract maps, plot plans, CUPs, specific plans…" },
  { kind: "raster", id: "airport", label: "Airport influence areas", group: "Planning", tiles: () => countyTiles([30]), opacity: 0.4 },
  // Commercial
  { kind: "vector", id: "places", label: "Commercial places", group: "Commercial", minzoom: 10, swatch: "#db2777", note: "OpenStreetMap: Costco / big-box, grocery, restaurants, fuel" },
];

export const OVERLAY_GROUPS: OverlayGroup[] = ["Utilities", "Terrain", "Hazards", "Planning", "Commercial"];

export const PLACE_COLORS: Record<string, string> = {
  anchor: "#db2777",
  grocery: "#16a34a",
  restaurant: "#f97316",
  fuel: "#6366f1",
  shopping: "#0891b2",
  commercial_area: "#a855f7",
  industrial_area: "#64748b",
};

export const PLACE_LABELS: Record<string, string> = {
  anchor: "Anchor store (Costco, big-box)",
  grocery: "Grocery",
  restaurant: "Restaurant / café",
  fuel: "Fuel",
  shopping: "Other retail",
  commercial_area: "Commercial area",
  industrial_area: "Industrial area",
};

/** GeoJSON URLs for the vector overlays that come straight from ArcGIS feature services. */
export const FEATURE_SERVICES: Record<"sewer" | "water" | "flood", string> = {
  sewer: "https://services6.arcgis.com/l4iyoTOEIuq2aNPw/arcgis/rest/services/Sewer_Gravity_Main_Public/FeatureServer/222",
  water: "https://services6.arcgis.com/l4iyoTOEIuq2aNPw/arcgis/rest/services/Water_Transmission_Lines_Public/FeatureServer/4",
  flood: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0",
};

export function featureServiceUrl(base: string, bbox: [number, number, number, number], outFields = "*"): string {
  const env = bbox.map((n) => n.toFixed(6)).join(",");
  return `${base}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent(outFields)}&outSR=4326&maxAllowableOffset=0.00005&resultRecordCount=2000&f=geojson`;
}

export const BASEMAPS = {
  imagery: {
    label: "Satellite",
    tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Imagery: USGS National Map",
    maxzoom: 16,
  },
  topo: {
    label: "Topo",
    tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
    attribution: "USGS National Map",
    maxzoom: 16,
  },
  streets: {
    label: "Streets",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
    maxzoom: 19,
  },
} as const;
export type BasemapKey = keyof typeof BASEMAPS;
