import { h } from './dom.js';
import { section_map_get, value_format, value_options, value_label, widget_kind, status_text } from '../lib/field_map.js';
import { stats_range } from '../lib/rc0_stats.js';
import { state, value_get, value_set, value_changed, value_original } from './state.js';

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

function widget_select(entry, options, value, on_set) {
  const label = o => options.length > 2 ? value_label(entry, o.value) : o.label;
  const sel = h('select', { onchange: () => on_set(sel.value) },
    options.map(o => h('option', { value: String(o.value) }, label(o))));
  if (!options.some(o => String(o.value) === value))
    sel.prepend(h('option', { value }, `${value} (outside the known range)`));
  sel.value = value;
  return sel;
}

function widget_bits(labels, value, on_set) {
  const n = Number(value);
  // Bits above the labelled ones are kept as they are.
  const high = n & ~((1 << labels.length) - 1);
  const boxes = labels.map((label, i) => {
    const box = h('input', { type: 'checkbox', checked: Boolean(n & (1 << i)) });
    box.addEventListener('change', () => {
      let v = high;
      boxes.forEach((b, j) => {
        if (b.firstChild.checked)
          v |= 1 << j;
      });
      on_set(v);
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

function widget_slider(entry, value, on_set) {
  const input = h('input', { type: 'range', min: entry.min, max: entry.max, step: 1, value });
  const shown = h('span', { class: 'slider-value' }, value_label(entry, value));
  input.addEventListener('input', () => {
    shown.textContent = value_label(entry, input.value);
  });
  input.addEventListener('change', () => on_set(Number(input.value)));
  return h('span', { class: 'slider' }, input, shown);
}

function in_range(entry, value) {
  const n = Number(value);
  return value !== '' && Number.isInteger(n) && n >= entry.min && n <= entry.max;
}

function widget_build(entry, range, value, on_set) {
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
    return widget_bits(entry.display.bits, value, on_set);
  return widget_number(entry, range, value, on_set);
}

// Selects, toggles, sliders and bit boxes show the decoded value
// themselves; a number input needs it next to it.
function label_in_widget(entry) {
  return widget_kind(entry) !== 'number';
}

export function field_row(pair, path, field, entry, opts = {}) {
  const value = value_get(pair, path, field.tag);
  const range = range_get(entry, path, field.tag);
  const shown = h('span', { class: 'shown' });
  const row = h('tr', { class: entry ? '' : 'unmapped' });
  const revert = h('button', { class: 'revert', title: 'Revert this field', onclick: () => on_set(value_original(pair, path, field.tag)) }, 'revert');
  const with_shown = !label_in_widget(entry);

  function refresh() {
    const v = value_get(pair, path, field.tag);
    shown.textContent = with_shown && entry?.display ? value_format(entry, v) : '';
    row.classList.toggle('changed', value_changed(pair, path, field.tag));
  }

  function on_set(v) {
    value_set(pair, path, field.tag, v);
    widget_cell.replaceChildren(widget_build(entry, range, value_get(pair, path, field.tag), on_set));
    refresh();
    opts.on_change?.(field.tag);
  }

  const widget_cell = h('td', { class: 'widget' }, widget_build(entry, range, value, on_set));
  const name = (entry?.name && opts.name ? opts.name(entry.name) : entry?.name) || '?';
  if (opts.compact) {
    row.append(
      h('td', { class: 'name', title: `Tag ${field.tag}` }, name, h('div', { class: 'sub-value' }, shown)),
      widget_cell,
      h('td', { class: 'status' }, badge(entry, true), revert));
  } else {
    row.append(
      h('td', { class: 'tag' }, field.tag),
      h('td', { class: 'name' }, name),
      widget_cell,
      h('td', { class: 'value' }, shown),
      h('td', { class: 'status' }, badge(entry, false), revert));
  }
  refresh();
  return row;
}

export function section_table(pair, path, opts = {}) {
  const section = pair.current.doc.sections.find(s => s.path === path);
  if (!section)
    return h('p', { class: 'missing' }, `No section ${path} in ${pair.current.name}.`);
  const map = section_map_get(path);
  const row_of = f => field_row(pair, path, f, map.fields.get(f.tag), opts);
  const fields = opts.tags ? section.fields.filter(f => opts.tags.includes(f.tag)) : section.fields;
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
