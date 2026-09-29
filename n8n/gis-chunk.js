// Group pending APNs into batches of 100 (county query limit is 2,000 records).
const apns = $input.all().map(i => i.json.apn).filter(Boolean);
const out = [];
for (let i = 0; i < apns.length; i += 100) out.push({ json: { apns: apns.slice(i, i + 100), batch: out.length + 1 } });
return out;
