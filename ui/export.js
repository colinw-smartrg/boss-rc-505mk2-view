import { h, clear } from './dom.js';
import { state } from './state.js';
import { export_set } from '../lib/rc0_file.js';

// Chrome stops a page after about 10 separate downloads.
export const download_limit = 10;

const pair_label = p => p.kind === 'system' ? 'System settings' : `Memory ${String(p.slot).padStart(2, '0')}`;

function radio(name, value, label, checked) {
  return h('label', { class: 'radio' }, h('input', { type: 'radio', name, value, checked }), label);
}

// The options panel for Export. on_run(files, format) writes the files.
export function export_panel(on_run, on_close) {
  const changed = state.pairs.filter(p => state.edits.has(p.id));
  const single = h('select', { class: 'export-single' },
    changed.length
      ? changed.map(p => h('option', { value: p.id }, `${pair_label(p)} (${state.edits.get(p.id).size} edits)`))
      : h('option', { value: '' }, 'No changed memories'));
  const scope_box = h('div', { class: 'export-row' },
    h('span', { class: 'export-label' }, 'What'),
    radio('export-scope', 'changed', 'Just changed', true),
    radio('export-scope', 'all', 'All (complete DATA folder)', false),
    radio('export-scope', 'single', 'Single file', false), single);
  const format_box = h('div', { class: 'export-row' },
    h('span', { class: 'export-label' }, 'Format'),
    radio('export-format', 'zip', 'One ZIP file', true),
    radio('export-format', 'files', window.showDirectoryPicker ? 'Separate files in a folder' : 'Separate downloads', false));
  const overwrite = h('input', { type: 'checkbox', class: 'export-overwrite' });
  const overwrite_box = h('div', { class: 'export-row' },
    h('span', { class: 'export-label' }),
    h('label', { class: 'radio' }, overwrite, 'Overwrite RC0 files in the chosen folder'));
  const summary = h('p', { class: 'export-summary' });
  const run = h('button', { class: 'primary' }, 'Export');
  const value_of = name => scope_box.parentNode?.querySelector(`input[name=${name}]:checked`)?.value
    || (name === 'export-scope' ? 'changed' : 'zip');

  let files = [];
  function refresh() {
    const scope = value_of('export-scope');
    single.disabled = scope !== 'single';
    // Only a folder write can replace files; a download gets a new name.
    overwrite_box.hidden = !(window.showDirectoryPicker && value_of('export-format') === 'files');
    try {
      files = export_set(state.pairs, state.edits, scope, single.value);
    } catch (e) {
      files = [];
      clear(summary, h('span', { class: 'msg-error' }, e.message));
      run.disabled = true;
      return;
    }
    const fresh = files.filter(f => f.fresh).length;
    const lines = [`${files.length} file${files.length === 1 ? '' : 's'}, ${fresh} with changes.`];
    if (!files.length)
      lines.push(' There are no changes to export.');
    if (!overwrite_box.hidden && overwrite.checked)
      lines.push(h('span', { class: 'msg-warn' }, ' Files with the same name in the chosen folder will be replaced. Pick the DATA folder itself, and keep a backup.'));
    if (value_of('export-format') === 'files' && !window.showDirectoryPicker && files.length > download_limit)
      lines.push(h('span', { class: 'msg-warn' }, ` Chrome stops a page after about ${download_limit} downloads; use a ZIP.`));
    clear(summary, lines);
    run.disabled = !files.length;
  }

  const panel = h('div', { class: 'card export-panel' },
    h('h4', {}, 'Export'), scope_box, format_box, overwrite_box, summary,
    h('div', { class: 'export-row' }, run, h('button', { onclick: on_close }, 'Cancel')));
  panel.addEventListener('change', refresh);
  // The list is built again at the click, so edits made while the panel
  // is open go out too.
  run.addEventListener('click', () => {
    refresh();
    if (files.length)
      on_run(files, value_of('export-format'), { overwrite: !overwrite_box.hidden && overwrite.checked });
  });
  queueMicrotask(refresh);
  return panel;
}
