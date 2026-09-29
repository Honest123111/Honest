// Totals across all batches written this run (Each Batch 'done' output carries every batch result).
const t = { batches: 0, updated: 0, no_polygon: 0, unknown_apn: 0 };
for (const r of $input.all()) {
  t.batches += 1;
  t.updated += r.json.updated || 0;
  t.no_polygon += r.json.no_polygon || 0;
  t.unknown_apn += r.json.unknown_apn || 0;
}
return [{ json: { ...t, finishedAt: new Date().toISOString() } }];
