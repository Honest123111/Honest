// Runs once per batch item: { props: [{ property_id, apn, lon, lat, polygon }] } (≤ 15).
// For each parcel, pulls the free public facts behind the feasibility score and
// returns one item { rows } for public.site_apply. A lookup that fails is left
// out of the row (the database keeps the previous value) and noted in `errors`.
const helpers = this.helpers;
const props = $input.first().json.props || [];
if (!props.length) return [];

const COUNTY = 'https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/General/MapServer';
const DEM = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';
const FLOOD = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// n8n stops a Code step after 60 s, so keep requests short: 12 s × 2 tries.
async function get(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await helpers.httpRequest({ url, method: 'GET', json: true, timeout: 12000 });
      const body = typeof res === 'string' ? JSON.parse(res) : res;
      if (body && body.error) throw new Error(JSON.stringify(body.error).slice(0, 200));
      return body;
    } catch (e) { lastErr = e; await sleep(1000); }
  }
  throw lastErr;
}

// Identify returns display aliases ("FARMLAND DESCRIPTION"), queries return field names.
const attr = (a, name) => {
  const raw = a[name] !== undefined ? a[name] : a[name.replace(/_/g, ' ')];
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  return v === '' || v === 'Null' ? null : v;
};
const DEV_TYPES = /SPECIFIC PLAN|GENERAL PLAN AMENDMENT|CHANGE OF ZONE|TENTATIVE (TRACT|PARCEL)|TRACT MAP|CONDITIONAL USE|PLOT PLAN|DEVELOPMENT AGREEMENT|ENVIRONMENTAL IMPACT|PRE-APPLICATION|COMMERCIAL|INDUSTRIAL/;
const miBetween = (lon1, lat1, lon2, lat2) => {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function facts(p) {
  const row = { property_id: p.property_id };
  const errors = [];
  const X = p.lon, Y = p.lat;

  // 1) County layers at the parcel's interior point, one identify call.
  try {
    const ext = [X - 0.01, Y - 0.01, X + 0.01, Y + 0.01].join(',');
    const b = await get(COUNTY + '/identify?f=json&geometryType=esriGeometryPoint&sr=4326&tolerance=0&returnGeometry=false' +
      '&imageDisplay=800,600,96&mapExtent=' + ext + '&layers=all:30,190,200,220,230,250,380,470,480,520,620&geometry=' + X + ',' + Y);
    const hit = {};
    for (const r of b.results || []) if (!hit[r.layerId]) hit[r.layerId] = r.attributes || {};
    const z = hit[620], gp = hit[230], sp = hit[380], fire = hit[220], liq = hit[250], cell = hit[520],
          ap = hit[30], wd = hit[470] || hit[480], farm = hit[190];
    Object.assign(row, {
      zoning_county: z ? attr(z, 'ZONING') : null,
      gp_land_use: gp ? (attr(gp, 'LANDUSE_ID') || attr(gp, 'LANDUSE')) : null,
      gp_foundation: gp ? attr(gp, 'FOUNDATION_ID') : null,
      specific_plan: sp ? [attr(sp, 'SP_NUMBER'), attr(sp, 'SP_NAME')].filter(Boolean).join(' ') || null : null,
      fire_hazard: fire ? attr(fire, 'HAZ_CLASS') : null,
      fire_sra: fire ? attr(fire, 'SRA') : null,
      fault_zone: !!hit[200],
      liquefaction: liq ? (attr(liq, 'SUSCEPTIBILITY') || attr(liq, 'ZONE')) : null,
      mshcp_criteria_cell: cell ? attr(cell, 'LABEL') : null,
      airport_influence: ap ? attr(ap, 'NAME') : null,
      water_district: wd ? attr(wd, 'DISTRICT_NAME') : null,
      farmland: farm ? attr(farm, 'FARMLAND_DESCRIPTION') : null,
    });
  } catch (e) { errors.push('county: ' + String(e.message || e).slice(0, 160)); }

  // 2) Slope + elevation over the parcel polygon (a ~60 m square when there is no polygon).
  try {
    let rings;
    if (p.polygon && p.polygon.coordinates) {
      const polys = p.polygon.type === 'Polygon' ? [p.polygon.coordinates] : p.polygon.coordinates;
      rings = [].concat(...polys);
    } else {
      const d = 0.0003;
      rings = [[[X - d, Y - d], [X - d, Y + d], [X + d, Y + d], [X + d, Y - d], [X - d, Y - d]]];
    }
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const ring of rings) for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const spanM = Math.max((maxX - minX) * 92000, (maxY - minY) * 111000);
    const px = Math.max(10, Math.ceil(spanM / 800));           // keep it under ~800×800 pixels
    const geom = encodeURIComponent(JSON.stringify({ rings, spatialReference: { wkid: 4326 } }));
    const pixel = encodeURIComponent(JSON.stringify({ x: px, y: px, spatialReference: { wkid: 3857 } }));
    const base = DEM + '/computeStatisticsHistograms?f=json&geometryType=esriGeometryPolygon&pixelSize=' + pixel + '&geometry=' + geom;
    const [slope, elev] = await Promise.all([
      get(base + '&renderingRule=' + encodeURIComponent(JSON.stringify({ rasterFunction: 'Slope Degrees' }))),
      get(base),
    ]);
    const s = (slope.statistics || [])[0], el = (elev.statistics || [])[0];
    if (s && s.count > 0) { row.slope_mean_deg = Math.round(s.mean * 10) / 10; row.slope_max_deg = Math.round(s.max * 10) / 10; }
    if (el && el.count > 0) { row.elev_min_ft = Math.round(el.min * 3.28084); row.elev_max_ft = Math.round(el.max * 3.28084); }
  } catch (e) { errors.push('terrain: ' + String(e.message || e).slice(0, 160)); }

  // 3) FEMA flood zone (Esri's public copy of the NFHL; absent = outside mapped hazard areas).
  try {
    const b = await get(FLOOD + '/query?f=json&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects' +
      '&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&geometry=' + X + ',' + Y);
    const f = (b.features || [])[0];
    row.flood_zone = f ? f.attributes.FLD_ZONE : null;
    row.flood_sfha = f ? f.attributes.SFHA_TF === 'T' : false;
  } catch (e) { errors.push('flood: ' + String(e.message || e).slice(0, 160)); }

  // 4) Development activity: county PLUS planning cases within 3 mi, applied in the last 3 years.
  try {
    const since = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
    const where = "CASE_MODULE = 'PLAN' AND APPLIED_DATE >= DATE '" + since + "'";
    const b = await get(COUNTY + '/280/query?f=json&where=' + encodeURIComponent(where) +
      '&geometryType=esriGeometryPoint&inSR=4326&outSR=4326&distance=3&units=esriSRUnit_StatuteMile' +
      '&outFields=CASE_ID,CASE_TYPE,CASE_DESCR,CASE_STATUS,APPLIED_DATE&returnGeometry=true&maxAllowableOffset=0.002&geometry=' + X + ',' + Y);
    const seen = {};
    for (const f of b.features || []) {
      const a = f.attributes || {};
      if (!a.CASE_ID || seen[a.CASE_ID] || !DEV_TYPES.test(a.CASE_TYPE || '') || /WITHDRAWN|CANCEL|VOID|DENIED/.test(a.CASE_STATUS || '')) continue;
      const ring = f.geometry && f.geometry.rings && f.geometry.rings[0];
      let cx = null, cy = null;
      if (ring && ring.length) { cx = ring.reduce((s, c) => s + c[0], 0) / ring.length; cy = ring.reduce((s, c) => s + c[1], 0) / ring.length; }
      seen[a.CASE_ID] = {
        id: a.CASE_ID, type: String(a.CASE_TYPE).replace(/\s*\([A-Z]+\)$/, ''),
        descr: String(a.CASE_DESCR || '').replace(/\s+/g, ' ').slice(0, 280), status: a.CASE_STATUS,
        applied: a.APPLIED_DATE ? new Date(a.APPLIED_DATE).toISOString().slice(0, 10) : null,
        lon: cx === null ? null : +cx.toFixed(5), lat: cy === null ? null : +cy.toFixed(5),
        mi: cx === null ? null : +miBetween(X, Y, cx, cy).toFixed(1),
      };
    }
    const list = Object.values(seen).sort((a, b) => (a.mi === null) - (b.mi === null) || a.mi - b.mi);
    row.dev_cases_3mi = list.length;
    row.dev_cases = list.slice(0, 12);
  } catch (e) { errors.push('dev: ' + String(e.message || e).slice(0, 160)); }

  row.errors = errors;
  return row;
}

// 5 parcels at a time keeps each public server comfortable.
const rows = [];
for (let i = 0; i < props.length; i += 5) {
  rows.push(...(await Promise.all(props.slice(i, i + 5).map(facts))));
}
return [{ json: { rows, requested: props.length, withErrors: rows.filter(r => r.errors.length).length } }];
