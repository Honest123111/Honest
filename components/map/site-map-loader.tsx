"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

// MapLibre touches `window` on import, so the map only loads in the browser.
export const SiteMapLoader = dynamic(() => import("./site-map").then((m) => m.SiteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[calc(100dvh-3.5rem-8rem)] min-h-[420px] md:h-[calc(100dvh-3.5rem-3rem)]" />,
});
