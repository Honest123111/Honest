import { workflow, node, trigger, sticky, expr, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

// Supabase credential "Htland" (service-role key) in n8n.
const supabaseCred = { id: 'HvuS1b8hJ7WgZcKs', name: 'Htland' };

const runNow = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: "Run Now", position: [0, 200] } });
const monthly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.4, config: { name: "Monthly (1st, 3:40 AM)", position: [0, 400], parameters: { rule: { interval: [{ field: 'months', monthsInterval: 1, triggerAtDayOfMonth: 1, triggerAtHour: 3, triggerAtMinute: 40 }] } } } });

// Source: n8n/site-osm-places.js
const places = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Fetch OSM Commercial Places", position: [260, 300],
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// OpenStreetMap commercial places in Riverside County \u2192 rows for public.site_load_pois.\n// Categories drive the feasibility score: anchors (Costco, big-box, home improvement,\n// warehouse clubs), grocery, restaurants, fuel, shopping, and named commercial /\n// industrial areas.\nconst q = '[out:json][timeout:180];area[\"name\"=\"Riverside County\"][\"admin_level\"=\"6\"]->.a;(' +\n  'nwr[\"shop\"~\"^(supermarket|wholesale|department_store|mall|doityourself|hardware)$\"](area.a);' +\n  'nwr[\"shop\"][\"brand\"](area.a);' +\n  'nwr[\"amenity\"~\"^(restaurant|fast_food|cafe|fuel)$\"](area.a);' +\n  'nwr[\"landuse\"~\"^(commercial|retail|industrial)$\"][\"name\"](area.a);' +\n  ');out center tags;';\n\nlet body, lastErr;\nfor (let attempt = 1; attempt <= 3 && !body; attempt++) {\n  try {\n    const res = await this.helpers.httpRequest({\n      url: 'https://overpass-api.de/api/interpreter', method: 'POST',\n      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'HT-Land-Dashboard/1.0 (n8n)' },\n      body: 'data=' + encodeURIComponent(q), json: false, timeout: 240000,\n    });\n    body = typeof res === 'string' ? JSON.parse(res) : res;\n  } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 10000 * attempt)); }\n}\nif (!body) throw lastErr;\n\nconst ANCHOR = /^(Costco|Walmart|Target|The Home Depot|Home Depot|Lowe's|Sam's Club|Amazon|Best Buy|Kohl's|Ross|TJ Maxx|Marshalls|Burlington|Dick's Sporting Goods|Bass Pro Shops|IKEA|WinCo|WinCo Foods|Tractor Supply|Floor & Decor|Hobby Lobby)/i;\nfunction category(t) {\n  const brand = t.brand || t.name || '';\n  if (t.landuse === 'industrial') return 'industrial_area';\n  if (t.landuse) return 'commercial_area';\n  if (t.amenity === 'fuel') return 'fuel';\n  if (/^(restaurant|fast_food|cafe)$/.test(t.amenity || '')) return 'restaurant';\n  if (ANCHOR.test(brand) || /^(wholesale|department_store|doityourself)$/.test(t.shop || '')) return 'anchor';\n  if (t.shop === 'supermarket') return 'grocery';\n  if (t.shop) return 'shopping';\n  return null;\n}\n\nconst rows = [];\nconst seen = {};\nfor (const el of body.elements || []) {\n  const t = el.tags || {};\n  const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;\n  const lon = el.lon !== undefined ? el.lon : el.center && el.center.lon;\n  const cat = category(t);\n  if (!cat || lat === undefined || lon === undefined) continue;\n  const key = el.type + el.id;\n  if (seen[key]) continue;\n  seen[key] = 1;\n  rows.push({ osm_type: el.type, osm_id: el.id, category: cat, brand: t.brand || null, name: t.name || t.brand || null, lon, lat });\n}\nif (rows.length < 500) throw new Error('Only ' + rows.length + ' places returned by OSM; refusing to replace the table');\n\nconst counts = {};\nfor (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;\nreturn [{ json: { p_rows: rows, p_reset: true, counts } }];\n" } }
});

const loadPlaces = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: "Load Places into Land DB", position: [520, 300],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/site_load_pois",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_rows: $json.p_rows, p_reset: $json.p_reset }) }}'),
      options: { timeout: 60000 } },
    credentials: { supabaseApi: supabaseCred } }
});

// Source: n8n/site-drain-pages.js
const pages = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Plan Storm Drain Pages", position: [780, 300],
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Plans the storm-drain download: one item per 1,000-feature page per source.\n// Both layers are published by Riverside County Flood Control on ArcGIS Online.\nconst SOURCES = [\n  { source: 'rcfc_facilities', url: 'https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/RCFC_Facilities/FeatureServer/0' },\n  { source: 'city_storm_drains', url: 'https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/City_Storm_Drains/FeatureServer/0' },\n];\nconst PAGE = 1000;\nconst out = [];\nfor (const s of SOURCES) {\n  const res = await this.helpers.httpRequest({ url: s.url + '/query?where=1%3D1&returnCountOnly=true&f=json', json: true, timeout: 60000 });\n  const body = typeof res === 'string' ? JSON.parse(res) : res;\n  if (!body || typeof body.count !== 'number') throw new Error('Could not count ' + s.source + ': ' + JSON.stringify(body).slice(0, 200));\n  for (let offset = 0; offset < body.count; offset += PAGE) {\n    out.push({ json: { source: s.source, url: s.url, offset, size: PAGE, reset: offset === 0, total: body.count } });\n  }\n}\nreturn out;\n" } }
});

