-- =============================================================================
-- Default settings/lookups (editable later in Settings). Not business data —
-- properties, owners and tasks come from the seed/import scripts.
-- =============================================================================

insert into public.app_settings (id, scoring_weights) values (true, '{
  "ev": {
    "interchange_distance": 3.0,
    "truck_aadt": 2.0,
    "zoning": 1.5,
    "utilities": 1.5,
    "acreage": 1.0,
    "access_quality": 1.0,
    "dirt_road_penalty": -2.0,
    "acreage_min_pull_through": 1.5
  }
}'::jsonb);

insert into public.lead_statuses (key, label, sort_order, color, is_terminal, is_won, requires_offer, requires_contract_doc, requires_reason) values
  ('new',               'New',               10, '#64748b', false, false, false, false, false),
  ('researching',       'Researching',       20, '#0ea5e9', false, false, false, false, false),
  ('owner_found',       'Owner found',       30, '#6366f1', false, false, false, false, false),
  ('contact_attempted', 'Contact attempted', 40, '#a855f7', false, false, false, false, false),
  ('in_conversation',   'In conversation',   50, '#f59e0b', false, false, false, false, false),
  ('offer_made',        'Offer made',        60, '#f97316', false, false, true,  false, false),
  ('under_contract',    'Under contract',    70, '#14b8a6', false, false, false, true,  false),
  ('closed_won',        'Closed (won)',      80, '#22c55e', true,  true,  false, false, false),
  ('dead',              'Dead',              90, '#ef4444', true,  false, false, false, true);

insert into public.strategies (key, label, description, sort_order, color) values
  ('ev_candidate',        'EV Candidate',                'Semi-truck EV charging site along I-10',                10, '#16a34a'),
  ('auction_watch',       'Auction watch',               'County can sell; check sold / redeemed / upcoming',      20, '#dc2626'),
  ('large_vacant',        'Large vacant acreage',        'Solar lease, land banking, truck parking / EV',          30, '#ca8a04'),
  ('improved',            'Improved property',           'Wholesale, flip, rental',                                40, '#2563eb'),
  ('low_value_lot',       'Low-value lot',               'Bulk buy or sell to neighbor; check access',             50, '#78716c'),
  ('vacant_lot_motivated','Vacant lot, motivated owner', 'Cash offer near land value + taxes owed',                60, '#9333ea');

insert into public.strategy_rules (sort_order, name, strategy_key, conditions) values
  (10, 'Years in default ≥ 5',   'auction_watch',
       '[{"field":"years_in_default","op":">=","value":5}]'),
  (20, 'Vacant and ≥ 5 acres',   'large_vacant',
       '[{"field":"is_vacant","op":"=","value":true},{"field":"acres","op":">=","value":5}]'),
  (30, 'Has structure value',    'improved',
       '[{"field":"structure_value","op":">","value":0}]'),
  (40, 'Land value < $5,000',    'low_value_lot',
       '[{"field":"land_value","op":"<","value":5000}]'),
  (50, 'Otherwise',              'vacant_lot_motivated', '[]');

insert into public.tags (name, color) values
  ('EV Candidate', '#16a34a'), ('Portfolio seller', '#0ea5e9'), ('Fronts I-10', '#f59e0b'), ('Co-owned', '#a855f7');

with t as (
  insert into public.dd_templates (name, is_default) values ('Standard land deal', true) returning id
)
insert into public.dd_template_items (template_id, sort_order, label)
select t.id, x.ord * 10, x.label
from t, unnest(array[
  'Zoning verification letter',
  'Legal / recorded access',
  'Title report',
  'Easements',
  'Environmental / flood / FEMA',
  'SCE capacity',
  'Water',
  'Road access for semis (turning radius, pull-through)',
  'Comps',
  'Survey',
  'Entitlement path / rezone needed'
]) with ordinality as x(label, ord);

-- Everything paid is OFF by default with a $0 cap until Kevin sets a budget.
insert into public.provider_settings (provider, enabled, is_paid, monthly_budget_usd, unit_cost_usd, config) values
  ('gis',         true,  false, null, 0, '{"riverside_parcels":"https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer/40"}'),
  ('caltrans',    true,  false, null, 0, '{}'),
  ('scag',        true,  false, null, 0, '{"base":"https://maps.scag.ca.gov/scaggis/rest/services/LDX/"}'),
  ('sos',         false, false, null, 0, '{"base":"https://calicodev.sos.ca.gov"}'),
  ('n8n',         false, false, null, 0, '{"base":"https://honest122.app.n8n.cloud","enrichment_workflow_id":"cJbdjY9bIaRIvkBF"}'),
  ('apollo',      false, true,  0,    null, '{"principals_only":true}'),
  ('skip_trace',  false, true,  0,    null, '{"individuals_only":true}'),
  ('regrid',      false, true,  0,    null, '{}'),
  ('mail_vendor', false, true,  0,    null, '{}'),
  ('twilio',      false, true,  0,    null, '{}'),
  ('llm',         false, true,  0,    null, '{}');
