// OpenStreetMap commercial places in Riverside County → rows for public.site_load_pois.
// Categories drive the feasibility score: anchors (Costco, big-box, home improvement,
// warehouse clubs), grocery, restaurants, fuel, shopping, and named commercial /
// industrial areas.
const q = '[out:json][timeout:180];area["name"="Riverside County"]["admin_level"="6"]->.a;(' +
  'nwr["shop"~"^(supermarket|wholesale|department_store|mall|doityourself|hardware)$"](area.a);' +
  'nwr["shop"]["brand"](area.a);' +
  'nwr["amenity"~"^(restaurant|fast_food|cafe|fuel)$"](area.a);' +
  'nwr["landuse"~"^(commercial|retail|industrial)$"]["name"](area.a);' +
  ');out center tags;';

let body, lastErr;
for (let attempt = 1; attempt <= 3 && !body; attempt++) {
  try {
    const res = await this.helpers.httpRequest({
      url: 'https://overpass-api.de/api/interpreter', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'HT-Land-Dashboard/1.0 (n8n)' },
      body: 'data=' + encodeURIComponent(q), json: false, timeout: 240000,
    });
    body = typeof res === 'string' ? JSON.parse(res) : res;
  } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 10000 * attempt)); }
}
if (!body) throw lastErr;

const ANCHOR = /^(Costco|Walmart|Target|The Home Depot|Home Depot|Lowe's|Sam's Club|Amazon|Best Buy|Kohl's|Ross|TJ Maxx|Marshalls|Burlington|Dick's Sporting Goods|Bass Pro Shops|IKEA|WinCo|WinCo Foods|Tractor Supply|Floor & Decor|Hobby Lobby)/i;
function category(t) {
  const brand = t.brand || t.name || '';
  if (t.landuse === 'industrial') return 'industrial_area';
  if (t.landuse) return 'commercial_area';
  if (t.amenity === 'fuel') return 'fuel';
  if (/^(restaurant|fast_food|cafe)$/.test(t.amenity || '')) return 'restaurant';
  if (ANCHOR.test(brand) || /^(wholesale|department_store|doityourself)$/.test(t.shop || '')) return 'anchor';
  if (t.shop === 'supermarket') return 'grocery';
  if (t.shop) return 'shopping';
  return null;
}

const rows = [];
const seen = {};
for (const el of body.elements || []) {
  const t = el.tags || {};
  const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
  const lon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
  const cat = category(t);
  if (!cat || lat === undefined || lon === undefined) continue;
  const key = el.type + el.id;
  if (seen[key]) continue;
  seen[key] = 1;
  rows.push({ osm_type: el.type, osm_id: el.id, category: cat, brand: t.brand || null, name: t.name || t.brand || null, lon, lat });
}
if (rows.length < 500) throw new Error('Only ' + rows.length + ' places returned by OSM; refusing to replace the table');

const counts = {};
for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;
return [{ json: { p_rows: rows, p_reset: true, counts } }];
