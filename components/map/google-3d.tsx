"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Earth } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GOOGLE_MAPS_KEY, loadGoogleMaps, outerRing } from "@/lib/google-maps";
import { googleEarthUrl } from "@/lib/site";

export interface Google3DTarget {
  label: string;
  lat: number;
  lon: number;
  /** GeoJSON Polygon/MultiPolygon of the parcel, drawn on the terrain when present. */
  geometry?: unknown;
  /** Outline color, e.g. the parcel's score color. */
  color?: string;
}

/** Button + dialog with Google's photorealistic 3D view of a parcel. */
export function Google3DButton({ target, className, size = "sm" }: { target: Google3DTarget | null; className?: string; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} disabled={!target} onClick={() => setOpen(true)}>
        <Box /> Google 3D
      </Button>
      {target && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title={`3D view · ${target.label}`} description="Google photorealistic 3D. Drag to orbit, scroll to zoom, right-drag (or two fingers) to tilt."
            className="sm:max-w-5xl">
            {open && <Google3DView target={target} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

type Ctor = new (opts?: Record<string, unknown>) => HTMLElement & Record<string, unknown>;

function Google3DView({ target }: { target: Google3DTarget }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(GOOGLE_MAPS_KEY ? null : "missing-key");

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !host.current) return;
    let cancelled = false;
    let el: HTMLElement | null = null;
    (async () => {
      try {
        const importLibrary = await loadGoogleMaps();
        const lib = await importLibrary("maps3d");
        if (cancelled || !host.current) return;
        const Map3DElement = lib.Map3DElement as Ctor;
        const Polygon3DElement = lib.Polygon3DElement as Ctor;
        const AltitudeMode = lib.AltitudeMode as Record<string, string> | undefined;
        const map = new Map3DElement({
          center: { lat: target.lat, lng: target.lon, altitude: 0 },
          range: 900,
          tilt: 62,
          heading: 20,
          mode: "HYBRID",
        });
        map.style.width = "100%";
        map.style.height = "100%";
        const ring = outerRing(target.geometry);
        if (ring && Polygon3DElement) {
          const poly = new Polygon3DElement({
            strokeColor: target.color ?? "#16a34a",
            strokeWidth: 4,
            fillColor: `${target.color ?? "#16a34a"}40`,
            altitudeMode: AltitudeMode?.CLAMP_TO_GROUND ?? "CLAMP_TO_GROUND",
            drawsOccludedSegments: true,
          });
          poly.outerCoordinates = ring;
          map.append(poly);
        }
        host.current.replaceChildren(map);
        el = map;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; el?.remove(); };
  }, [target]);

  if (error === "missing-key") {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">Google 3D isn&apos;t switched on yet</p>
        <p className="mt-1 text-muted-foreground">
          An admin needs to add a Google Maps browser key (Maps JavaScript API + Map Tiles API) as
          <code className="mx-1 rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>. Steps are in docs/SITE_FEASIBILITY.md.
        </p>
        <a href={googleEarthUrl(target.lat, target.lon)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted">
          <Earth className="size-4" /> Open in Google Earth instead
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div ref={host} className="h-[65dvh] min-h-[360px] w-full overflow-hidden rounded-lg bg-muted" aria-label="Google 3D view" />
      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load Google 3D: {error}. Check that the key allows this site and has the Map Tiles API enabled.
          <a href={googleEarthUrl(target.lat, target.lon)} target="_blank" rel="noreferrer" className="ml-1 underline">Open in Google Earth</a>
        </p>
      )}
    </div>
  );
}