const loop = splitInBatches({ version: 3, config: { name: 'Each Page', position: [1040, 300], parameters: { batchSize: 1 } } });

// Source: n8n/site-drain-fetch.js
const fetchPage = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Fetch Storm Drain Page", position: [1300, 420],
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Runs once per page item: { source, url, offset, size, reset } \u2192 one item for\n// public.site_load_storm_drains. Geometry is generalized to ~5 m; plenty for\n// \"how far is the nearest storm drain\".\nconst pg = $input.first().json;\nconst qs = 'where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.00005&orderByFields=OBJECTID' +\n  '&resultOffset=' + pg.offset + '&resultRecordCount=' + pg.size + '&f=json';\nlet body, lastErr;\nfor (let attempt = 1; attempt <= 3 && !body; attempt++) {\n  try {\n    const res = await this.helpers.httpRequest({ url: pg.url + '/query?' + qs, json: true, timeout: 120000 });\n    body = typeof res === 'string' ? JSON.parse(res) : res;\n    if (body && body.error) { lastErr = new Error(JSON.stringify(body.error)); body = null; }\n  } catch (e) { lastErr = e; }\n  if (!body) await new Promise(r => setTimeout(r, 3000 * attempt));\n}\nif (!body) throw lastErr;\n\nconst pick = (a, re) => {\n  const k = Object.keys(a).find(k => re.test(k));\n  return k && a[k] !== null && a[k] !== '' ? String(a[k]).trim() : null;\n};\nconst rows = [];\nfor (const f of body.features || []) {\n  const paths = (f.geometry && f.geometry.paths || []).filter(p => p.length >= 2);\n  if (!paths.length) continue;\n  const a = f.attributes || {};\n  rows.push({\n    owner: pick(a, /^owner$/i) || pick(a, /jurisdiction/i) || (pg.source === 'rcfc_facilities' ? 'RCFC&WCD' : null),\n    diameter: pick(a, /diam|size/i),\n    paths,\n  });\n}\nreturn [{ json: { p_source: pg.source, p_rows: rows, p_reset: pg.reset, offset: pg.offset } }];\n" } }
});

const loadPage = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: "Load Storm Drains into Land DB", position: [1560, 420],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/site_load_storm_drains",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_source: $json.p_source, p_rows: $json.p_rows, p_reset: $json.p_reset }) }}'),
      options: { timeout: 120000 } },
    credentials: { supabaseApi: supabaseCred } }
});

const buckets = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Split into 10 Buckets", position: [1300, 180],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Storm drains are loaded; rescore every fetched property in slices (PostgREST stops a call after 8 s).\nconst drains = {};\nfor (const i of $input.all()) if (i.json.source_total !== undefined) drains.pages = (drains.pages || 0) + 1, drains.inserted = (drains.inserted || 0) + (i.json.inserted || 0);\nconst BUCKETS = 10;\nconst out = [];\nfor (let b = 0; b < BUCKETS; b++) out.push({ json: { p_bucket: b, p_buckets: BUCKETS, drains } });\nreturn out;\n" } }
});

const rescore = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: "Rescore Properties (per bucket)", position: [1560, 180],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/site_recompute_batch",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_bucket: $json.p_bucket, p_buckets: $json.p_buckets }) }}'),
      options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 250 } } } },
    credentials: { supabaseApi: supabaseCred } }
});

const summary = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: "Run Summary", position: [1820, 180],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "const places = $('Load Places into Land DB').first().json;\nconst counts = $('Fetch OSM Commercial Places').first().json.counts;\nconst drains = $('Split into 10 Buckets').first().json.drains;\nconst rescored = $input.all().reduce((s, i) => s + (i.json.recomputed || 0), 0);\nreturn [{ json: { places, place_categories: counts, storm_drains: drains, properties_rescored: rescored, finishedAt: new Date().toISOString() } }];\n" } }
});

const note1 = sticky('## Site Reference Layers\nFree public data, no keys.\n1. OpenStreetMap: Costco / big-box anchors, grocery, restaurants, fuel and named commercial/industrial areas in Riverside County → `reference.pois`.\n2. Riverside County Flood Control: RCFC facilities + city storm drains → `reference.storm_drains`.\n3. Rescores every property that already has site facts.\n\nRuns monthly; click **Run Now** any time.', [], { position: [0, -140], width: 560, height: 260, color: 4 });

export default workflow('ht-site-reference', 'HT Land – Site Reference Layers (places + storm drains)')
  .add(runNow).to(places)
  .add(monthly).to(places)
  .add(places).to(loadPlaces.to(pages))
  .add(pages).to(loop
    .onDone(buckets.to(rescore.to(summary)))
    .onEachBatch(fetchPage.to(loadPage.to(nextBatch(loop)))))
  .add(note1);
