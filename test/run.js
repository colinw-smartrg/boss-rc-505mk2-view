import fs from 'fs';
import path from 'path';
import { text_from_bytes, text_to_bytes } from '../lib/bytes.js';
import { rc0_parse } from '../lib/rc0_parse.js';
import { rc0_edits_apply, rc0_count_format } from '../lib/rc0_write.js';
import { rc0_file_load, pairs_build, pair_export, export_set } from '../lib/rc0_file.js';
import { section_map_get, value_format, fx_type_name, widget_kind, value_label, rhythm_pattern_entry } from '../lib/field_map.js';
import { fx_params } from '../lib/field_map/fx.js';
import { dest_list_parse, slot_list_format, copy_plan } from '../lib/copy.js';
import { zip_build, crc32 } from '../lib/zip.js';
import zlib from 'zlib';

// The live folder (a copy of the unit storage) changes after each save on
// the unit, so it feeds only the rule checks. The facts of one snapshot
// come from the fixture copy in the repo.
const data_dir = process.env.RC0_DATA || '/sandbox/colinw/ROLAND/DATA';
const fixture_dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures/DATA');
let failures = 0;
let checks = 0;

function check(cond, message) {
  checks++;
  if (!cond) {
    failures++;
    console.log('FAIL', message);
  }
}

function files_load(dir) {
  return fs.readdirSync(dir)
    .filter(n => /\.RC0$/i.test(n) && !/^RHYTHM/i.test(n))
    .sort()
    .map(n => ({ name: n, bytes: new Uint8Array(fs.readFileSync(path.join(dir, n))) }));
}

function name_get(file) {
  const s = file.doc.sections.find(x => x.path === 'mem/NAME');
  return s.fields.map(f => String.fromCharCode(+f.value)).join('');
}

function test_round_trip(raw) {
  for (const { name, bytes } of raw) {
    const text = text_from_bytes(bytes);
    const doc = rc0_parse(text);
    const out = text_to_bytes(rc0_edits_apply(text, []));
    check(Buffer.compare(Buffer.from(out), Buffer.from(bytes)) === 0, `${name}: round trip differs`);
    check(doc.sections.length > 0, `${name}: no sections`);
  }
}

function test_single_edit(files) {
  const file = files.find(f => f.name === 'MEMORY001A.RC0');
  const probes = ['mem/TRACK1|D', 'mem/NAME|A', 'ifx/AA_DELAY|A', 'tfx/DD_STEP_SLICER|#', 'mem/ASSIGN16|A'];
  for (const probe of probes) {
    const [p, tag] = probe.split('|');
    const section = file.doc.sections.find(s => s.path === p);
    const field = section?.fields.find(f => f.tag === tag);
    check(field, `${probe}: field missing`);
    if (!field)
      continue;
    const value = String(+field.value === 12345 ? 54321 : 12345);
    const text = rc0_edits_apply(file.text, [{ start: field.start, end: field.end, value }]);
    const doc = rc0_parse(text);
    let changed = 0;
    doc.sections.forEach((s, i) => s.fields.forEach((f, j) => {
      const before = file.doc.sections[i].fields[j];
      if (f.value !== before.value)
        changed++;
      if (s.path === p && f.tag === tag)
        check(f.value === value, `${probe}: new value not read back`);
    }));
    check(changed === 1, `${probe}: ${changed} fields changed, expected 1`);
    check(doc.count === file.doc.count, `${probe}: count changed`);
  }
}

function test_pair_rule(files) {
  const pairs = pairs_build(files);
  const memories = pairs.filter(p => p.kind === 'memory');
  check(memories.length === 99, `expected 99 memory pairs, got ${memories.length}`);
  for (const p of pairs)
    check(p.current.doc.count > p.next.doc.count, `${p.id}: current copy does not have the higher count`);
}

