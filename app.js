import { h, clear } from './ui/dom.js';
import { text_from_bytes, text_to_bytes } from './lib/bytes.js';
import { zip_build } from './lib/zip.js';
import { rc0_file_load, rc0_name_parse, pairs_build } from './lib/rc0_file.js';
import { export_panel } from './ui/export.js';
import { state, state_load, edits_count, edits_revert, exports_commit } from './ui/state.js';
import { memory_view, memory_name } from './ui/memory.js';
import { system_view } from './ui/system.js';
import { status_list, status_text, value_format, field_map_get } from './lib/field_map.js';
import { value_get } from './ui/state.js';

const el = {
  open: document.getElementById('open'),
  picker: document.getElementById('picker'),
  export_btn: document.getElementById('export'),
  revert_all: document.getElementById('revert-all'),
  info: document.getElementById('info'),
  list: document.getElementById('list'),
  view: document.getElementById('view'),
  changes: document.getElementById('changes'),
  legend: document.getElementById('legend'),
};

let selected = null;

function message(text, kind = 'info') {
  clear(el.info, h('span', { class: `msg msg-${kind}` }, text));
}

async function handle_files(dir_handle, prefix = '', depth = 0, out = []) {
  for await (const entry of dir_handle.values()) {
    if (entry.kind === 'directory' && depth < 3 && entry.name !== 'WAVE')
      await handle_files(entry, `${prefix}${entry.name}/`, depth + 1, out);
    else if (entry.kind === 'file' && rc0_name_parse(entry.name))
      out.push({ path: prefix + entry.name, file: await entry.getFile(), dir: dir_handle });
  }
  return out;
}

async function files_load(found, root_handle) {
  // Prefer files in a folder named DATA, as on the unit, when two folders
  // hold files with the same name. Names compare without case.
  const in_data = item => /(^|\/)DATA\/[^/]+$/i.test(item.path);
  found = [...found].sort((a, b) => in_data(b) - in_data(a) || a.path.localeCompare(b.path));
  const by_name = new Map();
  const dup = [];
  for (const item of found) {
    const name = item.path.split('/').pop().toUpperCase();
    if (by_name.has(name)) {
      dup.push(item.path);
      continue;
    }
    by_name.set(name, item);
  }
  const loaded = [];
  const errors = [];
  const broken = [];
  for (const [name, item] of by_name) {
    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      loaded.push(rc0_file_load(name, text_from_bytes(bytes)));
    } catch (e) {
      errors.push(`${item.path}: ${e.message}`);
      broken.push(name);
    }
  }
  if (!loaded.length) {
    message('No MEMORY*.RC0 or SYSTEM*.RC0 files found. Pick the ROLAND folder or its DATA folder.', 'error');
    return;
  }
  const data_dirs = [...new Set(found.map(i => i.dir).filter(Boolean))];
  state_load(pairs_build(loaded, broken), { root: root_handle, data_dirs });
  selected = (state.pairs.find(p => p.kind === 'memory') || state.pairs[0])?.id;
  const notes = [`Loaded ${loaded.length} files.`];
  if (dup.length)
    notes.push(`Ignored ${dup.length} files with duplicate names (first: ${dup[0]}).`);
  if (errors.length)
    notes.push(`${errors.length} files did not parse, and their memories cannot be exported (first: ${errors[0]}).`);
  message(notes.join(' '), errors.length || dup.length ? 'warn' : 'info');
  render();
}

async function folder_open() {
  if (!window.showDirectoryPicker) {
    el.picker.click();
    return;
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' });
  } catch {
    return;
  }
  await files_load(await handle_files(handle), handle);
}

el.picker.addEventListener('change', () => {
  const found = [...el.picker.files]
    .filter(f => rc0_name_parse(f.name))
    .map(f => ({ path: f.webkitRelativePath || f.name, file: f, dir: null }));
  files_load(found, null);
});

