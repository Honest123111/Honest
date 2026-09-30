/**
 * Loads the Google Maps JavaScript API once per page and hands back its
 * `importLibrary`. The key is a browser key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 * locked to this app's domains in Google Cloud; without it the 3D view shows
 * setup instructions instead.
 */

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/** Photorealistic 3D ("maps3d") ships on the beta channel first; override if Google moves it. */
export const GOOGLE_MAPS_VERSION = process.env.NEXT_PUBLIC_GOOGLE_MAPS_VERSION || "beta";

type ImportLibrary = (name: string) => Promise<Record<string, unknown>>;
interface GoogleGlobal { maps?: { importLibrary?: ImportLibrary } }

let loading: Promise<ImportLibrary> | null = null;

export function googleMapsScriptUrl(key: string, version: string, callback: string): string {
  const qs = new URLSearchParams({ key, v: version, loading: "async", callback });
  return `https://maps.googleapis.com/maps/api/js?${qs.toString()}`;
}

export function loadGoogleMaps(): Promise<ImportLibrary> {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  if (loading) return loading;
  loading = new Promise<ImportLibrary>((resolve, reject) => {
    const w = window as unknown as { google?: GoogleGlobal; __htGoogleMapsReady?: () => void };
    const existing = w.google?.maps?.importLibrary;
    if (existing) return resolve(existing);
    w.__htGoogleMapsReady = () => {
      const lib = w.google?.maps?.importLibrary;
      if (lib) resolve(lib);
      else reject(new Error("Google Maps loaded without importLibrary"));
    };
    const s = document.createElement("script");
    s.src = googleMapsScriptUrl(GOOGLE_MAPS_KEY, GOOGLE_MAPS_VERSION, "__htGoogleMapsReady");
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error("Could not load Google Maps (network or key restriction)")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Outer ring of a GeoJSON (Multi)Polygon as {lat, lng} points, or null. */
export function outerRing(geom: unknown): { lat: number; lng: number }[] | null {
  const g = geom as { type?: string; coordinates?: unknown } | null;
  if (!g?.coordinates) return null;
  const ring = g.type === "Polygon" ? (g.coordinates as number[][][])[0]
    : g.type === "MultiPolygon" ? (g.coordinates as number[][][][])[0]?.[0]
    : null;
  if (!ring || ring.length < 3) return null;
  return ring.map(([lng, lat]) => ({ lat, lng }));
}