function test_fixture_pairs(files) {
  const by_id = Object.fromEntries(pairs_build(files).map(p => [p.id, p]));
  check(name_get(by_id.MEMORY002.current) === 'Gothassz    ', 'MEMORY002 current name');
  check(by_id.MEMORY002.current.name === 'MEMORY002B.RC0', 'MEMORY002 current is B');
  check(name_get(by_id.MEMORY007.current) === 'Memory07    ', 'MEMORY007 current name');
  check(by_id.MEMORY007.current.name === 'MEMORY007A.RC0', 'MEMORY007 current is A');
  check(by_id.SYSTEM.current.name === 'SYSTEM2.RC0', 'SYSTEM current is 2 (count 0304 against 0303)');
  return by_id;
}

function test_export(by_id) {
  const pair = by_id.MEMORY001;
  const out = pair_export(pair, new Map([['mem/TRACK1|D', '150']]));
  check(out.name === pair.next.name, `export name ${out.name}, expected ${pair.next.name}`);
  const expected_count = Math.max(pair.current.doc.count, pair.next.doc.count) + 1;
  check(out.count === expected_count, 'export count');
  const doc = rc0_parse(out.text);
  check(doc.count === expected_count, 'export count read back');
  const field = doc.sections.find(s => s.path === 'mem/TRACK1').fields.find(f => f.tag === 'D');
  check(field.value === '150', 'export value read back');
  const src_lines = pair.current.text.split('\n');
  const out_lines = out.text.split('\n');
  const diff = src_lines.filter((l, i) => l !== out_lines[i]).length;
  check(src_lines.length === out_lines.length && diff === 2, `export changed ${diff} lines, expected 2`);

  let threw = false;
  try {
    rc0_count_format(0x10000);
  } catch {
    threw = true;
  }
  check(threw, 'count above FFFF must throw');
  const full = { ...pair, current: { ...pair.current, doc: { ...pair.current.doc, count: 0xffff } } };
  threw = false;
  try {
    pair_export(full, new Map());
  } catch {
    threw = true;
  }
  check(threw, 'export from count FFFF must throw');

  const [single] = pairs_build([pair.current]);
  const single_out = pair_export(single, new Map());
  check(single_out.name === 'MEMORY001B.RC0', `one-copy export name ${single_out.name}, expected the missing copy MEMORY001B.RC0`);
  check(single_out.count === pair.current.doc.count + 1, 'one-copy export count');
  const [broken] = pairs_build([pair.current], ['MEMORY001B.RC0']);
  threw = false;
  try {
    pair_export(broken, new Map());
  } catch {
    threw = true;
  }
  check(threw, 'export of a pair with a copy that did not parse must throw');
}

// Every mapped tag must exist in the data, every stored value must be in
// the mapped range, and every FX type number must have a name.
function test_field_map(files) {
  const seen = new Map();
  for (const file of files)
    for (const s of file.doc.sections) {
      const key = s.path;
      const tags = seen.get(key) || new Map();
      for (const f of s.fields) {
        const values = tags.get(f.tag) || new Set();
        values.add(Number(f.value));
        tags.set(f.tag, values);
      }
      seen.set(key, tags);
    }

  const unmapped = new Set();
  for (const [path, tags] of seen) {
    const map = section_map_get(path);
    if (!map.fields.size) {
      unmapped.add(path.replace(/\d+/g, 'N'));
      continue;
    }
    for (const tag of map.fields.keys())
      check(tags.has(tag), `${path}: mapped tag ${tag} not in data`);
    for (const [tag, values] of tags) {
      const entry = map.fields.get(tag);
      if (map.kind === 'fx')
        check(entry, `${path}: FX tag ${tag} has no entry`);
      if (!entry || entry.min === undefined)
        continue;
      const bad = [...values].filter(n => n < entry.min || n > entry.max);
      check(!bad.length, `${path} ${tag} ${entry.name}: values ${bad.join(',')} outside ${entry.min}-${entry.max}`);
      for (const n of values)
        check(!/undefined|NaN/.test(value_format(entry, n)), `${path} ${tag}: bad format for ${n}`);
    }
    if (/^(ifx|tfx)\/[A-D][A-D]$/.test(path))
      for (const n of tags.get('C'))
        check(fx_type_name(path.slice(0, 3), n), `${path}: FX type ${n} has no name`);
  }
  const fx_in_data = new Set([...seen.keys()].map(p => /^(ifx|tfx)\/[A-D][A-D]_(.+)$/.exec(p)?.[2]).filter(Boolean));
  for (const fx of Object.keys(fx_params))
    check(fx_in_data.has(fx), `imported FX ${fx} has no section in the data`);
  console.log('sections without a field map:', [...unmapped].sort().join(' '));
}

