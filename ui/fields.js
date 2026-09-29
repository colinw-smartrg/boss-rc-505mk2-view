import { h } from './dom.js';
import { section_map_get, value_format, value_options, value_label, widget_kind, status_text } from '../lib/field_map.js';
import { stats_range } from '../lib/rc0_stats.js';
import { state, value_get, value_set, value_changed, value_original } from './state.js';
import { link_state, link_label, link_twins, link_bit_twins } from './link.js';

function badge(entry, compact) {
  const status = entry?.status || 'unknown';
  const lines = [status_text[status]];
  if (entry?.source)
    lines.push(`Source: ${entry.source}`);
  if (entry?.note)
    lines.push(entry.note);
  return h('span', { class: `badge badge-${status}${compact ? ' dot' : ''}`, title: lines.join('\n') }, compact ? '' : status);
}

function range_get(entry, path, tag) {
  if (entry && entry.min !== undefined && entry.max !== undefined)
    return { min: entry.min, max: entry.max, seen: false };
  const seen = stats_range(state.stats, path, tag);
  return seen ? { ...seen, seen: true } : null;
}

const nbsp = '\u00a0';

// Pads each name so that the stored value lines up at the right edge of a
// monospace drop-down.
function option_labels(options) {
  if (options.length <= 2)
    return options.map(o => o.label);
  const parts = options.map(o => [o.label, `(${o.value})`]);
  const width = Math.max(...parts.map(([a, b]) => a.length + 1 + b.length));
  return parts.map(([a, b]) => a + nbsp.repeat(width - a.length - b.length) + b);
}

function widget_select(entry, options, value, on_set) {
  const labels = option_labels(options);
  const sel = h('select', { class: options.length > 2 ? 'valued' : '', onchange: () => on_set(sel.value) },
    options.map((o, i) => h('option', { value: String(o.value) }, labels[i])));
  if (!options.some(o => String(o.value) === value))
    sel.prepend(h('option', { value }, `${value} (outside the known range)`));
  sel.value = value;
  return sel;
}

function widget_bits(labels, value, original, on_set) {
  const n = Number(value);
  const links = link_state();
  const shown = labels.map((label, i) => ({ i, label: link_label(label, links) })).filter(b => b.label);
  // Bits above the labelled ones, and the hidden side of a linked pair,
  // are kept as they are.
  const shown_mask = shown.reduce((m, b) => m | (1 << b.i), 0);
  const kept = n & ~shown_mask;
  const twins = link_bit_twins(labels, links);
  const boxes = shown.map(({ i, label }) => {
    const box = h('input', { type: 'checkbox', checked: Boolean(n & (1 << i)) });
    box.addEventListener('change', () => {
      let v = kept;
      boxes.forEach((b, j) => {
        const bit = shown[j].i;
        const twin = twins.get(bit);
        if (twin !== undefined)
          v &= ~(1 << twin);
        if (b.firstChild.checked)
          v |= (1 << bit) | (twin !== undefined ? 1 << twin : 0);
      });
      // Back to the stored state of every shown bit: restore the whole
      // stored value, R twins included.
      const orig = Number(original);
      on_set((v & shown_mask) === (orig & shown_mask) ? orig : v);
    });
    return h('label', { class: 'bit' }, box, label);
  });
  return h('span', { class: 'bits' }, boxes);
}

function widget_number(entry, range, value, on_set) {
  const scale = entry?.display?.scale;
  const shown = scale ? (Number(value) * scale).toFixed(entry.display.digits ?? 0) : value;
  const input = h('input', { type: 'number', value: shown, step: scale || 1 });
  if (range) {
    input.min = scale ? range.min * scale : range.min;
    input.max = scale ? range.max * scale : range.max;
  }
  if (range?.seen)
    input.title = `Range limited to the values seen in the loaded files (${range.min}-${range.max}).`;
  input.addEventListener('change', () => {
    let v = input.value.trim() === '' ? NaN : Number(input.value);
    if (scale)
      v = Math.round(v / scale);
    const ok = Number.isInteger(v) && !(range && (v < range.min || v > range.max));
    input.classList.toggle('invalid', !ok);
    if (!ok) {
      input.title = range
        ? `Not stored: enter an integer from ${range.min} to ${range.max}${range.seen ? ' (the values seen in the loaded files)' : ''}.`
        : 'Not stored: enter an integer.';
      return;
    }
    on_set(v);
  });
  return input;
}