function pair_label(p) {
  if (p.kind === 'system')
    return 'System settings';
  return memory_name(p).trimEnd() || '(no name)';
}

function list_render() {
  clear(el.list, state.pairs.map(p => {
    const n = state.edits.get(p.id)?.size || 0;
    return h('button', {
      class: `list-item${p.id === selected ? ' selected' : ''}${n ? ' changed' : ''}`,
      onclick: () => {
        selected = p.id;
        render();
      },
    },
    h('span', { class: 'list-num' }, p.kind === 'system' ? 'SYS' : String(p.slot).padStart(2, '0')),
    h('span', { class: 'list-name' }, pair_label(p)),
    h('span', { class: 'list-meta' },
      p.kind === 'memory' ? value_format(field_map_get('mem/MASTER', 'A'), value_get(p, 'mem/MASTER', 'A')).replace(' BPM', '') : '',
      h('span', { class: 'list-copy', title: 'Current copy and its count' },
        `${p.current.name.replace(/^(MEMORY\d{3}|SYSTEM)/, '').replace('.RC0', '')} ${p.current.doc.count.toString(16).toUpperCase().padStart(4, '0')}`)),
    n ? h('span', { class: 'list-edits', title: `${n} changed fields` }, n) : null);
  }));
}

const changes_shown = 20;

// One block per memory, with its first edits; a copy to many memories
// makes thousands of edits, which a flat list cannot show.
function changes_render() {
  const n = edits_count();
  el.export_btn.disabled = !state.pairs.length;
  el.revert_all.disabled = !n;
  el.export_btn.textContent = n ? `Export (${state.edits.size} changed)` : 'Export';
  const blocks = [];
  for (const [id, edits] of state.edits) {
    const pair = state.pair_by_id.get(id);
    const rows = [];
    for (const [key, value] of edits) {
      if (rows.length === changes_shown)
        break;
      const [path, tag] = key.split('|');
      const old = pair.current.doc.sections.find(s => s.path === path)?.fields.find(f => f.tag === tag)?.value;
      rows.push(h('li', {}, `${path.replace(/^(mem|sys)\//, '')} ${tag}: ${old} -> ${value}`));
    }
    if (edits.size > changes_shown)
      rows.push(h('li', { class: 'muted' }, `... and ${edits.size - changes_shown} more`));
    blocks.push(h('div', { class: 'change-block' },
      h('div', { class: 'change-head' }, `${id} (${edits.size})`),
      h('ul', {}, rows)));
  }
  clear(el.changes, blocks.length ? blocks : h('p', { class: 'muted' }, 'No changes.'));
}

function view_render() {
  const pair = state.pair_by_id.get(selected);
  if (!pair) {
    clear(el.view, h('p', { class: 'muted' }, 'Open the ROLAND folder of the unit (or a copy of it) to start.'));
    return;
  }
  clear(el.view, pair.kind === 'system' ? system_view(pair, view_render) : memory_view(pair));
}

function render() {
  list_render();
  changes_render();
  view_render();
}

async function dir_is_source(out) {
  const src = state.source_handle;
  if (!src)
    return false;
  for (const handle of [src.root, ...src.data_dirs])
    if (handle && await out.isSameEntry(handle))
      return true;
  return false;
}

// An output folder that already holds RC0 files may be a copy of the unit
// storage, so the export does not write into it.
async function dir_has_rc0(out) {
  for await (const entry of out.values())
    if (entry.kind === 'file' && rc0_name_parse(entry.name))
      return true;
  return false;
}