// Every stored PATTERN must be in the list of its stored GENRE.
function test_rhythm_patterns(files) {
  for (const file of files.filter(f => f.name.startsWith('MEMORY'))) {
    const r = Object.fromEntries(file.doc.sections.find(s => s.path === 'mem/RHYTHM').fields.map(f => [f.tag, f.value]));
    const entry = rhythm_pattern_entry(r.A);
    check(entry.max !== undefined && Number(r.B) <= entry.max, `${file.name}: PATTERN ${r.B} outside genre ${r.A}`);
  }
  const name = (genre, n) => value_format(rhythm_pattern_entry(genre), n);
  check(name(18, 0) === 'ELCTRO01' && name(12, 9) === 'SIDE STICK' && name(19, 4) === '4/4 TRIPLE', 'PATTERN decodes per genre');
  const rhythm = section_map_get('mem/RHYTHM').fields;
  const names = [...'ABCDEFGHIJKLM'].map(t => rhythm.get(t)?.name || '?').join();
  check(names === 'GENRE,PATTERN,VARIATION,VAR.CHANGE,KIT,BEAT,FILL,INTRO REC,INTRO PLAY,ENDING,START TRIG,STOP TRIG,?', `RHYTHM field names: ${names}`);
  check([...'DGHIJKL'].every(t => rhythm.get(t).status === 'unit'), 'RHYTHM D and G-L have the unit status');
  check(widget_kind(rhythm_pattern_entry(0)) === 'select' && widget_kind(rhythm_pattern_entry(19)) === 'select', 'PATTERN is a drop-down');
}

