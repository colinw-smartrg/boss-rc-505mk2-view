import { h, clear } from './dom.js';
import { section_table, section_details } from './fields.js';
import { value_get, value_changed } from './state.js';
import { fx_type_name, field_map_get, value_format } from '../lib/field_map.js';
import { fx_seq_map } from '../lib/field_map/fx.js';

const banks = ['A', 'B', 'C', 'D'];

function slot_cell(pair, ctx, slot, active_bank, on_pick) {
  const path = `${ctx}/${slot}`;
  const on = value_get(pair, path, 'A') === '1';
  const type = fx_type_name(ctx, Number(value_get(pair, path, 'C')));
  const changed = pair.current.doc.sections.some(s =>
    s.path.startsWith(`${ctx}/${slot}`) && s.fields.some(f => value_changed(pair, s.path, f.tag)));
  return h('button', {
    class: `fx-cell${on ? ' on' : ''}${slot[0] === active_bank ? ' active-bank' : ''}${changed ? ' changed' : ''}`,
    title: `${ctx.toUpperCase()} bank ${slot[0]}, FX ${slot[1]}`,
    onclick: () => on_pick(slot),
  },
  h('span', { class: 'fx-slot' }, `${slot[0]}-${slot[1]}`),
  h('span', { class: 'fx-type' }, type ? type.replace(/_/g, ' ') : '?'),
  h('span', { class: 'fx-sw' }, on ? 'ON' : 'OFF'),
  insert_label(pair, path));
}

// INSERT is ALL in every slot of the sample data; show it only if not.
function insert_label(pair, path) {
  const v = value_get(pair, path, 'D');
  if (v === '0')
    return null;
  return h('span', { class: 'fx-insert' }, `INSERT ${value_format(field_map_get(path, 'D'), v)}`);
}

function slot_detail(pair, ctx, slot, on_slot_change, on_any_change) {
  const type = fx_type_name(ctx, Number(value_get(pair, `${ctx}/${slot}`, 'C')));
  const type_path = type ? `${ctx}/${slot}_${type}` : null;
  const seq_path = type && fx_seq_map[type] ? `${ctx}/${slot}_${fx_seq_map[type]}` : null;
  const others = pair.current.doc.sections
    .filter(s => s.path.startsWith(`${ctx}/${slot}_`) && s.path !== type_path && s.path !== seq_path);
  return h('div', { class: 'fx-detail' },
    h('div', { class: 'fx-detail-cols' },
      h('div', { class: 'card' }, section_table(pair, `${ctx}/${slot}`, { title: `Slot ${slot[0]}-${slot[1]}`, on_change: on_slot_change })),
      type_path ? h('div', { class: 'card' }, section_table(pair, type_path, { title: type.replace(/_/g, ' '), on_change: on_any_change })) : null,
      seq_path ? h('div', { class: 'card' }, section_table(pair, seq_path, { title: 'FX sequence', on_change: on_any_change })) : null),
    h('details', { class: 'group' },
      h('summary', {}, `Stored values for other FX types (${others.length})`),
      others.map(s => section_details(pair, s.path, s.name.slice(3).replace(/_/g, ' '), on_any_change))));
}

export function fx_view(pair, ctx, title) {
  const detail = h('div', {});
  let picked = null;
  const labels = new Map();
  const cells = new Map();

  // Each bank column holds its label, its bank settings and its 4 slots.
  // Only the label state and the slots are built again after an edit.
  const grid = h('div', { class: 'fx-grid' }, banks.map(b => {
    const label = h('div', { class: 'fx-bank-label' }, `BANK ${b}`);
    const slots = h('div', { class: 'fx-slots' });
    labels.set(b, label);
    cells.set(b, slots);
    return h('div', { class: 'fx-bank' },
      label,
      h('div', { class: 'fx-bank-setup' },
        section_table(pair, `${ctx}/${b}`, { title: false, compact: true, on_change: render_grid })),
      slots);
  }));

  function render_grid() {
    const active_bank = banks[Number(value_get(pair, `${ctx}/SETUP`, 'A'))] || 'A';
    for (const b of banks) {
      labels.get(b).classList.toggle('active-bank', b === active_bank);
      clear(cells.get(b), banks.map(s => slot_cell(pair, ctx, b + s, active_bank, pick)));
    }
    grid.querySelectorAll('.fx-cell').forEach(c => c.classList.toggle('picked', c.title.endsWith(`bank ${picked?.[0]}, FX ${picked?.[1]}`)));
  }

  function detail_render() {
    clear(detail, picked ? slot_detail(pair, ctx, picked, slot_change, render_grid) : null);
    render_grid();
  }

  // A new FX TYPE shows the parameters of that type; any slot edit
  // changes the grid cell.
  function slot_change(tag) {
    if (tag === 'C')
      detail_render();
    else
      render_grid();
  }

  function pick(slot) {
    picked = picked === slot ? null : slot;
    detail_render();
  }

  render_grid();
  return h('section', { class: 'fx' },
    h('h3', {}, title),
    h('div', { class: 'fx-setup' },
      section_table(pair, `${ctx}/SETUP`, { title: false, compact: true, on_change: render_grid })),
    grid,
    detail);
}
