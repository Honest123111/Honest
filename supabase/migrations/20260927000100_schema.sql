-- =============================================================================
-- HT Land Acquisitions — core schema
-- Extensions, enums, lookup tables, business tables, reference (GIS) tables.
-- Functions/triggers live in 20260927000200_logic.sql, RLS in ..._300_rls.sql.
-- =============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;    -- helper functions, never exposed via the API
create schema if not exists reference;  -- read-only GIS reference layers
create schema if not exists reporting;  -- read-only views for Looker Studio (Phase 5)

-- -----------------------------------------------------------------------------
-- Enums (fixed vocabularies). Things the admin edits in Settings are lookup
-- tables instead: lead_statuses, strategies, strategy_rules, tags, templates.
-- -----------------------------------------------------------------------------
create type public.app_role            as enum ('admin', 'acquisitions', 'analyst', 'viewer');
create type public.county_name         as enum ('riverside', 'san_bernardino', 'los_angeles', 'imperial', 'kern', 'other');
create type public.source_list         as enum ('off_market_list', 'tax_default', 'delinquent_list', 'assessment_roll', 'google_sheet', 'manual', 'other');
create type public.location_method     as enum ('gis_polygon', 'plss_estimate', 'mapbook_avg', 'geocode');
create type public.corridor_zone       as enum ('i10_corridor', 'i10_near', 'other');
create type public.dead_reason         as enum ('not_selling', 'price', 'title_issue', 'access', 'zoning', 'sold_at_auction', 'other');
create type public.auction_status      as enum ('none', 'scheduled', 'sold', 'redeemed', 'withdrawn');
create type public.owner_type          as enum ('individual', 'entity', 'trust', 'estate', 'government', 'unknown');
create type public.owner_role          as enum ('owner', 'trustee', 'officer', 'agent');
create type public.contact_source      as enum ('county', 'sos', 'apollo', 'inbound_call', 'manual', 'vendor', 'n8n');
create type public.phone_type          as enum ('mobile', 'landline', 'voip', 'unknown');
create type public.note_visibility     as enum ('team', 'private');
create type public.activity_type       as enum ('note', 'call', 'sms', 'email', 'mail_sent', 'site_visit', 'offer',
                                                'status_change', 'enrichment', 'import', 'document', 'task');
create type public.activity_direction  as enum ('inbound', 'outbound', 'internal');
create type public.match_status        as enum ('matched', 'unmatched', 'triaged', 'ignored');
create type public.task_category       as enum ('parcel_check', 'sce', 'traffic', 'deal', 'lead', 'gis_api', 'legal', 'outreach', 'other');
create type public.task_status         as enum ('not_started', 'in_progress', 'waiting', 'done', 'blocked');
create type public.doc_type            as enum ('deed', 'title_report', 'zoning_letter', 'sce_capacity_report', 'survey',
                                                'photo', 'offer', 'loi', 'contract', 'other');
create type public.dd_status           as enum ('not_started', 'in_progress', 'done', 'issue', 'not_applicable');
create type public.offer_status        as enum ('draft', 'sent', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn');
create type public.enrichment_provider as enum ('sos', 'apollo', 'skip_trace', 'regrid', 'gis', 'caltrans', 'scag',
                                                'n8n', 'mail_vendor', 'twilio', 'llm');
create type public.enrichment_status   as enum ('requested', 'approved', 'running', 'done', 'failed', 'rejected');
create type public.reveal_type         as enum ('none', 'email', 'phone');
create type public.import_source_type  as enum ('tax_default_inventory', 'i10_leads_workbook', 'off_market_list', 'sold_comps',
                                                'delinquent_list', 'assessment_roll', 'sales_db', 'property_characteristics',
                                                'google_sheet_leads', 'google_sheet_tasks', 'generic');
create type public.import_status       as enum ('uploaded', 'mapped', 'previewed', 'committing', 'committed', 'failed', 'cancelled');
create type public.import_row_action   as enum ('create', 'update', 'unchanged', 'conflict', 'error', 'skip');
create type public.campaign_status     as enum ('draft', 'scheduled', 'sending', 'sent', 'closed');
create type public.mail_piece_status   as enum ('queued', 'sent', 'delivered', 'returned', 'cancelled');
create type public.mail_format         as enum ('letter', 'postcard');

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null unique,
  full_name       text,
  avatar_url      text,
  role            public.app_role not null default 'viewer',
  is_active       boolean not null default false,       -- off-domain sign-ups wait for admin activation
  notify_email    boolean not null default true,        -- email me on @mention / task due / approvals
  phone           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Settings & editable lookups
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                         boolean primary key default true check (id),   -- singleton row
  overall_monthly_budget_usd numeric(10,2) not null default 500,
  red_flag_monthly_spend_usd numeric(10,2) not null default 500,
  red_flag_tokens_per_tx     integer       not null default 5000,
  red_flag_mom_growth_pct    numeric(5,2)  not null default 50,
  stale_lead_days            integer       not null default 14,
  auction_alert_days         integer       not null default 60,
  allowed_email_domain       text          not null default 'honesttransportation.com',
  bootstrap_admin_emails     text[]        not null default '{}',   -- promoted to admin on first sign-in
  scoring_weights            jsonb         not null default '{}'::jsonb,   -- EV score weights (§7)
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid references public.profiles (id) on delete set null
);

