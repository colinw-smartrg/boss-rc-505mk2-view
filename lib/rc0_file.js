import { rc0_parse } from './rc0_parse.js';
import { rc0_edits_apply, rc0_count_set } from './rc0_write.js';
import { pair_select } from './pair.js';

const file_re = /^(MEMORY(\d{3}))([AB])\.RC0$|^(SYSTEM)([12])\.RC0$/i;

export function rc0_name_parse(name) {
  const m = file_re.exec(name);
  if (!m)
    return null;
  if (m[1])
    return { pair_id: m[1].toUpperCase(), kind: 'memory', slot: parseInt(m[2], 10), copy: m[3].toUpperCase() };
  return { pair_id: 'SYSTEM', kind: 'system', slot: 0, copy: m[5] };
}

export function rc0_file_load(name, text) {
  return { name, text, doc: rc0_parse(text) };
}

function partner_name(name) {
  const info = rc0_name_parse(name);
  const other = { A: 'B', B: 'A', 1: '2', 2: '1' }[info.copy];
  return info.kind === 'memory' ? `${info.pair_id}${other}.RC0` : `SYSTEM${other}.RC0`;
}

// A pair groups the two copies of one memory or of the system settings.
// `broken` lists the names of copies that did not parse; the export of
// such a pair is refused, because the count of the broken copy is not
// known and the unit may load it instead of the export.
export function pairs_build(files, broken = []) {
  const groups = new Map();
  for (const file of files) {
    const info = rc0_name_parse(file.name);
    if (!info)
      continue;
    const group = groups.get(info.pair_id) || { id: info.pair_id, kind: info.kind, slot: info.slot, copies: [] };
    group.copies.push(file);
    groups.set(info.pair_id, group);
  }
  const pairs = [];
  for (const group of groups.values()) {
    group.copies.sort((a, b) => a.name.localeCompare(b.name));
    const { current, next } = pair_select(group.copies[0], group.copies[1]);
    pairs.push({ id: group.id, kind: group.kind, slot: group.slot, current, next, broken: [] });
  }
  for (const name of broken) {
    const info = rc0_name_parse(name);
    const pair = info && pairs.find(p => p.id === info.pair_id);
    if (pair)
      pair.broken.push(name);
  }
  pairs.sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
  return pairs;
}

// Edits map "path|tag" to a new value string, against pair.current.
export function pair_export(pair, edits) {
  if (pair.broken?.length)
    throw new Error(`${pair.id}: ${pair.broken.join(', ')} did not parse, so its count is not known`);
  const list = [];
  for (const [key, value] of edits) {
    const [path, tag] = key.split('|');
    const section = pair.current.doc.sections.find(s => s.path === path);
    const field = section?.fields.find(f => f.tag === tag);
    if (!field)
      throw new Error(`${pair.id}: no field ${key}`);
    list.push({ start: field.start, end: field.end, value });
  }
  const counts = [pair.current.doc.count];
  if (pair.next)
    counts.push(pair.next.doc.count);
  const count = Math.max(...counts) + 1;
  const edited = rc0_edits_apply(pair.current.text, list);
  const doc = rc0_parse(edited);
  const text = rc0_count_set(edited, doc, count);
  // The unit writes a save over the other copy; with one copy loaded, the
  // other copy is the missing file.
  const name = pair.next ? pair.next.name : partner_name(pair.current.name);
  return { name, text, count };
}
