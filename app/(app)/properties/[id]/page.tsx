import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { formatApn } from "@/lib/apn";
import { PropertyDetail } from "@/components/property/property-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMember();
  const { data } = await supabase.from("properties").select("apn, county, situs_city").eq("id", id).maybeSingle();
  return { title: data ? `${formatApn(data.county, data.apn)}${data.situs_city ? ` · ${data.situs_city}` : ""}` : "Property" };
}

export default async function PropertyPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; compose?: string }>;
}) {
  const { id } = await params;
  const { tab, compose } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireMember();

  const [property, owners, notes, activities, tasks, documents, offers, tax, audit, site, comps] = await Promise.all([
    supabase.from("properties").select("*, site_metrics(*)").eq("id", id).maybeSingle(),
    supabase
      .from("property_owners")
      .select("role, ownership_pct, owners(*, contacts(*))")
      .eq("property_id", id)
      .order("ownership_pct", { ascending: false, nullsFirst: false }),
    supabase.from("notes").select("*, documents(id, file_name, file_path, mime_type)").eq("property_id", id).order("created_at", { ascending: true }),
    supabase.from("activities").select("*").eq("property_id", id).order("occurred_at", { ascending: false }).limit(300),
    supabase.from("tasks").select("*").eq("property_id", id).order("status").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("documents").select("*").eq("property_id", id).order("created_at", { ascending: false }),
    supabase.from("offers").select("*").eq("property_id", id).order("created_at", { ascending: false }),
    supabase.from("tax_status").select("*").eq("property_id", id).order("snapshot_date", { ascending: false }),
    supabase.from("audit_log").select("*").eq("property_id", id).order("at", { ascending: false }).limit(300),
    supabase.from("site_feasibility").select("*").eq("property_id", id).maybeSingle(),
    supabase.rpc("property_nearby_comps", { p_property_id: id, p_radius_mi: 10 }),
  ]);
  if (!property.data) notFound();

  return (
    <PropertyDetail
      property={property.data}
      owners={owners.data ?? []}
      notes={notes.data ?? []}
      activities={activities.data ?? []}
      tasks={tasks.data ?? []}
      documents={documents.data ?? []}
      offers={offers.data ?? []}
      tax={tax.data ?? []}
      audit={audit.data ?? []}
      site={site.data ?? null}
      comps={comps.data ?? []}
      initialTab={tab ?? "overview"}
      compose={compose === "1"}
    />
  );
}
