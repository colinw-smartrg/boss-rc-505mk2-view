import { h } from './dom.js';
import { section_table, section_pair_table, section_details } from './fields.js';
import { link_state, link_label, link_tags } from './link.js';

const eq_pairs = {
  input: [['MIC', 'EQ_MIC1', 'EQ_MIC2', 'MIC1', 'MIC2'],
    ['INST1', 'EQ_INST1L', 'EQ_INST1R', 'INST1-L', 'INST1-R'],
    ['INST2', 'EQ_INST2L', 'EQ_INST2R', 'INST2-L', 'INST2-R']],
  output: [['MAIN', 'EQ_MAINOUTL', 'EQ_MAINOUTR', 'MAIN-L', 'MAIN-R'],
    ['SUB1', 'EQ_SUBOUT1L', 'EQ_SUBOUT1R', 'SUB1-L', 'SUB1-R'],
    ['SUB2', 'EQ_SUBOUT2L', 'EQ_SUBOUT2R', 'SUB2-L', 'SUB2-R']],
};

const group_defs = [
  ['Panel and pedal controls (ICTL)', /^sys\/ICTL/],
  ['Setup and preferences', /^sys\/(SETUP|PREF|COLOR|FIXED_VALUE)$/],
];

// One row per jack: CTL1,2/EXP1 and CTL3,4/EXP2 (p. 17).
const ectl_order = ['CTL1', 'CTL2', 'EXP1', 'CTL3', 'CTL4', 'EXP2'].map(n => `sys/ECTL_${n}`);

const strip = prefix => n => n.replace(prefix, '');

function eq_box(pair, [title, left, right, left_label, right_label], links) {
  const columns = [{ path: `sys/${left}`, label: link_label(left_label, links) }];
  if (link_label(right_label, links) !== null)
    columns.push({ path: `sys/${right}`, label: right_label });
  return h('div', { class: 'card' }, section_pair_table(pair, columns, { title: `EQ ${title}` }));
}

export function system_view(pair, rerender) {
  const links = link_state();
  const copies = [pair.current, pair.next].filter(Boolean)
    .map(c => `${c.name} (count ${c.doc.count.toString(16).toUpperCase().padStart(4, '0')})`);
  const paths = pair.current.doc.sections.filter(s => s.parent === 'sys').map(s => s.path);
  // A new STEREO LINK value changes which controls the other panels show.
  const link_change = path => tag => {
    if (link_tags[path].includes(tag))
      rerender();
  };
  const card = (path, opts = {}) => h('div', { class: 'card' }, section_table(pair, path, opts));

  return h('div', { class: 'system' },
    h('header', { class: 'view-head' },
      h('div', { class: 'slot-num' }, 'SYS'),
      h('div', {},
        h('div', { class: 'title' }, 'System settings'),
        h('div', { class: 'sub' }, `Current copy: ${copies[0]}. Other copy: ${copies[1] || 'none'}.`))),
    h('h3', { class: 'group-title' }, 'Input'),
    h('section', { class: 'panels' },
      card('sys/INPUT', { on_change: link_change('sys/INPUT') }),
      card('sys/MIXER', { title: 'MIXER INPUT', tags: [...'ABCDEFGHIJKL'] }),
      card('sys/ROUTING', { title: 'ROUTING INPUT', tags: [...'HIJKLMNOPQRS'], name: strip(/^INPUT -> /) }),
      eq_pairs.input.map(e => eq_box(pair, e, links))),
    h('h3', { class: 'group-title' }, 'Output'),
    h('section', { class: 'panels' },
      card('sys/OUTPUT', { on_change: link_change('sys/OUTPUT') }),
      card('sys/MASTER_FX', { title: 'MASTER FX' }),
      card('sys/MIXER', { title: 'MIXER OUTPUT', tags: [...'MNOPQRSTUV'] }),
      card('sys/ROUTING', { title: 'ROUTING OUTPUT', tags: [...'ABCDEFG'], name: strip(/^TRACK -> /) }),
      eq_pairs.output.map(e => eq_box(pair, e, links))),
    h('h3', { class: 'group-title' }, 'CTL/EXP'),
    h('section', { class: 'panels panels-3' },
      ectl_order.filter(p => paths.includes(p))
        .map(p => card(p, { title: p.replace('sys/ECTL_', '') }))),
    h('h3', { class: 'group-title' }, 'USB and MIDI'),
    h('section', { class: 'panels' }, card('sys/USB'), card('sys/MIDI')),
    h('section', { class: 'groups' },
      group_defs.map(([title, re]) => {
        const members = paths.filter(p => re.test(p));
        return h('details', { class: 'group' },
          h('summary', {}, `${title} (${members.length})`),
          members.map(p => section_details(pair, p)));
      })));
}
