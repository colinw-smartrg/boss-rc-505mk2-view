import { h, clear } from './dom.js';
import { state, values_set_many, state_notify } from './state.js';
import { copy_kinds, copy_plan, dest_list_parse, slot_list_format } from '../lib/copy.js';

const pair_id_of = slot => `MEMORY${String(slot).padStart(3, '0')}`;

// The destinations of a parsed list: loaded memories, slots that are not
// in the loaded folder, and memories with a copy that did not parse. The
// export refuses such a memory, so the copy leaves it out.
function dests_resolve(parsed) {
  const pairs = [];
  const absent = [];
  const broken = [];
  for (const slot of parsed.slots) {
    const pair = state.pair_by_id.get(pair_id_of(slot));
    if (!pair)
      absent.push(slot);
    else if (pair.broken?.length)
      broken.push(slot);
    else
      pairs.push(pair);
  }
  return { pairs, absent, broken };
}

// One index of the source values, with its edits: a value_get() per field
// searches the sections each time, which makes a copy to many memories slow.
function source_values(source) {
  const edits = state.edits.get(source.id);
  const values = new Map();
  for (const s of source.current.doc.sections)
    for (const f of s.fields) {
      const key = `${s.path}|${f.tag}`;
      values.set(key, edits?.get(key) ?? f.value);
    }
  return (path, tag) => values.get(`${path}|${tag}`);
}

function copy_apply(source, kind, dests) {
  const source_value = source_values(source);
  let fields = 0;
  let missing = 0;
  for (const dest of dests) {
    const plan = copy_plan(kind, source.current.doc, source_value, dest.current.doc);
    fields += values_set_many(dest, plan.edits, false);
    missing += plan.missing;
  }
  state_notify();
  return { fields, missing };
}

export function copy_panel(source) {
  const kind_sel = h('select', {}, Object.entries(copy_kinds).map(([k, v]) => h('option', { value: k }, v.label)));
  const note = h('p', { class: 'note' });
  const dest_in = h('input', { type: 'text', class: 'copy-dest', placeholder: 'for example 6,9,20,33-99' });
  const preview = h('p', { class: 'copy-preview' });
  const result = h('p', { class: 'copy-result' });
  const apply = h('button', { class: 'primary', disabled: true }, 'Copy');

  function refresh() {
    note.textContent = copy_kinds[kind_sel.value].note;
    result.textContent = '';
    if (!dest_in.value.trim()) {
      clear(preview);
      apply.disabled = true;
      return;
    }
    const parsed = dest_list_parse(dest_in.value, source.slot);
    const { pairs, absent, broken } = dests_resolve(parsed);
    const lines = [];
    if (parsed.errors.length)
      lines.push(h('span', { class: 'msg-error' }, parsed.errors.join(' ')));
    if (pairs.length)
      lines.push(h('span', {}, `To ${pairs.length} memor${pairs.length === 1 ? 'y' : 'ies'}: ${slot_list_format(pairs.map(p => p.slot))}.`));
    if (absent.length)
      lines.push(h('span', { class: 'msg-warn' }, `Not in the loaded folder, skipped: ${slot_list_format(absent)}.`));
    if (broken.length)
      lines.push(h('span', { class: 'msg-warn' }, `A copy of these memories did not parse, skipped: ${slot_list_format(broken)}.`));
    if (parsed.skipped_source)
      lines.push(h('span', {}, `Memory ${source.slot} is the source and is skipped.`));
    clear(preview, lines.flatMap((l, i) => i ? [' ', l] : [l]));
    apply.disabled = Boolean(parsed.errors.length) || !pairs.length;
  }

  apply.addEventListener('click', () => {
    const parsed = dest_list_parse(dest_in.value, source.slot);
    const { pairs } = dests_resolve(parsed);
    if (parsed.errors.length || !pairs.length)
      return;
    const kind = kind_sel.value;
    const label = copy_kinds[kind].label;
    apply.disabled = true;
    result.textContent = `Copying ${label} to ${pairs.length} memor${pairs.length === 1 ? 'y' : 'ies'} ...`;
    // Let the page show the line above before the copy blocks it.
    setTimeout(() => {
      const { fields, missing } = copy_apply(source, kind, pairs);
      result.textContent = `Copied ${label} of memory ${source.slot}, as it was at the time of the copy, to ${pairs.length} memor${pairs.length === 1 ? 'y' : 'ies'}: ${fields} field${fields === 1 ? '' : 's'} changed.`
        + (missing ? ` ${missing} source fields have no match in a destination file and were not copied.` : '')
        + ' Later edits of the source are not copied. Export writes the changed memories; Revert all undoes the copy.';
      apply.disabled = false;
    }, 30);
  });

  kind_sel.addEventListener('change', refresh);
  dest_in.addEventListener('input', refresh);
  refresh();
  return h('div', { class: 'card copy-panel' },
    h('h4', {}, `Copy from memory ${source.slot}`),
    h('div', { class: 'copy-row' }, h('label', {}, 'What ', kind_sel), h('label', {}, 'To memories ', dest_in), apply),
    note, preview, result);
}