function test_widgets() {
  const kind = (path, tag) => widget_kind(section_map_get(path).fields.get(tag));
  const cases = [
    ['mem/TRACK1', 'A', 'toggle'], ['mem/TRACK1', 'C', 'slider'], ['mem/TRACK1', 'D', 'slider'],
    ['mem/TRACK1', 'F', 'select'], ['mem/TRACK1', 'I', 'select'], ['mem/TRACK1', 'J', 'number'],
    ['mem/TRACK1', 'Q', 'bits'], ['mem/MASTER', 'A', 'number'], ['mem/RHYTHM', 'F', 'select'],
    ['sys/ROUTING', 'R', 'toggle'], ['sys/MIXER', 'B', 'toggle'], ['sys/EQ_MIC1', 'D', 'slider'],
    ['sys/ECTL_CTL1', 'B', 'select'], ['ifx/AA', 'C', 'select'], ['ifx/AA_DELAY', 'A', 'slider'],
    ['ifx/AA_TREMOLO', 'A', 'slider'], ['ifx/AA_PHASER', 'H', 'select'],
    ['ifx/A', 'A', 'select'], ['ifx/A', 'B', 'toggle'], ['ifx/A', 'C', 'select'],
    ['ifx/AA', 'B', 'select'], ['ifx/AA', 'D', 'select'], ['tfx/AA', 'D', 'select'],
  ];
  for (const [path, tag, want] of cases)
    check(kind(path, tag) === want, `${path} ${tag}: widget ${kind(path, tag)}, expected ${want}`);
  const track = section_map_get('mem/TRACK1').fields;
  check(value_label(track.get('C'), '50') === 'CENTER (50)', 'PAN label shows the stored value');
  check(value_label(track.get('D'), '100') === '100', 'a plain number shows once');
  check(section_map_get('sys/ROUTING').fields.get('R').name === 'PHONES MONITOR', 'ROUTING R is PHONES MONITOR');
  check(section_map_get('ifx/A').fields.get('C').name === 'KNOB', 'bank C is KNOB');
  const insert_count = ctx => section_map_get(`${ctx}/AA`).fields.get('D').max + 1;
  check(insert_count('ifx') === 7 && insert_count('tfx') === 6, 'INSERT has 7 Input FX and 6 Track FX values');
  check(value_format(section_map_get('tfx/DD').fields.get('D'), '5') === 'TRACK5', 'Track FX INSERT 5 is TRACK5');
  const target = section_map_get('mem/ASSIGN1').fields.get('H');
  const decoded = [0, 11, 22, 33, 44, 55, 57, 69, 714].map(n => value_format(target, n)).join();
  check(decoded === 'TRK1 REC/PLY,TRK2 REC/PLY,TRK3 REC/PLY,TRK4 REC/PLY,TRK5 REC/PLY,CUR.TRK REC/PLY,CUR.TRK STOP,ALL ST/STP,RHYTHM ST/STP', `ASSIGN TARGET decodes the sample values: ${decoded}`);
  const named = (entry, ns) => ns.map(n => value_format(entry, n)).join();
  check(named(target, [783, 789, 790, 917, 918, 919]) === 'EQ MAIN-L,PANEL MODE,MIDI CC#00,MIDI CC#127,INPUT THRU,IMM ST/STOP ALL', 'ASSIGN TARGET end of list matches the unit');
  check(target.max === 919, 'ASSIGN TARGET has 920 values');
  check(target.status === 'unit' && section_map_get('sys/MASTER_FX').fields.get('B').status === 'unit', 'ASSIGN TARGET and MASTER FX REVERB have the unit status');
  check(section_map_get('mem/ASSIGN1').fields.get('C').status === 'inferred', 'ASSIGN SOURCE stays inferred');
  const source = section_map_get('mem/ASSIGN1').fields.get('C');
  check(named(source, [0, 1, 5, 10, 16, 17, 59]) === 'TRK1 REC/DB,TRK2 REC/DB,TRK1 PLY/STP,SYNC ST/STP,TRK1 TR (PLY),TRK2 TR (PLY),MIDI CC#21', 'ASSIGN SOURCE runs each row through TRK1-5');
  check(widget_kind(target) === 'select' && widget_kind(section_map_get('mem/ASSIGN1').fields.get('C')) === 'select', 'ASSIGN SOURCE and TARGET are drop-downs');
}

