import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Supabase credential "Htland" (service-role key) in n8n.
const supabaseCred = { id: 'HvuS1b8hJ7WgZcKs', name: 'Htland' };

const runNow = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now', position: [0, 200] } });
const monthly = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: { name: 'Monthly (1st, 3:10 AM)', position: [0, 400],
    parameters: { rule: { interval: [{ field: 'months', monthsInterval: 1, triggerAtDayOfMonth: 1, triggerAtHour: 3, triggerAtMinute: 10 }] } } }
});

// Source: n8n/i10-fetch.js
const fetchRef = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Fetch I-10 Line + Exits', position: [260, 300],
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Builds the I-10 reference payload for public.gis_load_i10_reference:\n//   p_centerline:   GeoJSON FeatureCollection of I-10 lines from Caltrans SHN\n//   p_interchanges: one point per I-10 exit (OSM motorway_junction nodes)\n// Both sources are free and need no key.\nconst helpers = this.helpers;\nconst sleep = ms => new Promise(r => setTimeout(r, ms));\n\nasync function withRetry(fn) {\n  let lastErr;\n  for (let attempt = 1; attempt <= 3; attempt++) {\n    try { return await fn(); } catch (e) { lastErr = e; await sleep(5000 * attempt); }\n  }\n  throw lastErr;\n}\n\n// --- Caltrans State Highway Network centerline ------------------------------\n// maxAllowableOffset ~20 m keeps the payload small; distances are reported in\n// miles, so the generalization is invisible.\nconst SHN = 'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Lines/FeatureServer/0/query';\nconst shn = await withRetry(async () => {\n  const res = await helpers.httpRequest({\n    url: SHN + '?where=' + encodeURIComponent('Route=10') +\n         '&outFields=Route,County,Direction&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0002&f=json',\n    method: 'GET', json: true, timeout: 120000,\n  });\n  const body = typeof res === 'string' ? JSON.parse(res) : res;\n  if (body && body.error) throw new Error('Caltrans error: ' + JSON.stringify(body.error));\n  return body;\n});\nif (shn.exceededTransferLimit) throw new Error('Caltrans returned a partial result (exceededTransferLimit)');\n\nconst features = [];\nlet vertices = 0;\nfor (const f of shn.features || []) {\n  const paths = (f.geometry && f.geometry.paths || []).filter(p => p.length >= 2);\n  if (!paths.length) continue;\n  paths.forEach(p => { vertices += p.length; });\n  features.push({\n    type: 'Feature',\n    properties: { county: f.attributes.County, direction: f.attributes.Direction },\n    geometry: { type: 'MultiLineString', coordinates: paths },\n  });\n}\nif (!features.length) throw new Error('Caltrans returned no I-10 geometry');\n\n// --- OSM I-10 exits ----------------------------------------------------------\n// Each exit usually has one junction node per direction; they are averaged\n// into a single point per exit number.\nconst COUNTIES = ['Riverside', 'San Bernardino', 'Los Angeles'];\nconst junctions = [];\nfor (const county of COUNTIES) {\n  const q = '[out:json][timeout:90];' +\n    'area[\"name\"=\"' + county + ' County\"][\"admin_level\"=\"6\"]->.a;' +\n    'way[\"highway\"=\"motorway\"][\"ref\"~\"(^|;)I 10($|;)\"](area.a)->.w;' +\n    'node(w.w)[\"highway\"=\"motorway_junction\"]->.j;.j out;' +\n    // Off-ramps leaving each exit carry the destination signage.\n    'way(bn.j)[\"highway\"=\"motorway_link\"];out body;';\n  const body = await withRetry(async () => {\n    const res = await helpers.httpRequest({\n      url: 'https://overpass-api.de/api/interpreter', method: 'POST',\n      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',\n                 'User-Agent': 'HT-Land-Dashboard/1.0 (n8n)' },\n      body: 'data=' + encodeURIComponent(q), json: false, timeout: 120000,\n    });\n    return typeof res === 'string' ? JSON.parse(res) : res;\n  });\n  const els = body.elements || [];\n  const rampName = {};\n  for (const w of els) {\n    if (w.type !== 'way' || !w.nodes || !w.nodes.length) continue;\n    const t = w.tags || {};\n    const dest = t['destination:street'] || t.destination || t['destination:ref'] || '';\n    if (dest && !rampName[w.nodes[0]]) rampName[w.nodes[0]] = dest;  // ramp starts at the exit node\n  }\n  for (const el of els) {\n    if (el.type !== 'node') continue;\n    if (rampName[el.id] && !(el.tags && (el.tags.exit_to || el.tags.name))) {\n      el.tags = Object.assign({}, el.tags, { destination: rampName[el.id] });\n    }\n    junctions.push({ county, el });\n  }\n  await sleep(2000); // be polite to the public Overpass server\n}\n\nconst groups = {};\nfor (const { county, el } of junctions) {\n  const t = el.tags || {};\n  const ref = (t.ref || '').trim();\n  const name = (t.exit_to || t.name || t.destination || '').split(';').map(s => s.trim()).filter(Boolean).join(' / ');\n  if (!ref && !name) continue;\n  const key = county + '|' + (ref || 'name:' + name);\n  const g = groups[key] || (groups[key] = { county, exit_number: ref, names: {}, lon: 0, lat: 0, n: 0 });\n  g.lon += el.lon; g.lat += el.lat; g.n += 1;\n  if (name) g.names[name] = (g.names[name] || 0) + 1;\n}\nconst interchanges = Object.values(groups).map(g => {\n  const best = Object.entries(g.names).sort((a, b) => b[1] - a[1])[0];\n  return {\n    exit_number: g.exit_number || null,\n    name: best ? best[0] : null,\n    county: g.county,\n    lon: +(g.lon / g.n).toFixed(6),\n    lat: +(g.lat / g.n).toFixed(6),\n  };\n});\nif (interchanges.length < 50) throw new Error('Only ' + interchanges.length + ' I-10 exits found in OSM; refusing to replace the table');\n\nreturn [{ json: {\n  p_centerline: { type: 'FeatureCollection', features },\n  p_interchanges: interchanges,\n  stats: { segments: features.length, vertices, junction_nodes: junctions.length, interchanges: interchanges.length },\n} }];\n" } }
});

