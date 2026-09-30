import { requireMember } from "@/lib/auth";
import { SiteMapLoader } from "@/components/map/site-map-loader";

export const metadata = { title: "Map" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  await requireMember();
  const { property } = await searchParams;
  const focusId = property && /^[0-9a-f-]{36}$/i.test(property) ? property : undefined;
  return <SiteMapLoader focusId={focusId} />;
}
