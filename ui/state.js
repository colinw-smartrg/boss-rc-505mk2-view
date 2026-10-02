import { stats_add } from '../lib/rc0_stats.js';
import { rc0_file_load, rc0_name_parse } from '../lib/rc0_file.js';

// Edits are kept per pair as Map("path|tag" -> value string), against the
// current copy of the pair. The loaded files never change.
export const state = {
  pairs: [],
  pair_by_id: new Map(),
  stats: new Map(),
  edits: new Map(),
  source_handle: null,
  listeners: new Set(),
};

export function state_load(pairs, source_handle) {
  state.pairs = pairs;
  state.pair_by_id = new Map(pairs.map(p => [p.id, p]));
  state.stats = new Map();
  for (const p of pairs)
    for (const copy of [p.current, p.next])
      if (copy)
        stats_add(state.stats, copy.doc);
  state.edits = new Map();
  state.source_handle = source_handle;
  state_notify();
}

export function state_notify() {
  for (const fn of state.listeners)
    fn();
}

const key_of = (path, tag) => `${path}|${tag}`;

export function value_original(pair, path, tag) {
  const section = pair.current.doc.sections.find(s => s.path === path);
  return section?.fields.find(f => f.tag === tag)?.value ?? null;
}

export function value_get(pair, path, tag) {
  const edits = state.edits.get(pair.id);
  const key = key_of(path, tag);
  if (edits?.has(key))
    return edits.get(key);
  return value_original(pair, path, tag);
}

function edit_put(pair, path, tag, value, original) {
  const edits = state.edits.get(pair.id) || new Map();
  const key = key_of(path, tag);
  if (String(value) === original)
    edits.delete(key);
  else
    edits.set(key, String(value));
  if (edits.size)
    state.edits.set(pair.id, edits);
  else
    state.edits.delete(pair.id);
}

export function value_set(pair, path, tag, value) {
  edit_put(pair, path, tag, value, value_original(pair, path, tag));
  state_notify();
}

// Many edits with one notify. A section lookup per field would make a
// whole-memory copy to many memories slow, so the originals come from
// one index of the current copy.
export function values_set_many(pair, list, notify = true) {
  const originals = new Map();
  for (const s of pair.current.doc.sections)
    for (const f of s.fields)
      originals.set(key_of(s.path, f.tag), f.value);
  let changed = 0;
  for (const { path, tag, value } of list) {
    const before = state.edits.get(pair.id)?.get(key_of(path, tag)) ?? originals.get(key_of(path, tag));
    if (String(value) !== before)
      changed++;
    edit_put(pair, path, tag, value, originals.get(key_of(path, tag)));
  }
  if (notify)
    state_notify();
  return changed;
}

export function value_changed(pair, path, tag) {
  return state.edits.get(pair.id)?.has(key_of(path, tag)) || false;
}

export function edits_revert(pair_id) {
  if (pair_id)
    state.edits.delete(pair_id);
  else
    state.edits.clear();
  state_notify();
}

export function edits_count() {
  let n = 0;
  for (const edits of state.edits.values())
    n += edits.size;
  return n;
}

// After an export that overwrote files in the loaded folder: each new copy
// becomes the current copy of its pair, the older current copy becomes the
// other copy, and the pair's edits are gone, so the app matches the disk.
export function exports_commit(files) {
  let n = 0;
  for (const f of files.filter(x => x.fresh)) {
    const pair = state.pair_by_id.get(rc0_name_parse(f.name)?.pair_id);
    if (!pair || pair.current.name === f.name)
      continue;
    const loaded = rc0_file_load(f.name, f.text);
    pair.next = pair.current;
    pair.current = loaded;
    state.edits.delete(pair.id);
    stats_add(state.stats, loaded.doc);
    n++;
  }
  state_notify();
  return n;
}