function blob_download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function zip_name(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `rc505-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

const export_holder = h('div', { class: 'export-holder' });
document.querySelector('.top').after(export_holder);

function export_close() {
  clear(export_holder);
}

function export_toggle() {
  if (export_holder.firstChild) {
    export_close();
    return;
  }
  clear(export_holder, export_panel(export_write, export_close));
}

const count_text = n => n.toString(16).toUpperCase().padStart(4, '0');

async function dir_has_data(out) {
  for await (const entry of out.values())
    if (entry.kind === 'directory' && entry.name.toUpperCase() === 'DATA')
      return true;
  return false;
}

async function file_exists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

// Writes the files into a folder the user picks. Without `overwrite`, a
// folder that holds RC0 files is refused, because it may be a copy of the
// unit storage. With it, a folder that holds a DATA folder is refused: the
// files belong inside DATA.
async function export_folder(files, overwrite) {
  let out;
  try {
    out = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null;
  }
  const is_source = await dir_is_source(out);
  if (!overwrite && (is_source || await dir_has_rc0(out))) {
    message('This folder holds RC0 files. Pick another folder, or turn on "Overwrite RC0 files" in the Export panel.', 'error');
    return null;
  }
  if (overwrite && await dir_has_data(out)) {
    message('This folder holds a DATA folder. Pick the DATA folder itself, so the files land where the unit reads them.', 'error');
    return null;
  }
  const written = [];
  let replaced = 0;
  try {
    for (const f of files) {
      if (await file_exists(out, f.name))
        replaced++;
      const handle = await out.getFileHandle(f.name, { create: true });
      const w = await handle.createWritable();
      await w.write(text_to_bytes(f.text));
      await w.close();
      written.push(f.name);
    }
  } catch (e) {
    message(`Export failed after ${written.length} of ${files.length} files (${written.join(', ') || 'none'}): ${e.message}`, 'error');
    return null;
  }
  return { replaced, is_source };
}

async function export_write(files, format, options = {}) {
  const fresh = files.filter(f => f.fresh);
  const fresh_text = fresh.length ? ` New copies: ${fresh.map(f => `${f.name} (count ${count_text(f.count)})`).join(', ')}.` : '';
  const n = `${files.length} file${files.length > 1 ? 's' : ''}`;
  if (format === 'zip') {
    const name = zip_name();
    message(`Packing ${n} ...`);
    const zip = await zip_build(files.map(f => ({ name: `ROLAND/DATA/${f.name}`, bytes: text_to_bytes(f.text) })));
    blob_download(name, zip, 'application/zip');
    message(`Downloaded ${name} with ${n} in ROLAND/DATA/. Unzip it at the top of the unit storage, so each file replaces the file with the same name.${fresh_text}`);
    export_close();
    return;
  }
  if (window.showDirectoryPicker) {
    const done = await export_folder(files, options.overwrite);
    if (!done)
      return;
    const replaced = done.replaced ? ` ${done.replaced} existing file${done.replaced > 1 ? 's were' : ' was'} replaced.` : '';
    // The loaded folder now holds the new copies; take them as current.
    const committed = done.is_source ? exports_commit(files) : 0;
    const commit_text = committed ? ` The new copies are now the current copies of ${committed} memor${committed > 1 ? 'ies' : 'y'}.` : '';
    message(`Exported ${n}.${replaced}${fresh_text}${commit_text}`);
    export_close();
    if (committed)
      render();
    return;
  }
  files.forEach(f => blob_download(f.name, text_to_bytes(f.text), 'application/octet-stream'));
  message(`Downloaded ${n} as separate files. The browser can rename a file if the download folder holds one with the same name; check the names before you copy them to the unit.${fresh_text}`, 'warn');
  export_close();
}

el.open.addEventListener('click', folder_open);
el.export_btn.addEventListener('click', export_toggle);
el.revert_all.addEventListener('click', () => {
  edits_revert(null);
  render();
});

let list_pending = false;
state.listeners.add(() => {
  changes_render();
  if (list_pending)
    return;
  list_pending = true;
  requestAnimationFrame(() => {
    list_pending = false;
    list_render();
  });
});

clear(el.legend, status_list.map(s => h('li', {}, h('span', { class: `badge badge-${s}` }, s), ' ', status_text[s])));
render();