function test_copy(by_id) {
  const p = dest_list_parse('6,9, 20,33-99,9', 1);
  check(p.errors.length === 0 && p.slots.length === 3 + 67 && p.slots[0] === 6 && p.slots.at(-1) === 99, 'dest list 6,9,20,33-99 gives 70 memories');
  check(slot_list_format(p.slots) === '6, 9, 20, 33-99', `dest list formats back: ${slot_list_format(p.slots)}`);
  const self = dest_list_parse('1-3', 2);
  check(self.skipped_source && self.slots.join() === '1,3', 'the source memory is left out');
  check(dest_list_parse('007,010-012', 1).slots.join() === '7,10,11,12', 'leading zeros are accepted, as in the file names');
  check(dest_list_parse('100', 1).errors[0]?.includes('outside 1-99'), '"100" is rejected as outside 1-99');
  check(dest_list_parse('33 - 35', 1).slots.join() === '33,34,35', 'spaces around the dash are accepted');
  for (const bad of ['0', '100', '5-3', 'a', '1-', ''])
    check(dest_list_parse(bad, 1).errors.length > 0, `dest list "${bad}" is rejected`);
  check(slot_list_format([1, 2, 4, 5, 6]) === '1, 2, 4-6', 'two neighbours stay a list, three or more become a range');

  const src = by_id.MEMORY001.current;
  const dst = by_id.MEMORY002.current;
  const value = (doc => (path, tag) => doc.sections.find(s => s.path === path).fields.find(f => f.tag === tag).value)(src.doc);
  const kinds = kind => new Set(copy_plan(kind, src.doc, value, dst.doc).edits.map(e => e.path.split('/')[0] + '/' + e.path.split('/')[1].replace(/\d+$/, 'N')));
  check([...kinds('assign')].join() === 'mem/ASSIGNN', 'Assign copies only ASSIGN1-16');
  check([...kinds('ifx')].every(k => k.startsWith('ifx/')) && [...kinds('tfx')].every(k => k.startsWith('tfx/')), 'Input FX and Track FX copy only their own sections');
  const memory = copy_plan('memory', src.doc, value, dst.doc).edits;
  const has = (path, tag) => memory.some(e => e.path === path && e.tag === tag);
  check(!memory.some(e => e.path === 'mem/NAME'), 'a whole-memory copy keeps the destination NAME');
  const kept = [['mem/TRACK1', 'JRSUVWXY'], ['mem/TRACK6', 'JRSUVWXY'], ['mem/MASTER', 'ABD']];
  check(kept.every(([path, tags]) => [...tags].every(t => !has(path, t))), 'a whole-memory copy keeps the recording fields, MEASURE and TEMPO');
  check(has('mem/TRACK1', 'D') && has('mem/TRACK1', 'Q') && has('mem/MASTER', 'C') && has('mem/RHYTHM', 'A') && has('ifx/AA', 'C') && has('mem/ASSIGN1', 'H'), 'a whole-memory copy takes the settings, FX and assigns');

  // The exported destination holds the source settings and its own NAME
  // and recording fields.
  const pair = by_id.MEMORY002;
  const edits = new Map(memory.map(e => [`${e.path}|${e.tag}`, e.value]).filter(([k, v]) => v !== value_of(pair.current.doc, k)));
  const out = rc0_parse(pair_export(pair, edits).text);
  const out_value = (path, tag) => value_of(out, `${path}|${tag}`);
  let same = 0;
  let differ = 0;
  for (const s of src.doc.sections)
    for (const f of s.fields) {
      const copied = memory.some(e => e.path === s.path && e.tag === f.tag);
      const want = copied ? f.value : value_of(dst.doc, `${s.path}|${f.tag}`);
      if (out_value(s.path, f.tag) === want)
        same++;
      else
        differ++;
    }
  const [broken] = pairs_build([by_id.MEMORY002.current], ['MEMORY002A.RC0']);
  check(broken.broken.length === 1, 'a pair with a copy that did not parse is marked, so a copy can skip it');
  check(differ === 0 && same > 10000, `exported copy matches field by field (${same} same, ${differ} differ)`);
}

function value_of(doc, key) {
  const [path, tag] = key.split('|');
  return doc.sections.find(s => s.path === path)?.fields.find(f => f.tag === tag)?.value;
}

// Reads back each entry of a ZIP from its central directory.
function zip_read(zip) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(at + 10, true);
    const crc = v.getUint32(at + 16, true);
    const csize = v.getUint32(at + 20, true);
    const name_len = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = Buffer.from(zip.subarray(at + 46, at + 46 + name_len)).toString('latin1');
    const data_at = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(data_at, data_at + csize);
    out.push({ name, crc, bytes: new Uint8Array(method === 8 ? zlib.inflateRawSync(data) : data) });
    at += 46 + name_len;
  }
  return out;
}

