import { notFound, redirect } from "next/navigation";
import { can, requireMember } from "@/lib/auth";
import { ImportWizard } from "@/components/imports/import-wizard";
import { inspectImport } from "../actions";

export const metadata = { title: "Import" };

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const { id } = await params;
  const { show = "attention" } = await searchParams;
  const { supabase, profile } = await requireMember();
  if (!can.write(profile.role)) redirect("/");
  const { data: imp } = await supabase.from("imports").select("*").eq("id", id).maybeSingle();
  if (!imp) notFound();

  const inspection = imp.status === "uploaded" ? await inspectImport(id).catch((e: Error) => ({ error: e.message })) : null;

  let rowsQuery = supabase
    .from("import_rows")
    .select("id, row_number, apn, action, error, conflicts, conflict_resolution, mapped, property_id, committed_at")
    .eq("import_id", id)
    .order("row_number")
    .limit(300);
  if (show === "attention") rowsQuery = rowsQuery.in("action", ["conflict", "error"]);
  else if (show !== "all") rowsQuery = rowsQuery.eq("action", show as "create");
  const { data: rows } = imp.status === "uploaded" ? { data: [] } : await rowsQuery;

  return <ImportWizard imp={imp} inspection={inspection} rows={rows ?? []} show={show} />;
}
