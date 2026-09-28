"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/utils";
import { displayName, useAppData } from "@/components/layout/app-data";
import type { Audit } from "./types";

const TABLE_LABELS: Record<string, string> = {
  properties: "Property", tax_status: "Tax", property_owners: "Owner link", notes: "Note", documents: "Document",
  tasks: "Task", offers: "Offer", activities: "Activity", site_metrics: "Site", due_diligence_items: "Due diligence",
  mail_pieces: "Mail", enrichment_requests: "Enrichment",
};

const show = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "∅";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "∅";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

export function HistoryTab({ audit }: { audit: Audit[] }) {
  const { team } = useAppData();
  if (!audit.length) return <EmptyState title="No changes recorded yet" />;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 font-medium">Who</th><th className="px-3 font-medium">What</th><th className="px-3 font-medium">Change</th></tr>
        </thead>
        <tbody>
          {audit.map((a) => {
            const old = (a.old ?? {}) as Record<string, unknown>;
            const nu = (a.new ?? {}) as Record<string, unknown>;
            const fields = a.action === "UPDATE" ? (a.changed_fields ?? []) : [];
            return (
              <tr key={a.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(a.at)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {a.user_id ? displayName(team.find((t) => t.id === a.user_id)) : "System"}
                  {a.change_source !== "user" && <Badge variant="secondary" className="ml-1">{a.change_source}</Badge>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {TABLE_LABELS[a.table_name] ?? a.table_name} <span className="text-muted-foreground">{a.action.toLowerCase()}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {a.action === "UPDATE" ? (
                    <ul className="grid gap-0.5">
                      {fields.filter((f) => f !== "field_sources").map((f) => (
                        <li key={f}><span className="font-medium">{f}</span>: <span className="text-muted-foreground line-through">{show(old[f])}</span> → {show(nu[f])}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">
                      {show(nu.title ?? nu.file_name ?? nu.summary ?? nu.body ?? nu.amount ?? old.title ?? old.file_name ?? old.body ?? "")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
