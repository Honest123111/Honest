// Runs once per batch item: { apns: ["123456789", ...] } (max 100).
// Pulls parcel polygons + assessor facts from Riverside County GIS and
// returns one item { rows: [...] } for public.gis_apply_parcels.
const BASE = 'https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer/';
const apns = $input.first().json.apns || [];
if (!apns.length) return [];

const inList = apns.map(a => "'" + String(a).replace(/\D/g, '') + "'").join(',');
const helpers = this.helpers;

async function get(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await helpers.httpRequest({ url, method: 'GET', json: true, timeout: 60000 });
      const body = typeof res === 'string' ? JSON.parse(res) : res;
      if (body && body.error) throw new Error('ArcGIS error: ' + JSON.stringify(body.error));
      return body;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

function query(layer, keyField, outFields, extra) {
  const qs = 'where=' + encodeURIComponent(keyField + ' IN (' + inList + ')') +
             '&outFields=' + encodeURIComponent(outFields) + (extra || '');
  return get(BASE + layer + '/query?' + qs);
}

// Esri rings -> GeoJSON Polygon (PostGIS ST_MakeValid sorts out multi-part/holes).
function ringsToGeoJson(g) {
  if (!g || !Array.isArray(g.rings) || !g.rings.length) return null;
  return { type: 'Polygon', coordinates: g.rings };
}

const [parcels, general, recorded, taxyear] = await Promise.all([
  query(40, 'APN', 'APN', '&returnGeometry=true&outSR=4326&f=json'),
  query(70, 'PIN', 'PIN,CLASS_CODE,STREET_NUMBER,STREET_NUMBER_SFX,STREET_PREDIRECTIONAL,STREET_NAME,STREET_TYPE,UNIT_NUMBER,CITY,POSTAL_CD', '&returnGeometry=false&f=json'),
  query(90, 'PIN', 'PIN,ACREAGE', '&returnGeometry=false&f=json'),
  query(100, 'PIN', 'PIN,TAX_YEAR,HOMEOWNERS_EXMPT', '&returnGeometry=false&f=json'),
]);

const geomByApn = {};
for (const f of parcels.features || []) {
  const apn = String(f.attributes.APN);
  const gj = ringsToGeoJson(f.geometry);
  if (!gj) continue;
  // A parcel can come back as several features; merge their rings.
  if (geomByApn[apn]) geomByApn[apn].coordinates.push(...gj.coordinates);
  else geomByApn[apn] = gj;
}
const byPin = (resp) => {
  const m = {};
  for (const f of (resp.features || [])) m[String(f.attributes.PIN)] = f.attributes;
  return m;
};
const gen = byPin(general);
const rec = byPin(recorded);
const tax = {};
for (const f of taxyear.features || []) {
  const a = f.attributes, k = String(a.PIN);
  if (!tax[k] || (a.TAX_YEAR || 0) > (tax[k].TAX_YEAR || 0)) tax[k] = a;
}

const clean = v => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();
const rows = apns.map(raw => {
  const apn = String(raw).replace(/\D/g, '');
  const g = gen[apn] || {};
  const street = [g.STREET_NUMBER, g.STREET_NUMBER_SFX, g.STREET_PREDIRECTIONAL, g.STREET_NAME, g.STREET_TYPE]
    .map(clean).filter(Boolean).join(' ');
  const unit = clean(g.UNIT_NUMBER);
  return {
    apn,
    geometry: geomByApn[apn] || null,
    class_code: clean(g.CLASS_CODE),
    acreage: rec[apn] && rec[apn].ACREAGE > 0 ? rec[apn].ACREAGE : null,
    situs_address: street ? (unit ? street + ' UNIT ' + unit : street) : null,
    situs_city: clean(g.CITY),
    situs_zip: clean(g.POSTAL_CD),
    homeowners_exempt: tax[apn] ? tax[apn].HOMEOWNERS_EXMPT : null,
    tax_year: tax[apn] ? tax[apn].TAX_YEAR : null,
  };
});

return [{ json: { rows, requested: apns.length, withPolygon: rows.filter(r => r.geometry).length } }];