create table public.lead_statuses (
  key                   text primary key check (key ~ '^[a-z0-9_]+$'),
  label                 text not null,
  sort_order            integer not null,
  color                 text,
  is_terminal           boolean not null default false,
  is_won                boolean not null default false,
  requires_offer        boolean not null default false,   -- "Offer made" needs an offers row
  requires_contract_doc boolean not null default false,   -- "Under contract" needs a contract document
  requires_reason       boolean not null default false,   -- "Dead" needs dead_reason
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.profiles (id) on delete set null
);

create table public.strategies (
  key         text primary key check (key ~ '^[a-z0-9_]+$'),
  label       text not null,
  description text,
  color       text,
  sort_order  integer not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

-- Ordered rules; first match wins. conditions = [{"field":"years_in_default","op":">=","value":5}, ...] (AND).
-- Evaluated by the shared TypeScript classifier (lib/rules), which is unit-tested.
create table public.strategy_rules (
  id           uuid primary key default gen_random_uuid(),
  sort_order   integer not null,
  name         text not null,
  strategy_key text not null references public.strategies (key) on update cascade,
  conditions   jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null
);

create table public.tags (
  name       text primary key,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create table public.dd_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create unique index dd_templates_one_default on public.dd_templates (is_default) where is_default;

create table public.dd_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.dd_templates (id) on delete cascade,
  sort_order  integer not null,
  label       text not null,
  help_text   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

create table public.mail_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  format       public.mail_format not null default 'letter',
  body         text not null,               -- markdown/HTML with {{merge_fields}}
  merge_fields text[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null
);

-- One row per integration. API keys live in Supabase Vault (encrypted at rest);
-- this table only holds the vault secret id, never the key.
create table public.provider_settings (
  provider            public.enrichment_provider primary key,
  enabled             boolean not null default false,
  is_paid             boolean not null default false,
  monthly_budget_usd  numeric(10,2),                   -- null = no provider cap (overall cap still applies)
  unit_cost_usd       numeric(10,4),                   -- used for estimates
  config              jsonb not null default '{}'::jsonb,   -- non-secret config (base URL, webhook ids…)
  vault_secret_id     uuid,                            -- vault.secrets.id
  key_last4           text,                            -- for the masked display
  last_tested_at      timestamptz,
  last_test_ok        boolean,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Properties
-- -----------------------------------------------------------------------------
create table public.properties (
  id                          uuid primary key default gen_random_uuid(),
  -- identity: apn is digits only; display format depends on county (see private.format_apn)
  county                      public.county_name not null default 'riverside',
  apn                         text not null check (apn ~ '^[0-9]{9,14}$'),
  -- location
  situs_address               text,
  situs_city                  text,
  zip                         text,
  legal_description           text,
  plss_section                text,
  plss_township               text,
  plss_range                  text,
  tax_rate_area               text,
  map_book                    text,
  thomas_bros_page            text,
  thomas_bros_grid            text,
  -- size & use
  acres                       numeric(12,4) check (acres >= 0),
  zoning                      text,                 -- as listed
  zoning_hint                 text,                 -- SCAG spatial join, unverified
  zoning_verified             boolean not null default false,
  zoning_verified_value       text,
  zoning_verified_source      text,
  zoning_verified_at          date,
  land_use                    text,
  property_description        text,
  -- values
  land_value                  numeric(14,2),
  structure_value             numeric(14,2),
  asking_price                numeric(14,2),
  mortgages_note              text,
  -- source
  source_list                 public.source_list not null default 'manual',
  source_year                 smallint,
  -- geometry (EPSG:4326)
  geom                        extensions.geometry(MultiPolygon, 4326),
  centroid                    extensions.geometry(Point, 4326),
  -- distance
  distance_to_i10_mi          numeric(8,3),
  nearest_interchange_id      uuid,                 -- FK added after reference.interchanges exists
  nearest_interchange         text,
  distance_to_interchange_mi  numeric(8,3),
  location_method             public.location_method,
  -- classification
  corridor_zone               public.corridor_zone not null default 'other',
  strategy                    text references public.strategies (key) on update cascade,
  strategy_locked             boolean not null default false,   -- manual override; rules won't reclassify
  tags                        text[] not null default '{}',
  why_this_property           text,
  -- pipeline
  lead_status                 text not null default 'new' references public.lead_statuses (key) on update cascade,
  status_changed_at           timestamptz not null default now(),
  dead_reason                 public.dead_reason,
  dead_reason_note            text,
  assignee_id                 uuid references public.profiles (id) on delete set null,
  priority                    smallint check (priority between 1 and 5),
  -- scores (0–10)
  ev_score                    numeric(4,1) check (ev_score between 0 and 10),
  big_rig_access_score        numeric(4,1) check (big_rig_access_score between 0 and 10),
  alt_use_score               numeric(4,1) check (alt_use_score between 0 and 10),
  overall_score               numeric(4,1) check (overall_score between 0 and 10),
  -- flags
  is_vacant                   boolean,
  is_absentee                 boolean,
  is_entity_owner             boolean,
  dnc_flag                    boolean not null default false,
  -- bookkeeping
  last_activity_at            timestamptz,
  field_sources               jsonb not null default '{}'::jsonb,  -- {field: {src, at, by, import_id}} for import conflict checks
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint properties_county_apn_key unique (county, apn)
);

create index properties_geom_gix        on public.properties using gist (geom);
create index properties_centroid_gix    on public.properties using gist (centroid);
create index properties_tags_gin        on public.properties using gin (tags);
create index properties_status_idx      on public.properties (lead_status);
create index properties_strategy_idx    on public.properties (strategy);
create index properties_zone_idx        on public.properties (corridor_zone, distance_to_i10_mi);
create index properties_assignee_idx    on public.properties (assignee_id);
create index properties_last_act_idx    on public.properties (last_activity_at);
create index properties_apn_trgm        on public.properties using gin (apn extensions.gin_trgm_ops);
create index properties_situs_trgm     on public.properties using gin (situs_address extensions.gin_trgm_ops);

-- Tax status history: one row per snapshot per source.
create table public.tax_status (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties (id) on delete cascade,
  snapshot_date       date not null,
  source              text not null,               -- 'ttc_pts_inventory_2025', 'delinquent_list', …
  power_to_sell_date  date,
  years_in_default    numeric(5,2),
  advalorem           numeric(14,2),
  specials            numeric(14,2),
  redemption_amount   numeric(14,2),
  owed_to_land_ratio  numeric(10,4),
  auction_status      public.auction_status not null default 'none',
  auction_date        date,
  auction_url         text,
  import_id           uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (property_id, snapshot_date, source)
);
create index tax_status_property_idx on public.tax_status (property_id, snapshot_date desc);
create index tax_status_auction_idx  on public.tax_status (auction_date) where auction_date is not null;

-- -----------------------------------------------------------------------------
-- Owners & contacts
-- -----------------------------------------------------------------------------
create table public.owners (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  name_normalized   text generated always as (lower(regexp_replace(name, '[^A-Za-z0-9]+', ' ', 'g'))) stored,
  owner_type        public.owner_type not null default 'unknown',
  mailing_address   text,
  mailing_city      text,
  mailing_state     text,
  mailing_zip       text,
  sos_entity_number text,
  sos_status        text,
  sos_details       jsonb,                 -- officers, agent, filing dates from the SOS API
  source            text,
  merged_into_id    uuid references public.owners (id) on delete set null,   -- merge-duplicates tool
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null
);
create index owners_name_trgm on public.owners using gin (name_normalized extensions.gin_trgm_ops);
create index owners_sos_idx   on public.owners (sos_entity_number) where sos_entity_number is not null;

create table public.property_owners (
  property_id   uuid not null references public.properties (id) on delete cascade,
  owner_id      uuid not null references public.owners (id) on delete cascade,
  role          public.owner_role not null default 'owner',
  ownership_pct numeric(6,3) check (ownership_pct between 0 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (property_id, owner_id, role)
);
create index property_owners_owner_idx on public.property_owners (owner_id);

create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references public.owners (id) on delete cascade,
  name             text,
  title            text,
  phone            text,
  phone_e164       text generated always as (
                     case when phone is null then null
                          when length(regexp_replace(phone, '\D', '', 'g')) = 10 then '+1' || regexp_replace(phone, '\D', '', 'g')
                          else '+' || regexp_replace(phone, '\D', '', 'g') end) stored,
  phone_type       public.phone_type,
  email            text,
  source           public.contact_source not null default 'manual',
  consent          boolean not null default false,
  consent_at       timestamptz,
  consent_method   text,                         -- 'inbound_call', 'written', 'web_form', …
  dnc_checked_at   timestamptz,
  dnc_hit          boolean,
  verified         boolean not null default false,
  do_not_contact   boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null
);
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_phone_idx on public.contacts (phone_e164);
create index contacts_email_idx on public.contacts (lower(email));

-- Global do-not-contact list (phone or email), checked before any outbound send.
create table public.do_not_contact (
  id         uuid primary key default gen_random_uuid(),
  phone_e164 text,
  email      text,
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  check (phone_e164 is not null or email is not null)
);
create unique index dnc_phone_key on public.do_not_contact (phone_e164) where phone_e164 is not null;
create unique index dnc_email_key on public.do_not_contact (lower(email)) where email is not null;

-- -----------------------------------------------------------------------------
-- Collaboration: notes, documents, tasks, activities, notifications
-- -----------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  parent_id   uuid references public.notes (id) on delete cascade,
  body        text not null,                      -- markdown
  mentions    uuid[] not null default '{}',       -- profile ids
  pinned      boolean not null default false,
  visibility  public.note_visibility not null default 'team',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete set null
);
create index notes_property_idx on public.notes (property_id, created_at desc);

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  note_id     uuid references public.notes (id) on delete set null,     -- note attachment
  file_path   text not null unique,              -- storage: property-files/{property_id}/{uuid}-{name}
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  doc_type    public.doc_type not null default 'other',
  description text,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);
create index documents_property_idx on public.documents (property_id, doc_type);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references public.properties (id) on delete cascade,   -- null = general task
  title        text not null,
  description  text,
  category     public.task_category not null default 'other',
  priority     smallint not null default 3 check (priority between 1 and 5),
  status       public.task_status not null default 'not_started',
  assignee_id  uuid references public.profiles (id) on delete set null,
  due_date     date,
  completed_at timestamptz,
  sort_order   double precision,                 -- board ordering
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);
create index tasks_assignee_due_idx on public.tasks (assignee_id, status, due_date);
create index tasks_property_idx     on public.tasks (property_id);

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  amount        numeric(14,2) not null check (amount >= 0),
  terms         text,
  status        public.offer_status not null default 'draft',
  sent_date     date,
  response_date date,
  response      text,
  expires_on    date,
  document_id   uuid references public.documents (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null
);
create index offers_property_idx on public.offers (property_id, created_at desc);

