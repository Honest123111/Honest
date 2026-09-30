// Plans the storm-drain download: one item per 1,000-feature page per source.
// Both layers are published by Riverside County Flood Control on ArcGIS Online.
const SOURCES = [
  { source: 'rcfc_facilities', url: 'https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/RCFC_Facilities/FeatureServer/0' },
  { source: 'city_storm_drains', url: 'https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/City_Storm_Drains/FeatureServer/0' },
];
const PAGE = 1000;
const out = [];
for (const s of SOURCES) {
  const res = await this.helpers.httpRequest({ url: s.url + '/query?where=1%3D1&returnCountOnly=true&f=json', json: true, timeout: 60000 });
  const body = typeof res === 'string' ? JSON.parse(res) : res;
  if (!body || typeof body.count !== 'number') throw new Error('Could not count ' + s.source + ': ' + JSON.stringify(body).slice(0, 200));
  for (let offset = 0; offset < body.count; offset += PAGE) {
    out.push({ json: { source: s.source, url: s.url, offset, size: PAGE, reset: offset === 0, total: body.count } });
  }
}
return out;
