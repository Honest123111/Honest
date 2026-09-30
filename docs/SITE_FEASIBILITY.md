# Site map & development feasibility

`/map` is the interactive site map. Each property's **Site** tab shows the same facts for one parcel. Everything below is free public data; nothing needs an API key.

## Data sources

| What | Source | How it gets in |
|---|---|---|
| Zoning, general plan, specific plan, fire hazard, fault zone, liquefaction, MSHCP criteria cell, airport influence, water district, farmland | County of Riverside GIS, `OpenData/General/MapServer` (identify at the parcel's interior point) | n8n **Site Feasibility Enrichment** (nightly, 1,000 parcels per run, refreshed every 90 days) |
| Slope + elevation across the parcel | USGS 3DEP ImageServer (`computeStatisticsHistograms`, "Slope Degrees") | same |
| Flood zone | FEMA NFHL (Esri's public copy, `USA_Flood_Hazard_Reduced_Set_gdb`) | same |
| Planning / development cases within 3 mi, last 3 years | County PLUS cases (layer 280, `CASE_MODULE = 'PLAN'`) | same |
| Storm drains | RCFC&WCD `RCFC_Facilities` + `City_Storm_Drains` (ArcGIS Online) → `reference.storm_drains` | n8n **Site Reference Layers** (monthly) |
| Costco / big-box anchors, grocery, restaurants, fuel, commercial & industrial areas | OpenStreetMap (Overpass) → `reference.pois` | same |
| Closed land sales | `public.sales_comps` (imported) | Imports page / a paid provider later |

Map-only layers (live, not stored): USGS imagery/topo basemaps, AWS terrain tiles (3D hills), USGS slope/hillshade/contours, county zoning/GP/fire/faults/liquefaction/MSHCP/planning cases/airport, Mission Springs WD sewer and water mains, FEMA flood polygons.

**Gaps:** sewer and water mains are only published by Mission Springs WD (Desert Hot Springs). EMWD, Western, CVWD and the cities don't publish pipes, so the Site tab says to ask the district. Power: use SCE's DRPEP map. City-zoned parcels show the county general plan but no county zoning.

## Feasibility score (0–10)

`private.feasibility_score` scores six factors 0–1 and takes a weighted average. Factors with no data are left out and reported ("based on 5 of 6 factors"). Weights live in `app_settings.scoring_weights.feasibility`.

| Factor | Weight | 1.0 when… | 0 when… |
|---|---|---|---|
| Terrain | 2 | mean slope ≤3° | ≥25° |
| Utilities | 2 | in a water district (0.6) + storm drain ≤0.1 mi (0.4) | neither |
| Hazards | 2 | no constraints; subtract fire (VH 0.4 / H 0.25 / M 0.1), 100-yr flood 0.35, fault zone 0.3, liquefaction ≤0.15, MSHCP cell 0.3, airport 0.05 | — |
| Freeway access | 1.5 | interchange ≤1 mi | ≥15 mi |
| Commercial activity | 1.5 | ≥3 anchors ≤5 mi, ≥30 restaurants and ≥2 grocery ≤3 mi | none |
| Development momentum | 1 | ≥15 planning cases ≤3 mi in 3 yrs | none |

## Estimated value

`site_compute` takes the median $/acre of closed land sales in `sales_comps`: the last 3 years, 0.2×–5× the subject's acreage, within 5 mi (or 10 mi if fewer than 3 sales). That median × acres is the estimate. It needs at least 3 comps, and the table is empty until sales are imported or a provider is connected.

## RPCs

- n8n (service role): `site_pending`, `site_apply`, `site_load_pois`, `site_load_storm_drains`, `site_recompute_batch`. Each call stays under PostgREST's 8 s limit.
- App (members): `map_properties`, `map_pois`, `map_storm_drains`, `property_nearby_comps`.
