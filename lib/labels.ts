import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export const COUNTY_LABELS: Record<Enums["county_name"], string> = {
  riverside: "Riverside",
  san_bernardino: "San Bernardino",
  los_angeles: "Los Angeles",
  imperial: "Imperial",
  kern: "Kern",
  other: "Other",
};

export const ZONE_LABELS: Record<Enums["corridor_zone"], string> = {
  i10_corridor: "I-10 Corridor (≤2 mi)",
  i10_near: "I-10 Near (2–5 mi)",
  other: "Other",
};

export const ZONE_SHORT: Record<Enums["corridor_zone"], string> = {
  i10_corridor: "Corridor",
  i10_near: "Near",
  other: "Other",
};

export const LOCATION_METHOD_LABELS: Record<Enums["location_method"], string> = {
  gis_polygon: "GIS polygon",
  plss_estimate: "PLSS estimate (±1 mi)",
  mapbook_avg: "Map-book average",
  geocode: "Geocoded address",
};

export const DEAD_REASON_LABELS: Record<Enums["dead_reason"], string> = {
  not_selling: "Not selling",
  price: "Price",
  title_issue: "Title issue",
  access: "Access",
  zoning: "Zoning",
  sold_at_auction: "Sold at auction",
  other: "Other",
};

export const OWNER_TYPE_LABELS: Record<Enums["owner_type"], string> = {
  individual: "Individual",
  entity: "Entity",
  trust: "Trust",
  estate: "Estate",
  government: "Government",
  unknown: "Unknown",
};

export const TASK_CATEGORY_LABELS: Record<Enums["task_category"], string> = {
  parcel_check: "Parcel check",
  sce: "SCE",
  traffic: "Traffic",
  deal: "Deal",
  lead: "Lead",
  gis_api: "GIS / API",
  legal: "Legal",
  outreach: "Outreach",
  other: "Other",
};

export const TASK_STATUS_LABELS: Record<Enums["task_status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  blocked: "Blocked",
};

export const PRIORITY_LABELS: Record<number, string> = { 1: "P1 · High", 2: "P2", 3: "P3 · Medium", 4: "P4", 5: "P5 · Low" };

export const DOC_TYPE_LABELS: Record<Enums["doc_type"], string> = {
  deed: "Deed",
  title_report: "Title report",
  zoning_letter: "Zoning letter",
  sce_capacity_report: "SCE capacity report",
  survey: "Survey",
  photo: "Photo",
  offer: "Offer",
  loi: "LOI",
  contract: "Contract",
  other: "Other",
};

export const ACTIVITY_LABELS: Record<Enums["activity_type"], string> = {
  note: "Note",
  call: "Call",
  sms: "SMS",
  email: "Email",
  mail_sent: "Mail",
  site_visit: "Site visit",
  offer: "Offer",
  status_change: "Status",
  enrichment: "Enrichment",
  import: "Import",
  document: "Document",
  task: "Task",
};

export const ROLE_LABELS: Record<Enums["app_role"], string> = {
  admin: "Admin",
  acquisitions: "Acquisitions",
  analyst: "Analyst",
  viewer: "Viewer",
};

export const SOURCE_LIST_LABELS: Record<Enums["source_list"], string> = {
  off_market_list: "Off-market list",
  tax_default: "Tax default",
  delinquent_list: "Delinquent list",
  assessment_roll: "Assessment roll",
  google_sheet: "Google Sheet",
  manual: "Manual",
  other: "Other",
};