create table public.due_diligence_items (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  template_item_id uuid references public.dd_template_items (id) on delete set null,
  sort_order       integer not null default 0,
  label            text not null,
  status           public.dd_status not null default 'not_started',
  owner_id         uuid references public.profiles (id) on delete set null,    -- who's on it
  due_date         date,
  completed_at     date,
  notes            text,
  document_id      uuid references public.documents (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (property_id, template_item_id)
);

create table public.site_metrics (
  property_id              uuid primary key references public.properties (id) on delete cascade,
  truck_aadt               integer,
  total_aadt               integer,
  aadt_source              text,
  aadt_year                smallint,
  aadt_point_id            uuid,
  utility_provider         text,
  substation               text,
  circuit                  text,
  sce_capacity_notes       text,
  utilities_on_site        boolean,
  dirt_road_only           boolean,
  pca_ordered              boolean not null default false,
  pca_ordered_at           date,
  pca_cost                 numeric(10,2),
  pca_result               text,
  pca_result_document_id   uuid references public.documents (id) on delete set null,
  -- Big-Rig Access components (§6): interchange 0–3, route 0–3, both-direction 0–2, pull-through 0–2
  br_interchange           numeric(3,1) check (br_interchange between 0 and 3),
  br_route_quality         numeric(3,1) check (br_route_quality between 0 and 3),
  br_both_directions       numeric(3,1) check (br_both_directions between 0 and 2),
  br_pull_through          numeric(3,1) check (br_pull_through between 0 and 2),
  br_notes                 jsonb not null default '{}'::jsonb,   -- {component: note}
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid default auth.uid() references public.profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Outreach
-- -----------------------------------------------------------------------------
create table public.mail_campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  template_id     uuid references public.mail_templates (id) on delete set null,
  saved_view_id   uuid,
  tracking_phone  text,
  vendor          text,                       -- 'lob' | 'click2mail' | 'manual_csv'
  status          public.campaign_status not null default 'draft',
  sent_date       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null
);

create table public.mail_pieces (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.mail_campaigns (id) on delete cascade,
  property_id      uuid not null references public.properties (id) on delete cascade,
  owner_id         uuid references public.owners (id) on delete set null,
  address_snapshot jsonb not null default '{}'::jsonb,   -- mailing address as sent
  template_id      uuid references public.mail_templates (id) on delete set null,
  tracking_phone   text,
  vendor           text,
  vendor_ref       text,
  status           public.mail_piece_status not null default 'queued',
  sent_date        date,
  cost             numeric(10,2),
  responded        boolean not null default false,
  responded_at     timestamptz,
  response         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (campaign_id, property_id, owner_id)
);
create index mail_pieces_property_idx on public.mail_pieces (property_id);

create table public.tracking_numbers (
  id          uuid primary key default gen_random_uuid(),
  phone_e164  text not null unique,
  twilio_sid  text unique,
  campaign_id uuid references public.mail_campaigns (id) on delete set null,
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Enrichment & cost control
-- -----------------------------------------------------------------------------
create table public.enrichment_requests (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid references public.properties (id) on delete set null,
  owner_id          uuid references public.owners (id) on delete set null,
  provider          public.enrichment_provider not null,
  reveal            public.reveal_type not null default 'none',
  params            jsonb not null default '{}'::jsonb,
  status            public.enrichment_status not null default 'requested',
  estimated_cost    numeric(10,4) not null default 0,
  estimated_credits integer,
  actual_cost       numeric(10,4),
  credits_used      integer,
  requested_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  approved_by       uuid references public.profiles (id) on delete set null,
  decided_at        timestamptz,
  rejection_reason  text,
  started_at        timestamptz,
  finished_at       timestamptz,
  result            jsonb,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  check (property_id is not null or owner_id is not null)
);
create index enrichment_status_idx on public.enrichment_requests (status, provider);

create table public.api_cost_ledger (
  id          bigint generated always as identity primary key,
  provider    public.enrichment_provider not null,
  occurred_at timestamptz not null default now(),
  units       numeric(12,4) not null default 1,
  tokens      integer,                                  -- LLM calls only
  cost_usd    numeric(10,4) not null default 0,
  request_id  uuid references public.enrichment_requests (id) on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);
create index ledger_provider_time_idx on public.api_cost_ledger (provider, occurred_at);

-- -----------------------------------------------------------------------------
-- Imports
-- -----------------------------------------------------------------------------
create table public.imports (
  id              uuid primary key default gen_random_uuid(),
  file_name       text not null,
  file_path       text,                        -- storage: imports/{id}/{file}
  sheet_name      text,
  header_row      integer not null default 1,
  source_type     public.import_source_type not null default 'generic',
  county          public.county_name,
  status          public.import_status not null default 'uploaded',
  row_count       integer not null default 0,
  matched         integer not null default 0,
  created         integer not null default 0,
  updated         integer not null default 0,
  conflicts       integer not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  column_mapping  jsonb not null default '{}'::jsonb,
  imported_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  committed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Staged rows: the preview (matched / new / conflict) and the per-row commit result.
create table public.import_rows (
  id                 bigint generated always as identity primary key,
  import_id          uuid not null references public.imports (id) on delete cascade,
  row_number         integer not null,
  apn                text,
  property_id        uuid references public.properties (id) on delete set null,
  action             public.import_row_action,
  raw                jsonb not null,                  -- original row
  mapped             jsonb,                           -- after column mapping + normalization
  conflicts          jsonb,                           -- {field: {current, incoming, current_src}}
  conflict_resolution jsonb,                          -- {field: 'keep' | 'overwrite'}
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (import_id, row_number)
);
create index import_rows_apn_idx on public.import_rows (import_id, apn);

-- Comparable sales (Sales DB, sold history from the off-market workbook).
create table public.sales_comps (
  id           uuid primary key default gen_random_uuid(),
  county       public.county_name not null,
  apn          text,
  sale_date    date,
  sale_price   numeric(14,2),
  acres        numeric(12,4),
  situs_city   text,
  zoning       text,
  source       text,
  centroid     extensions.geometry(Point, 4326),
  import_id    uuid references public.imports (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);
create index sales_comps_centroid_gix on public.sales_comps using gist (centroid);

-- -----------------------------------------------------------------------------
-- UI state, activity, notifications, audit
-- -----------------------------------------------------------------------------
create table public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  page       text not null default 'properties' check (page in ('properties', 'map', 'pipeline', 'tasks', 'owners')),
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  columns    jsonb not null default '[]'::jsonb,
  sort       jsonb not null default '[]'::jsonb,
  shared     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

alter table public.mail_campaigns
  add constraint mail_campaigns_saved_view_fk foreign key (saved_view_id) references public.saved_views (id) on delete set null;

create table public.activities (
  id                     uuid primary key default gen_random_uuid(),
  type                   public.activity_type not null,
  property_id            uuid references public.properties (id) on delete cascade,  -- null = unmatched inbound
  owner_id               uuid references public.owners (id) on delete set null,
  contact_id             uuid references public.contacts (id) on delete set null,
  direction              public.activity_direction not null default 'internal',
  outcome                text,
  duration_sec           integer,
  summary                text,
  payload                jsonb not null default '{}'::jsonb,
  occurred_at            timestamptz not null default now(),
  follow_up_date         date,
  -- links to the source record
  note_id                uuid references public.notes (id) on delete cascade,
  document_id            uuid references public.documents (id) on delete cascade,
  task_id                uuid references public.tasks (id) on delete set null,
  offer_id               uuid references public.offers (id) on delete set null,
  mail_piece_id          uuid references public.mail_pieces (id) on delete set null,
  enrichment_request_id  uuid references public.enrichment_requests (id) on delete set null,
  import_id              uuid references public.imports (id) on delete set null,
  -- Twilio inbound
  from_number            text,
  to_number              text,
  external_id            text unique,           -- Twilio CallSid / MessageSid
  match_status           public.match_status not null default 'matched',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references public.profiles (id) on delete set null
);
create index activities_property_idx on public.activities (property_id, occurred_at desc);
create index activities_unmatched_idx on public.activities (match_status) where match_status = 'unmatched';

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,                  -- 'mention' | 'task_due' | 'approval_needed' | 'assigned' | 'budget'
  title       text not null,
  body        text,
  link        text,
  property_id uuid references public.properties (id) on delete cascade,
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.audit_log (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  row_id         text not null,
  property_id    uuid,                          -- denormalized for the property History tab
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[],
  old            jsonb,
  new            jsonb,
  user_id        uuid,
  change_source  text not null default 'user',  -- user | import | n8n | system | edge
  at             timestamptz not null default now()
);
create index audit_row_idx      on public.audit_log (table_name, row_id, at desc);
create index audit_property_idx on public.audit_log (property_id, at desc);

-- -----------------------------------------------------------------------------
-- Reference GIS layers
-- -----------------------------------------------------------------------------
create table reference.i10_centerline (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'I-10',
  source     text not null,                         -- 'caltrans_shn' | 'osm'
  geom       extensions.geometry(MultiLineString, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index i10_centerline_gix on reference.i10_centerline using gist (geom);

create table reference.interchanges (
  id          uuid primary key default gen_random_uuid(),
  route       text not null default 'I-10',
  exit_number text,
  name        text not null,
  county      public.county_name,
  geom        extensions.geometry(Point, 4326) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);
create index interchanges_gix on reference.interchanges using gist (geom);

create table reference.truck_aadt_points (
  id          uuid primary key default gen_random_uuid(),
  route       text not null,
  postmile    text,
  description text,
  truck_aadt  integer,
  total_aadt  integer,
  year        smallint,
  source      text not null default 'caltrans',
  geom        extensions.geometry(Point, 4326) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);
create index truck_aadt_gix on reference.truck_aadt_points using gist (geom);

alter table public.properties
  add constraint properties_nearest_interchange_fk
  foreign key (nearest_interchange_id) references reference.interchanges (id) on delete set null;
alter table public.site_metrics
  add constraint site_metrics_aadt_point_fk
  foreign key (aadt_point_id) references reference.truck_aadt_points (id) on delete set null;
