import type { Database } from "@/lib/database.types";

type T = Database["public"]["Tables"];
export type Property = T["properties"]["Row"] & { site_metrics: T["site_metrics"]["Row"] | null };
export type Owner = T["owners"]["Row"] & { contacts: T["contacts"]["Row"][] };
export type OwnerLink = { role: T["property_owners"]["Row"]["role"]; ownership_pct: number | null; owners: Owner | null };
export type Note = T["notes"]["Row"] & { documents: Pick<T["documents"]["Row"], "id" | "file_name" | "file_path" | "mime_type">[] };
export type Activity = T["activities"]["Row"];
export type Task = T["tasks"]["Row"];
export type Doc = T["documents"]["Row"];
export type Offer = T["offers"]["Row"];
export type Tax = T["tax_status"]["Row"];
export type Audit = T["audit_log"]["Row"];
export type PropertyUpdate = T["properties"]["Update"];
