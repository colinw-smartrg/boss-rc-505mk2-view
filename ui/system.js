import { h } from './dom.js';
import { section_table, section_details } from './fields.js';

const open_sections = ['sys/MIDI', 'sys/USB', 'sys/INPUT', 'sys/OUTPUT', 'sys/MIXER', 'sys/ROUTING'];

const group_defs = [
  ['Panel and pedal controls', /^sys\/(ICTL|ECTL)/],
  ['EQ', /^sys\/EQ_/],
  ['Setup and preferences', /^sys\/(SETUP|PREF|COLOR|MASTER_FX|FIXED_VALUE)$/],
];

export function system_view(pair) {
  const paths = pair.current.doc.sections.filter(s => s.parent === 'sys').map(s => s.path);
  const copies = [pair.current, pair.next].filter(Boolean)
    .map(c => `${c.name} (count ${c.doc.count.toString(16).toUpperCase().padStart(4, '0')})`);
  return h('div', { class: 'system' },
    h('header', { class: 'view-head' },
      h('div', { class: 'slot-num' }, 'SYS'),
      h('div', {},
        h('div', { class: 'title' }, 'System settings'),
        h('div', { class: 'sub' }, `Current copy: ${copies[0]}. Other copy: ${copies[1] || 'none'}.`))),
    h('section', { class: 'panels' },
      open_sections.filter(p => paths.includes(p)).map(p => h('div', { class: 'card' }, section_table(pair, p)))),
    h('section', { class: 'groups' },
      group_defs.map(([title, re]) => {
        const members = paths.filter(p => re.test(p));
        return h('details', { class: 'group' },
          h('summary', {}, `${title} (${members.length})`),
          members.map(p => section_details(pair, p)));
      })));
}
