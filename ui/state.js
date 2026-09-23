import { stats_add } from '../lib/rc0_stats.js';

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

export function value_set(pair, path, tag, value) {
  const edits = state.edits.get(pair.id) || new Map();
  const key = key_of(path, tag);
  if (String(value) === value_original(pair, path, tag))
    edits.delete(key);
  else
    edits.set(key, String(value));
  if (edits.size)
    state.edits.set(pair.id, edits);
  else
    state.edits.delete(pair.id);
  state_notify();
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
