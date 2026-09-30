// Runs once per page item: { source, url, offset, size, reset } → one item for
// public.site_load_storm_drains. Geometry is generalized to ~5 m; plenty for
// "how far is the nearest storm drain".
const pg = $input.first().json;
const qs = 'where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.00005&orderByFields=OBJECTID' +
  '&resultOffset=' + pg.offset + '&resultRecordCount=' + pg.size + '&f=json';
let body, lastErr;
for (let attempt = 1; attempt <= 3 && !body; attempt++) {
  try {
    const res = await this.helpers.httpRequest({ url: pg.url + '/query?' + qs, json: true, timeout: 120000 });
    body = typeof res === 'string' ? JSON.parse(res) : res;
    if (body && body.error) { lastErr = new Error(JSON.stringify(body.error)); body = null; }
  } catch (e) { lastErr = e; }
  if (!body) await new Promise(r => setTimeout(r, 3000 * attempt));
}
if (!body) throw lastErr;

const pick = (a, re) => {
  const k = Object.keys(a).find(k => re.test(k));
  return k && a[k] !== null && a[k] !== '' ? String(a[k]).trim() : null;
};
const rows = [];
for (const f of body.features || []) {
  const paths = (f.geometry && f.geometry.paths || []).filter(p => p.length >= 2);
  if (!paths.length) continue;
  const a = f.attributes || {};
  rows.push({
    owner: pick(a, /^owner$/i) || pick(a, /jurisdiction/i) || (pg.source === 'rcfc_facilities' ? 'RCFC&WCD' : null),
    diameter: pick(a, /diam|size/i),
    paths,
  });
}
return [{ json: { p_source: pg.source, p_rows: rows, p_reset: pg.reset, offset: pg.offset } }];