function widget_toggle(value, on_set) {
  const on = value === '1';
  return h('button', {
    class: `toggle${on ? ' on' : ''}`,
    onclick: () => on_set(on ? 0 : 1),
  }, on ? 'ON' : 'OFF');
}

// The decoded text on the left, the stored value on the right.
function slider_value_fill(el, entry, raw) {
  const text = value_format(entry, raw);
  el.replaceChildren(
    h('span', {}, text === String(raw) ? '' : text),
    h('span', { class: 'raw' }, text === String(raw) ? text : `(${raw})`));
}

function widget_slider(entry, value, on_set) {
  const input = h('input', { type: 'range', min: entry.min, max: entry.max, step: 1, value });
  const shown = h('span', { class: 'slider-value' });
  slider_value_fill(shown, entry, value);
  input.addEventListener('input', () => slider_value_fill(shown, entry, input.value));
  input.addEventListener('change', () => on_set(Number(input.value)));
  return h('span', { class: 'slider' }, input, shown);
}

function in_range(entry, value) {
  const n = Number(value);
  return value !== '' && Number.isInteger(n) && n >= entry.min && n <= entry.max;
}

function widget_build(entry, range, value, on_set, original) {
  const kind = widget_kind(entry);
  // A stored value outside the known range gets a plain widget that can
  // show it; a slider or a toggle would change it on the first touch.
  if ((kind === 'slider' || kind === 'toggle') && !in_range(entry, value))
    return widget_number(entry, range, value, on_set);
  if (kind === 'toggle')
    return widget_toggle(value, on_set);
  if (kind === 'slider')
    return widget_slider(entry, value, on_set);
  const options = kind === 'select' ? value_options(entry) : null;
  if (options)
    return widget_select(entry, options, value, on_set);
  if (kind === 'bits')
    return widget_bits(entry.display.bits, value, original, on_set);
  return widget_number(entry, range, value, on_set);
}

// Selects, toggles, sliders and bit boxes show the decoded value
// themselves; a number input needs it next to it.
function label_in_widget(entry) {
  return widget_kind(entry) !== 'number';
}

// A linked pair gets the edit on both sides. A revert of the L side
// reverts the R side to its own stored value.
function twins_set(pair, path, tag, entry) {
  const v = value_get(pair, path, tag);
  const reverted = !value_changed(pair, path, tag);
  for (const t of link_twins(path, tag, entry, link_state()))
    value_set(pair, t.path, t.tag, reverted ? value_original(pair, t.path, t.tag) : v);
}

// One control for one field: the widget cell, the decoded value for a
// number input, and a revert button.
function field_control(pair, path, field, entry, opts, on_refresh) {
  const range = range_get(entry, path, field.tag);
  const shown = h('span', { class: 'shown' });
  const with_shown = !label_in_widget(entry);
  const holder = h('span', { class: 'holder' });
  const cell = h('td', { class: 'widget' }, holder);
  const revert = h('button', { class: 'revert', title: 'Revert this field', onclick: () => on_set(value_original(pair, path, field.tag)) }, 'revert');

  function refresh() {
    const v = value_get(pair, path, field.tag);
    shown.textContent = with_shown && entry?.display ? value_format(entry, v) : '';
    on_refresh(value_changed(pair, path, field.tag));
  }

  function on_set(v) {
    value_set(pair, path, field.tag, v);
    twins_set(pair, path, field.tag, entry);
    holder.replaceChildren(widget_build(entry, range, value_get(pair, path, field.tag), on_set, value_original(pair, path, field.tag)));
    refresh();
    opts.on_change?.(field.tag);
  }

  holder.append(widget_build(entry, range, value_get(pair, path, field.tag), on_set, value_original(pair, path, field.tag)));
  return { cell, shown, revert, refresh };
}

