import Link from "next/link";
import {
  Building2, FileText, FileUp, Handshake, Mail, MapPin, MessageSquare, Phone, RefreshCw, Send, Sparkles, StickyNote, ListTodo,
} from "lucide-react";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { formatApn } from "@/lib/apn";
import { fmtDateTime } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"] & {
  properties?: { apn: string; county: Database["public"]["Enums"]["county_name"]; situs_city: string | null } | null;
};

const ICONS = {
  note: StickyNote, call: Phone, sms: MessageSquare, email: Mail, mail_sent: Send, site_visit: MapPin, offer: Handshake,
  status_change: RefreshCw, enrichment: Sparkles, import: FileUp, document: FileText, task: ListTodo,
} as const;

export function ActivityFeed({ items, showProperty }: { items: Activity[]; showProperty?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="grid gap-2">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? Building2;
        return (
          <li key={a.id} className="flex min-w-0 gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <span className="font-medium">{ACTIVITY_LABELS[a.type]}</span>
                {a.summary && <span className="text-muted-foreground"> · {a.summary}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {showProperty && a.properties && a.property_id && (
                  <Link href={`/properties/${a.property_id}`} className="text-primary">
                    {formatApn(a.properties.county, a.properties.apn)}{a.properties.situs_city ? ` · ${a.properties.situs_city}` : ""}
                  </Link>
                )}
                {showProperty && a.properties ? " · " : ""}
                {fmtDateTime(a.occurred_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