const load = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: 'Load I-10 into Land DB', position: [520, 300],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/gis_load_i10_reference",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_centerline: $json.p_centerline, p_interchanges: $json.p_interchanges }) }}'),
      options: { timeout: 60000 } },
    credentials: { supabaseApi: supabaseCred } }
});

const buckets = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Split into 10 Buckets', position: [780, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// PostgREST stops any call after 8 s, so properties are recomputed in slices.\nconst BUCKETS = 10;\nconst out = [];\nfor (let b = 0; b < BUCKETS; b++) out.push({ json: { p_bucket: b, p_buckets: BUCKETS } });\nreturn out;\n" } }
});

const recompute = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: 'Recompute Distances (per bucket)', position: [1040, 300],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/gis_recompute_geo_batch",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_bucket: $json.p_bucket, p_buckets: $json.p_buckets }) }}'),
      options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 250 } } } },
    credentials: { supabaseApi: supabaseCred } }
});

const summary = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Run Summary', position: [1300, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const load = $('Load I-10 into Land DB').first().json;\nconst fetched = $('Fetch I-10 Line + Exits').first().json.stats;\nconst recomputed = $input.all().reduce((s, i) => s + (i.json.recomputed || 0), 0);\nreturn [{ json: { ...load, ...fetched, properties_recomputed: recomputed, finishedAt: new Date().toISOString() } }];\n" } }
});

const note1 = sticky('## I-10 Centerline & Interchanges\nFree public data, no keys.\n1. Caltrans State Highway Network: every I-10 segment (statewide, both directions).\n2. OpenStreetMap: I-10 exits in Riverside, San Bernardino and Los Angeles counties, one point per exit.\n3. `gis_load_i10_reference` replaces the centerline and upserts the exits.\n4. `gis_recompute_geo_batch` × 10 recomputes each property\'s distance to I-10, nearest exit and corridor zone.\n\nRuns monthly; click **Run Now** any time.', [], { position: [0, -120], width: 520, height: 260, color: 4 });

export default workflow('ht-i10-reference', 'HT Land – I-10 Centerline & Interchanges')
  .add(runNow).to(fetchRef)
  .add(monthly).to(fetchRef)
  .add(fetchRef).to(load.to(buckets.to(recompute.to(summary))))
  .add(note1);
