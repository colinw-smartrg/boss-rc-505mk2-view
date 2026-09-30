import { h, clear } from './dom.js';
import { section_table } from './fields.js';
import { value_get, value_changed } from './state.js';
import { field_map_get, value_format } from '../lib/field_map.js';

const count = 16;

function assign_cell(pair, n, picked, on_pick) {
  const path = `mem/ASSIGN${n}`;
  const on = value_get(pair, path, 'A') === '1';
  const source = value_format(field_map_get(path, 'C'), value_get(pair, path, 'C'));
  const target = value_format(field_map_get(path, 'H'), value_get(pair, path, 'H'));
  const section = pair.current.doc.sections.find(s => s.path === path);
  const changed = section?.fields.some(f => value_changed(pair, path, f.tag));
  return h('button', {
    class: `fx-cell assign-cell${on ? ' on' : ''}${changed ? ' changed' : ''}${picked === n ? ' picked' : ''}`,
    title: `ASSIGN${n}: ${source} -> ${target}`,
    onclick: () => on_pick(n),
  },
  h('span', { class: 'fx-slot' }, String(n)),
  h('span', { class: 'fx-type' }, source),
  h('span', { class: 'fx-sw' }, on ? 'ON' : 'OFF'));
}

export function assign_view(pair) {
  const grid = h('div', { class: 'assign-grid' });
  const detail = h('div', {});
  let picked = null;

  function render_grid() {
    clear(grid, Array.from({ length: count }, (_, i) => assign_cell(pair, i + 1, picked, pick)));
  }

  function pick(n) {
    picked = picked === n ? null : n;
    clear(detail, picked ? h('div', { class: 'card assign-detail' },
      section_table(pair, `mem/ASSIGN${picked}`, { title: `ASSIGN${picked}`, on_change: render_grid })) : null);
    render_grid();
  }

  render_grid();
  return h('section', { class: 'assign' }, h('h3', {}, 'Assign'), grid, detail);
}
