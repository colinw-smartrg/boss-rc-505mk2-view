// Usage: node tools/field_stats.js <DATA dir> [section path regex]
// Prints the range and distinct values of each field, over all RC0 files.
// Section names such as AA_DELAY fold to *_DELAY, so the 16 FX slots merge.

import fs from 'fs';
import path from 'path';
import { text_from_bytes } from '../lib/bytes.js';
import { rc0_parse } from '../lib/rc0_parse.js';
import { stats_add } from '../lib/rc0_stats.js';

export function stats_collect(dir) {
  const stats = new Map();
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.RC0$/i.test(name) || /^RHYTHM/i.test(name))
      continue;
    stats_add(stats, rc0_parse(text_from_bytes(fs.readFileSync(path.join(dir, name)))));
  }
  return stats;
}

function values_format(values) {
  const nums = [...values.keys()].map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const distinct = [...values.entries()].sort((a, b) => +a[0] - +b[0]);
  const list = distinct.length <= 12
    ? distinct.map(([v, n]) => `${v}x${n}`).join(' ')
    : `${distinct.length} distinct`;
  return `min ${min} max ${max}  ${list}`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const dir = process.argv[2];
  const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
  if (!dir) {
    console.error('usage: node tools/field_stats.js <DATA dir> [section regex]');
    process.exit(2);
  }
  for (const [key, tags] of collect_sorted(stats_collect(dir))) {
    if (filter && !filter.test(key))
      continue;
    console.log(key);
    for (const [tag, values] of tags)
      console.log(`  ${tag.padEnd(2)} ${values_format(values)}`);
  }
}

function collect_sorted(stats) {
  return [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
