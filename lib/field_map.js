import { section_maps } from './field_map/sections.js';
import { fx_types, fx_params } from './field_map/fx.js';
import { fx_transform_fixes, fx_param_fixes } from './field_map/fx_fixes.js';

const mcp_source = 'rc505mk2-mcp src/params/param-map.ts';
const fx_section_re = /^(ifx|tfx)\/([A-D][A-D])_(.+)$/;

function fx_entry_build(fx, p) {
  const entry = { tag: p.tag, name: p.name, status: 'mcp', source: mcp_source, display: p.display, min: p.min, max: p.max };
  Object.assign(entry, fx_transform_fixes[p.transform], fx_param_fixes[fx]?.[p.tag]);
  return entry;
}

const fx_cache = new Map();

function fx_entries_get(fx) {
  if (!fx_cache.has(fx)) {
    const list = (fx_params[fx] || []).map(p => fx_entry_build(fx, p));
    fx_cache.set(fx, new Map(list.map(e => [e.tag, e])));
  }
  return fx_cache.get(fx);
}

const slot_re = /^(ifx|tfx)\/[A-D][A-D]$/;

function fx_type_entry(context, entry) {
  const names = fx_type_list(context).map(t => t.label);
  return { ...entry, display: { table: names }, min: 0, max: names.length - 1 };
}

const section_cache = new Map();

// Returns { kind, fields: Map(tag -> entry), note, fx, slot } for a section path.
export function section_map_get(path) {
  if (section_cache.has(path))
    return section_cache.get(path);
  let map = { kind: 'plain', fields: new Map(), note: null };
  const m = fx_section_re.exec(path);
  if (m) {
    map = { kind: 'fx', context: m[1], slot: m[2], fx: m[3], fields: fx_entries_get(m[3]), note: null };
  } else {
    const hit = section_maps.find(([re]) => re.test(path));
    if (hit)
      map = { kind: 'plain', fields: new Map(hit[1].map(e => [e.tag, e])), note: hit[2] || null };
    if (slot_re.test(path))
      map.fields.set('C', fx_type_entry(path.slice(0, 3), map.fields.get('C')));
  }
  section_cache.set(path, map);
  return map;
}

export function field_map_get(path, tag) {
  return section_map_get(path).fields.get(tag) || null;
}

export function fx_type_name(context, n) {
  return fx_types[context]?.[n] ?? null;
}

export function fx_type_list(context) {
  return Object.entries(fx_types[context] || {})
    .map(([n, name]) => ({ value: Number(n), label: name.replace(/_/g, ' ') }))
    .sort((a, b) => a.value - b.value);
}

export const sample_rate = 44100;

function samples_format(n) {
  return `${n} (${(n / sample_rate).toFixed(3)} s)`;
}

function bits_format(labels, n) {
  const on = labels.filter((_, i) => n & (1 << i));
  if (on.length === labels.length)
    return 'ALL';
  return on.length ? on.join(', ') : 'none';
}

export function value_format(entry, raw) {
  const n = raw === '' || raw === null ? NaN : Number(raw);
  const d = entry?.display;
  if (!d || !Number.isInteger(n) || n < 0)
    return String(raw);
  if (d.ascii)
    return JSON.stringify(String.fromCharCode(n));
  if (d.bits)
    return bits_format(d.bits, n);
  if (d.samples)
    return samples_format(n);
  if (d.scale !== undefined)
    return (n * d.scale).toFixed(d.digits ?? 0) + (d.unit || '');
  if (d.table)
    return d.table[n] ?? String(raw);
  if (d.prefix) {
    if (n >= 0 && n < d.prefix.length)
      return d.prefix[n];
    return String(n + (d.offset || 0)) + (d.unit || '');
  }
  return String(raw);
}

const option_limit = 256;

// The list of [value, label] choices for a select widget, or null if the
// field needs a number input.
export function value_options(entry) {
  if (!entry || entry.min === undefined || entry.max === undefined)
    return null;
  const d = entry.display;
  if (!d || d.bits || d.samples || d.ascii || d.scale !== undefined)
    return null;
  if (entry.max - entry.min > option_limit)
    return null;
  const out = [];
  for (let n = entry.min; n <= entry.max; n++)
    out.push({ value: n, label: value_format(entry, n) });
  return out;
}

export const status_list = ['guide', 'inferred', 'mcp', 'unknown'];

export const status_text = {
  guide: 'Name from the Parameter Guide, at its guide position; the sample data agrees with the guide range and default.',
  inferred: 'Name from the guide or the data; the tag was chosen from the sample data. Not confirmed on the unit.',
  mcp: 'Name from rc505mk2-mcp. Its letters follow guide order and are not verified on the unit.',
  unknown: 'No source names this field.',
};
