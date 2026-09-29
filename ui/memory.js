import { h } from './dom.js';
import { section_table, section_details } from './fields.js';
import { fx_view } from './fx.js';
import { value_get, value_set, value_changed } from './state.js';
import { value_format, field_map_get, sample_rate } from '../lib/field_map.js';

const name_len = 12;

export function memory_name(pair) {
  let s = '';
  for (const tag of 'ABCDEFGHIJKL')
    s += String.fromCharCode(Number(value_get(pair, 'mem/NAME', tag)));
  return s;
}

function name_editor(pair) {
  const input = h('input', { type: 'text', class: 'name-input', maxlength: name_len, value: memory_name(pair).trimEnd() });
  input.addEventListener('input', () => {
    // The unit stores printable ASCII and pads the name with spaces.
    const clean = input.value.replace(/[^\x20-\x7e]/g, '').slice(0, name_len);
    if (clean !== input.value)
      input.value = clean;
    const padded = clean.padEnd(name_len, ' ');
    [...'ABCDEFGHIJKL'].forEach((tag, i) => value_set(pair, 'mem/NAME', tag, padded.charCodeAt(i)));
    input.classList.toggle('changed', [...'ABCDEFGHIJKL'].some(tag => value_changed(pair, 'mem/NAME', tag)));
  });
  input.classList.toggle('changed', [...'ABCDEFGHIJKL'].some(tag => value_changed(pair, 'mem/NAME', tag)));
  return input;
}

function track_summary(pair, t) {
  const path = `mem/TRACK${t}`;
  const get = tag => Number(value_get(pair, path, tag));
  if (!get('W'))
    return 'empty';
  const seconds = get('X') / sample_rate;
  const measures = get('V') ? get('X') / get('V') : 0;
  return `${measures.toFixed(measures % 1 ? 2 : 0)} meas, ${seconds.toFixed(2)} s at ${(get('U') / 10).toFixed(1)} BPM`;
}

function level_bar(pair, t) {
  const path = `mem/TRACK${t}`;
  const level = Number(value_get(pair, path, 'D'));
  const pan = Number(value_get(pair, path, 'C'));
  return h('div', { class: 'meters' },
    h('div', { class: 'meter', title: `PLAY LEVEL ${level}` },
      h('div', { class: 'meter-fill', style: `width: ${level / 2}%` })),
    h('div', { class: 'pan', title: value_format(field_map_get(path, 'C'), pan) },
      h('div', { class: 'pan-dot', style: `left: ${pan}%` })));
}

// Recording data and unnamed fields go below the settings a user edits.
const track_record_tags = new Set(['S', 'U', 'V', 'W', 'X']);
const track_more = (field, entry) => !entry?.name || track_record_tags.has(field.tag);

function track_head(pair, t) {
  return h('div', {},
    h('div', { class: 'card-head' },
      h('span', { class: 'track-num' }, `TRACK ${t}`),
      h('span', { class: 'track-sum' }, track_summary(pair, t))),
    level_bar(pair, t));
}

function track_card(pair, t) {
  const path = `mem/TRACK${t}`;
  const head = track_head(pair, t);
  const card = h('div', { class: 'card track' }, head);
  const on_change = () => {
    head.replaceChildren(...track_head(pair, t).childNodes);
    card.classList.toggle('recorded', Number(value_get(pair, path, 'W')) === 1);
  };
  card.append(section_table(pair, path, { title: false, compact: true, wide: ['C', 'D'], on_change, more: track_more }));
  on_change();
  return card;
}

const group_defs = [
  ['Panel and pedal controls', /^mem\/(ICTL|ECTL)/],
  ['Assign', /^mem\/ASSIGN/],
  ['Input, output and mixer', /^mem\/(INPUT|OUTPUT|ROUTING|MIXER|MASTER_FX)$/],
  ['EQ', /^mem\/EQ_/],
  ['Other', /^mem\/(TRACK6|FIXED_VALUE)$/],
];

function group_details(pair) {
  const paths = pair.current.doc.sections.filter(s => s.parent === 'mem').map(s => s.path);
  return group_defs.map(([title, re]) => {
    const members = paths.filter(p => re.test(p));
    if (!members.length)
      return null;
    return h('details', { class: 'group' },
      h('summary', {}, `${title} (${members.length})`),
      members.map(p => section_details(pair, p)));
  });
}

function head_text(pair) {
  const tempo = value_format(field_map_get('mem/MASTER', 'A'), value_get(pair, 'mem/MASTER', 'A'));
  const copies = [pair.current, pair.next].filter(Boolean)
    .map(c => `${c.name} (count ${c.doc.count.toString(16).toUpperCase().padStart(4, '0')})`);
  return `${tempo}. Current copy: ${copies[0]}. Other copy: ${copies[1] || 'none'}.`;
}

export function memory_view(pair) {
  const sub = h('div', { class: 'sub' }, head_text(pair));
  return h('div', { class: 'memory' },
    h('header', { class: 'view-head' },
      h('div', { class: 'slot-num' }, String(pair.slot).padStart(2, '0')),
      h('div', {},
        name_editor(pair),
        sub)),
    h('section', { class: 'tracks' }, [1, 2, 3, 4, 5].map(t => track_card(pair, t))),
    h('section', { class: 'panels' },
      h('div', { class: 'card' }, section_table(pair, 'mem/MASTER', { on_change: () => { sub.textContent = head_text(pair); } })),
      h('div', { class: 'card' }, section_table(pair, 'mem/REC')),
      h('div', { class: 'card' }, section_table(pair, 'mem/PLAY')),
      h('div', { class: 'card' }, section_table(pair, 'mem/RHYTHM'))),
    fx_view(pair, 'ifx', 'Input FX'),
    fx_view(pair, 'tfx', 'Track FX'),
    h('section', { class: 'groups' }, group_details(pair)));
}