export function field_row(pair, path, field, entry, opts = {}) {
  const row = h('tr', { class: entry ? '' : 'unmapped' });
  const ctl = field_control(pair, path, field, entry, opts, changed => row.classList.toggle('changed', changed));
  const base = (entry?.name && opts.name ? opts.name(entry.name) : entry?.name) || '?';
  const name = link_label(base, opts.links || {});
  if (opts.compact) {
    if (opts.wide?.includes(field.tag))
      row.classList.add('wide');
    row.append(
      h('td', { class: 'name', title: `Tag ${field.tag}` }, name, h('div', { class: 'sub-value' }, ctl.shown)),
      ctl.cell,
      h('td', { class: 'status' }, badge(entry, true), ctl.revert));
  } else {
    row.append(
      h('td', { class: 'tag' }, field.tag),
      h('td', { class: 'name' }, name),
      ctl.cell,
      h('td', { class: 'value' }, ctl.shown),
      h('td', { class: 'status' }, badge(entry, false), ctl.revert));
  }
  ctl.refresh();
  return row;
}

// A field whose name is the hidden side of a linked stereo pair.
function field_hidden(entry, opts) {
  const base = entry?.name && opts.name ? opts.name(entry.name) : entry?.name;
  return Boolean(base) && link_label(base, opts.links) === null;
}

// One row per tag, one column per section: the L and R sides of a stereo
// pair side by side, or one column if the pair is linked.
export function section_pair_table(pair, columns, opts = {}) {
  const [first] = columns;
  const section = pair.current.doc.sections.find(s => s.path === first.path);
  if (!section)
    return h('p', { class: 'missing' }, `No section ${first.path} in ${pair.current.name}.`);
  const map = section_map_get(first.path);
  const rows = section.fields.map(field => {
    const entry = map.fields.get(field.tag);
    const row = h('tr', { class: entry ? '' : 'unmapped' },
      h('td', { class: 'tag' }, field.tag),
      h('td', { class: 'name' }, entry?.name || '?'));
    for (const col of columns) {
      const col_field = { tag: field.tag };
      let ctl;
      ctl = field_control(pair, col.path, col_field, entry, opts, changed => ctl?.cell.classList.toggle('changed', changed));
      ctl.cell.append(ctl.shown, ctl.revert);
      row.append(ctl.cell);
      ctl.refresh();
    }
    row.append(h('td', { class: 'status' }, badge(entry, false)));
    return row;
  });
  return h('div', { class: 'section' },
    h('h4', {}, opts.title),
    h('table', { class: 'fields paired' },
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}), columns.map(c => h('th', {}, c.label)), h('th', {}))),
      h('tbody', {}, rows)));
}

export function section_table(pair, path, opts = {}) {
  const section = pair.current.doc.sections.find(s => s.path === path);
  if (!section)
    return h('p', { class: 'missing' }, `No section ${path} in ${pair.current.name}.`);
  const map = section_map_get(path);
  opts = { ...opts, links: opts.links || link_state() };
  const row_of = f => field_row(pair, path, f, map.fields.get(f.tag), opts);
  const fields = (opts.tags ? section.fields.filter(f => opts.tags.includes(f.tag)) : section.fields)
    .filter(f => !field_hidden(map.fields.get(f.tag), opts));
  const more = opts.more ? fields.filter(f => opts.more(f, map.fields.get(f.tag))) : [];
  const main = fields.filter(f => !more.includes(f));
  const table_class = `fields${opts.compact ? ' compact' : ''}`;
  return h('div', { class: 'section' },
    opts.title === false ? null : h('h4', {}, opts.title || section.name),
    map.note ? h('p', { class: 'note' }, map.note) : null,
    h('table', { class: table_class }, h('tbody', {}, main.map(row_of))),
    more.length ? h('details', { class: 'more' },
      h('summary', {}, `More fields (${more.length})`),
      h('table', { class: table_class }, h('tbody', {}, more.map(row_of)))) : null);
}

// Sections are built only when the user opens them, because one memory
// holds more than 2000 sections.
export function section_details(pair, path, title, on_change) {
  const details = h('details', { class: 'lazy' }, h('summary', {}, title || path.split('/').pop()));
  details.addEventListener('toggle', () => {
    if (details.open && details.children.length === 1)
      details.append(section_table(pair, path, { title: false, on_change }));
  });
  return details;
}
