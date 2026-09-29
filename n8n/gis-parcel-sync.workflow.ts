import { workflow, node, trigger, sticky, newCredential, splitInBatches, nextBatch, expr } from '@n8n/workflow-sdk';

const supabaseCred = newCredential('Supabase – HT Land (service role)');

const runNow = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Run Now', position: [0, 200] } });
const nightly = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: { name: 'Nightly 2:15 AM', position: [0, 400],
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 2, triggerAtMinute: 15 }] } } }
});

const getPending = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: 'Get APNs Missing a Parcel', position: [260, 300],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/gis_pending_apns",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{"p_limit": 2000}',
      options: { timeout: 60000 } },
    credentials: { supabaseApi: supabaseCred } }
});

const chunk = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Group into Batches of 100', position: [520, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Group pending APNs into batches of 100 (county query limit is 2,000 records).\nconst apns = $input.all().map(i => i.json.apn).filter(Boolean);\nconst out = [];\nfor (let i = 0; i < apns.length; i += 100) out.push({ json: { apns: apns.slice(i, i + 100), batch: out.length + 1 } });\nreturn out;\n" } }
});

const loop = splitInBatches({ version: 3, config: { name: 'Each Batch', position: [780, 300], parameters: { batchSize: 1 } } });

const fetchCounty = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Fetch Riverside County GIS', position: [1040, 420],
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Runs once per batch item: { apns: [\"123456789\", ...] } (max 100).\n// Pulls parcel polygons + assessor facts from Riverside County GIS and\n// returns one item { rows: [...] } for public.gis_apply_parcels.\nconst BASE = 'https://gis.countyofriverside.us/arcgis_mapping/rest/services/OpenData/Assessor/MapServer/';\nconst apns = $input.first().json.apns || [];\nif (!apns.length) return [];\n\nconst inList = apns.map(a => \"'\" + String(a).replace(/\\D/g, '') + \"'\").join(',');\nconst helpers = this.helpers;\n\nasync function get(url) {\n  let lastErr;\n  for (let attempt = 1; attempt <= 3; attempt++) {\n    try {\n      const res = await helpers.httpRequest({ url, method: 'GET', json: true, timeout: 60000 });\n      const body = typeof res === 'string' ? JSON.parse(res) : res;\n      if (body && body.error) throw new Error('ArcGIS error: ' + JSON.stringify(body.error));\n      return body;\n    } catch (e) {\n      lastErr = e;\n      await new Promise(r => setTimeout(r, 1500 * attempt));\n    }\n  }\n  throw lastErr;\n}\n\nfunction query(layer, keyField, outFields, extra) {\n  const qs = 'where=' + encodeURIComponent(keyField + ' IN (' + inList + ')') +\n             '&outFields=' + encodeURIComponent(outFields) + (extra || '');\n  return get(BASE + layer + '/query?' + qs);\n}\n\n// Esri rings -> GeoJSON Polygon (PostGIS ST_MakeValid sorts out multi-part/holes).\nfunction ringsToGeoJson(g) {\n  if (!g || !Array.isArray(g.rings) || !g.rings.length) return null;\n  return { type: 'Polygon', coordinates: g.rings };\n}\n\nconst [parcels, general, recorded, taxyear] = await Promise.all([\n  query(40, 'APN', 'APN', '&returnGeometry=true&outSR=4326&f=json'),\n  query(70, 'PIN', 'PIN,CLASS_CODE,STREET_NUMBER,STREET_NUMBER_SFX,STREET_PREDIRECTIONAL,STREET_NAME,STREET_TYPE,UNIT_NUMBER,CITY,POSTAL_CD', '&returnGeometry=false&f=json'),\n  query(90, 'PIN', 'PIN,ACREAGE', '&returnGeometry=false&f=json'),\n  query(100, 'PIN', 'PIN,TAX_YEAR,HOMEOWNERS_EXMPT', '&returnGeometry=false&f=json'),\n]);\n\nconst geomByApn = {};\nfor (const f of parcels.features || []) {\n  const apn = String(f.attributes.APN);\n  const gj = ringsToGeoJson(f.geometry);\n  if (!gj) continue;\n  // A parcel can come back as several features; merge their rings.\n  if (geomByApn[apn]) geomByApn[apn].coordinates.push(...gj.coordinates);\n  else geomByApn[apn] = gj;\n}\nconst byPin = (resp) => {\n  const m = {};\n  for (const f of (resp.features || [])) m[String(f.attributes.PIN)] = f.attributes;\n  return m;\n};\nconst gen = byPin(general);\nconst rec = byPin(recorded);\nconst tax = {};\nfor (const f of taxyear.features || []) {\n  const a = f.attributes, k = String(a.PIN);\n  if (!tax[k] || (a.TAX_YEAR || 0) > (tax[k].TAX_YEAR || 0)) tax[k] = a;\n}\n\nconst clean = v => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();\nconst rows = apns.map(raw => {\n  const apn = String(raw).replace(/\\D/g, '');\n  const g = gen[apn] || {};\n  const street = [g.STREET_NUMBER, g.STREET_NUMBER_SFX, g.STREET_PREDIRECTIONAL, g.STREET_NAME, g.STREET_TYPE]\n    .map(clean).filter(Boolean).join(' ');\n  const unit = clean(g.UNIT_NUMBER);\n  return {\n    apn,\n    geometry: geomByApn[apn] || null,\n    class_code: clean(g.CLASS_CODE),\n    acreage: rec[apn] && rec[apn].ACREAGE > 0 ? rec[apn].ACREAGE : null,\n    situs_address: street ? (unit ? street + ' UNIT ' + unit : street) : null,\n    situs_city: clean(g.CITY),\n    situs_zip: clean(g.POSTAL_CD),\n    homeowners_exempt: tax[apn] ? tax[apn].HOMEOWNERS_EXMPT : null,\n    tax_year: tax[apn] ? tax[apn].TAX_YEAR : null,\n  };\n});\n\nreturn [{ json: { rows, requested: apns.length, withPolygon: rows.filter(r => r.geometry).length } }];\n" } }
});

