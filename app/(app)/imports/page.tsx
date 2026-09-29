import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireMember } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { UploadImport } from "@/components/imports/upload-import";
import { FORMATS, type SourceType } from "@/lib/imports/fields";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Imports" };

export default async function ImportsPage() {
  const { supabase, profile } = await requireMember();
  if (!can.write(profile.role)) redirect("/");
  const { data: imports } = await supabase.from("imports").select("*").order("created_at", { ascending: false }).limit(100);
  const { data: team } = await supabase.from("profiles").select("id, full_name, email");
  const who = (id: string | null) => team?.find((t) => t.id === id)?.full_name ?? team?.find((t) => t.id === id)?.email ?? "—";

  return (
    <>
      <PageHeader title="Imports" description="County CSV/XLSX lists and your spreadsheets. Matched on county + APN — never duplicated." />
      <UploadImport />
      <h2 className="mb-2 mt-6 text-sm font-semibold">History</h2>
      {!imports?.length ? (
        <EmptyState title="No imports yet" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">File</th><th className="px-3 font-medium">Format</th><th className="px-3 font-medium">Status</th><th className="px-3 text-right font-medium">Rows</th><th className="px-3 text-right font-medium">New</th><th className="px-3 text-right font-medium">Matched</th><th className="px-3 text-right font-medium">Conflicts</th><th className="px-3 text-right font-medium">Errors</th><th className="px-3 font-medium">By</th><th className="px-3 font-medium">When</th></tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2"><Link href={`/imports/${i.id}`} className="font-medium text-primary hover:underline">{i.file_name}</Link></td>
                  <td className="px-3 text-xs">{FORMATS[i.source_type as SourceType]?.label ?? i.source_type}</td>
                  <td className="px-3"><Badge variant={i.status === "committed" ? "default" : i.status === "failed" || i.status === "cancelled" ? "destructive" : "secondary"}>{i.status}</Badge></td>
                  <td className="px-3 text-right tabular-nums">{i.row_count.toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{i.created.toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{i.matched.toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{i.conflicts.toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{Array.isArray(i.errors) ? i.errors.length : 0}</td>
                  <td className="px-3 text-xs">{who(i.imported_by)}</td>
                  <td className="px-3 text-xs text-muted-foreground">{fmtDateTime(i.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
