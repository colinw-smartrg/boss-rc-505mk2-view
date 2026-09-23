// Usage: npx --yes tsx tools/mcp_check.js <rc505mk2-mcp clone> [DATA dir]
// Compares the guide default of each FX parameter (fx-reference.json in
// rc505mk2-mcp, converted with its forward transform) with the value that
// most FX slots in the sample data hold. Most slots hold factory values, so
// a mismatch points to a wrong tag letter or a wrong transform.

import fs from 'fs';
import path from 'path';
import { stats_collect } from './field_stats.js';

const clone = process.argv[2];
const data_dir = process.argv[3] || '/sandbox/colinw/ROLAND/DATA';
const { PARAM_MAP } = await import(path.resolve(clone, 'src/params/param-map.ts'));
const ref = JSON.parse(fs.readFileSync(path.resolve(clone, 'src/data/fx-reference.json'), 'utf8'));
const stats = stats_collect(data_dir);

const ref_fx = {};
for (const group of Object.values(ref))
  if (group && typeof group === 'object')
    for (const [fx, body] of Object.entries(group))
      if (body?.params)
        ref_fx[fx.toUpperCase().replace(/[ .]/g, '_')] = body.params;

let mismatch = 0;
let compared = 0;
for (const [fx, defs] of Object.entries(PARAM_MAP)) {
  const values = stats.get(`ifx/*_${fx}`) || stats.get(`tfx/*_${fx}`);
  const ref_params = ref_fx[fx];
  if (!values || !ref_params)
    continue;
  for (const [name, def] of Object.entries(defs)) {
    const r = ref_params[name];
    if (!r || r.default === null || r.default === undefined || !def.transform)
      continue;
    let expected;
    try {
      expected = def.transform(String(r.default));
    } catch {
      continue;
    }
    const seen = values.get(def.tag);
    if (!seen)
      continue;
    const [dominant] = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
    compared++;
    if (String(expected) !== dominant) {
      mismatch++;
      console.log(`${fx} ${name} tag ${def.tag}: guide default ${r.default} -> ${expected}, data ${dominant}`);
    }
  }
}
console.log(`compared ${compared}, mismatch ${mismatch}`);