async function test_zip(raw) {
  check(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC-32 check value');
  const files = raw.map(r => ({ name: `ROLAND/DATA/${r.name}`, bytes: r.bytes }));
  const zip = await zip_build(files);
  const back = zip_read(zip);
  check(back.length === files.length, 'ZIP holds every file');
  for (let i = 0; i < files.length; i++) {
    const same = back[i].name === files[i].name && Buffer.compare(Buffer.from(back[i].bytes), Buffer.from(files[i].bytes)) === 0;
    check(same && back[i].crc === crc32(files[i].bytes), `${files[i].name}: ZIP entry reads back byte for byte`);
  }
  check(zip.length < files.reduce((n, f) => n + f.bytes.length, 0) / 5, 'ZIP compresses the RC0 files');
}

function test_export_set(by_id) {
  const pairs = Object.values(by_id);
  const edits = new Map([['MEMORY001', new Map([['mem/TRACK1|D', '150']])], ['MEMORY007', new Map([['mem/TRACK1|C', '40']])]]);
  const names = files => files.map(f => `${f.name}${f.fresh ? '*' : ''}`).join();
  check(names(export_set(pairs, edits, 'changed')) === 'MEMORY001B.RC0*,MEMORY007B.RC0*', 'Just changed exports the new copy of each changed memory');
  check(names(export_set(pairs, edits, 'single', 'MEMORY007')) === 'MEMORY007B.RC0*', 'Single file exports one changed memory');
  let threw = false;
  try {
    export_set(pairs, edits, 'single', 'MEMORY002');
  } catch {
    threw = true;
  }
  check(threw, 'Single file refuses a memory without changes');
  const all = export_set(pairs, edits, 'all');
  check(all.length === 10 && names(all) === 'MEMORY001A.RC0,MEMORY001B.RC0*,MEMORY002A.RC0,MEMORY002B.RC0,MEMORY007A.RC0,MEMORY007B.RC0*,MEMORY010A.RC0,MEMORY010B.RC0,SYSTEM1.RC0,SYSTEM2.RC0', `All gives a complete DATA folder: ${names(all)}`);
  const kept = all.find(f => f.name === 'MEMORY002A.RC0');
  check(kept.text === by_id.MEMORY002.next.text, 'All keeps an unchanged copy byte for byte');
  const new1 = all.find(f => f.name === 'MEMORY001B.RC0');
  check(rc0_parse(new1.text).count === by_id.MEMORY001.current.doc.count + 1, 'All writes a changed memory with the count + 1');
}

// exports_commit: after an overwrite of the loaded folder, the new copy is
// current, the older current copy is the other copy, and the edits are gone.
async function test_exports_commit(fixture_raw) {
  globalThis.requestAnimationFrame ??= fn => setTimeout(fn, 0);
  const { state, state_load, value_set, exports_commit } = await import('../ui/state.js');
  const pairs = pairs_build(fixture_raw.map(r => rc0_file_load(r.name, text_from_bytes(r.bytes))));
  state_load(pairs, null);
  const pair = state.pair_by_id.get('MEMORY001');
  const old_current = pair.current;
  value_set(pair, 'mem/TRACK1', 'D', '150');
  const files = export_set(state.pairs, state.edits, 'all');
  check(exports_commit(files) === 1, 'one pair takes its new copy');
  check(pair.current.name === 'MEMORY001B.RC0' && pair.next === old_current && !state.edits.has('MEMORY001'), 'the new copy is current and the edits are gone');
  check(pair.current.doc.count === old_current.doc.count + 1, 'the current count is the new count');
  check(pairs_build([pair.current, pair.next])[0].current.name === 'MEMORY001B.RC0', 'the A/B rule agrees with the new current copy');
  const again = export_set(state.pairs, new Map([['MEMORY001', new Map([['mem/TRACK1|D', '160']])]]), 'changed');
  check(again[0].name === 'MEMORY001A.RC0' && rc0_parse(again[0].text).count === old_current.doc.count + 2, 'the next export of that memory goes to the other copy with the count + 2');
}

const load = raw => raw.map(r => rc0_file_load(r.name, text_from_bytes(r.bytes)));

const raw = files_load(data_dir);
check(raw.length === 200, `expected 200 RC0 files without RHYTHM, got ${raw.length}`);
test_round_trip(raw);
const files = load(raw);
test_pair_rule(files);
test_field_map(files);
test_rhythm_patterns(files);
test_widgets();

const fixture_raw = files_load(fixture_dir);
check(fixture_raw.length === 10, `expected 10 fixture files, got ${fixture_raw.length}`);
test_round_trip(fixture_raw);
const fixture = load(fixture_raw);
test_single_edit(fixture);
const fixture_pairs = test_fixture_pairs(fixture);
test_export(fixture_pairs);
test_copy(fixture_pairs);
test_export_set(fixture_pairs);
await test_zip(fixture_raw);
await test_exports_commit(fixture_raw);

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