const write = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: { name: 'Write to Land DB', position: [1300, 420],
    parameters: { method: 'POST', url: "https://sciivzgingzpxxqihrkh.supabase.co/rest/v1/rpc/gis_apply_parcels",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_rows: $json.rows }) }}'),
      options: { timeout: 120000 } },
    credentials: { supabaseApi: supabaseCred } }
});

const summary = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Run Summary', position: [1040, 180],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Totals across all batches written this run.\nconst t = { batches: 0, updated: 0, no_polygon: 0, unknown_apn: 0 };\nfor (const r of $input.all()) {\n  t.batches += 1;\n  t.updated += r.json.updated || 0;\n  t.no_polygon += r.json.no_polygon || 0;\n  t.unknown_apn += r.json.unknown_apn || 0;\n}\nreturn [{ json: { ...t, finishedAt: new Date().toISOString() } }];\n" } }
});

const note1 = sticky('## Riverside GIS Parcel Sync\nFree county data, no approval needed.\n1. Finds land-DB properties with no parcel polygon.\n2. Pulls polygon, land-use class, acreage, situs and homeowner exemption from gis.countyofriverside.us (100 APNs per call).\n3. Writes via `gis_apply_parcels`: polygon always; other fields only fill blanks. Distance to I-10 recomputes automatically once the centerline is loaded.\n\n**Setup:** attach the *Supabase – HT Land (service role)* credential to the two Supabase nodes.', [], { position: [0, -120], width: 520, height: 260, color: 4 });

export default workflow('ht-gis-parcel-sync', 'HT Land – Riverside GIS Parcel Sync')
  .add(runNow).to(getPending)
  .add(nightly).to(getPending)
  .add(getPending).to(chunk)
  .to(loop
    .onDone(summary)
    .onEachBatch(fetchCounty.to(write.to(nextBatch(loop)))))
  .add(note1);
