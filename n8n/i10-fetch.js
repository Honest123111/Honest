// Builds the I-10 reference payload for public.gis_load_i10_reference:
//   p_centerline:   GeoJSON FeatureCollection of I-10 lines from Caltrans SHN
//   p_interchanges: one point per I-10 exit (OSM motorway_junction nodes)
// Both sources are free and need no key.
const helpers = this.helpers;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await fn(); } catch (e) { lastErr = e; await sleep(5000 * attempt); }
  }
  throw lastErr;
}

// --- Caltrans State Highway Network centerline ------------------------------
// maxAllowableOffset ~20 m keeps the payload small; distances are reported in
// miles, so the generalization is invisible.
const SHN = 'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Lines/FeatureServer/0/query';
const shn = await withRetry(async () => {
  const res = await helpers.httpRequest({
    url: SHN + '?where=' + encodeURIComponent('Route=10') +
         '&outFields=Route,County,Direction&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0002&f=json',
    method: 'GET', json: true, timeout: 120000,
  });
  const body = typeof res === 'string' ? JSON.parse(res) : res;
  if (body && body.error) throw new Error('Caltrans error: ' + JSON.stringify(body.error));
  return body;
});
if (shn.exceededTransferLimit) throw new Error('Caltrans returned a partial result (exceededTransferLimit)');

const features = [];
let vertices = 0;
for (const f of shn.features || []) {
  const paths = (f.geometry && f.geometry.paths || []).filter(p => p.length >= 2);
  if (!paths.length) continue;
  paths.forEach(p => { vertices += p.length; });
  features.push({
    type: 'Feature',
    properties: { county: f.attributes.County, direction: f.attributes.Direction },
    geometry: { type: 'MultiLineString', coordinates: paths },
  });
}
if (!features.length) throw new Error('Caltrans returned no I-10 geometry');

// --- OSM I-10 exits ----------------------------------------------------------
// Each exit usually has one junction node per direction; they are averaged
// into a single point per exit number.
const COUNTIES = ['Riverside', 'San Bernardino', 'Los Angeles'];
const junctions = [];
for (const county of COUNTIES) {
  const q = '[out:json][timeout:90];' +
    'area["name"="' + county + ' County"]["admin_level"="6"]->.a;' +
    'way["highway"="motorway"]["ref"~"(^|;)I 10($|;)"](area.a)->.w;' +
    'node(w.w)["highway"="motorway_junction"]->.j;.j out;' +
    // Off-ramps leaving each exit carry the destination signage.
    'way(bn.j)["highway"="motorway_link"];out body;';
  const body = await withRetry(async () => {
    const res = await helpers.httpRequest({
      url: 'https://overpass-api.de/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
                 'User-Agent': 'HT-Land-Dashboard/1.0 (n8n)' },
      body: 'data=' + encodeURIComponent(q), json: false, timeout: 120000,
    });
    return typeof res === 'string' ? JSON.parse(res) : res;
  });
  const els = body.elements || [];
  const rampName = {};
  for (const w of els) {
    if (w.type !== 'way' || !w.nodes || !w.nodes.length) continue;
    const t = w.tags || {};
    const dest = t['destination:street'] || t.destination || t['destination:ref'] || '';
    if (dest && !rampName[w.nodes[0]]) rampName[w.nodes[0]] = dest;  // ramp starts at the exit node
  }
  for (const el of els) {
    if (el.type !== 'node') continue;
    if (rampName[el.id] && !(el.tags && (el.tags.exit_to || el.tags.name))) {
      el.tags = Object.assign({}, el.tags, { destination: rampName[el.id] });
    }
    junctions.push({ county, el });
  }
  await sleep(2000); // be polite to the public Overpass server
}

const groups = {};
for (const { county, el } of junctions) {
  const t = el.tags || {};
  const ref = (t.ref || '').trim();
  const name = (t.exit_to || t.name || t.destination || '').split(';').map(s => s.trim()).filter(Boolean).join(' / ');
  if (!ref && !name) continue;
  const key = county + '|' + (ref || 'name:' + name);
  const g = groups[key] || (groups[key] = { county, exit_number: ref, names: {}, lon: 0, lat: 0, n: 0 });
  g.lon += el.lon; g.lat += el.lat; g.n += 1;
  if (name) g.names[name] = (g.names[name] || 0) + 1;
}
const interchanges = Object.values(groups).map(g => {
  const best = Object.entries(g.names).sort((a, b) => b[1] - a[1])[0];
  return {
    exit_number: g.exit_number || null,
    name: best ? best[0] : null,
    county: g.county,
    lon: +(g.lon / g.n).toFixed(6),
    lat: +(g.lat / g.n).toFixed(6),
  };
});
if (interchanges.length < 50) throw new Error('Only ' + interchanges.length + ' I-10 exits found in OSM; refusing to replace the table');

return [{ json: {
  p_centerline: { type: 'FeatureCollection', features },
  p_interchanges: interchanges,
  stats: { segments: features.length, vertices, junction_nodes: junctions.length, interchanges: interchanges.length },
} }];
