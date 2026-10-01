import fs from 'fs';
import path from 'path';
import { text_from_bytes, text_to_bytes } from '../lib/bytes.js';
import { rc0_parse } from '../lib/rc0_parse.js';
import { rc0_edits_apply, rc0_count_format } from '../lib/rc0_write.js';
import { rc0_file_load, pairs_build, pair_export } from '../lib/rc0_file.js';
import { section_map_get, value_format, fx_type_name, widget_kind, value_label } from '../lib/field_map.js';
import { fx_params } from '../lib/field_map/fx.js';

const data_dir = process.env.RC0_DATA || '/sandbox/colinw/ROLAND/DATA';
let failures = 0;
let checks = 0;

function check(cond, message) {
  checks++;
  if (!cond) {
    failures++;
    console.log('FAIL', message);
  }
}

function files_load() {
  return fs.readdirSync(data_dir)
    .filter(n => /\.RC0$/i.test(n) && !/^RHYTHM/i.test(n))
    .sort()
    .map(n => ({ name: n, bytes: new Uint8Array(fs.readFileSync(path.join(data_dir, n))) }));
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

function test_pairs(files) {
  const pairs = pairs_build(files);
  const memories = pairs.filter(p => p.kind === 'memory');
  check(memories.length === 99, `expected 99 memory pairs, got ${memories.length}`);
  for (const p of pairs)
    check(p.current.doc.count > p.next.doc.count, `${p.id}: current copy does not have the higher count`);
  const by_id = Object.fromEntries(pairs.map(p => [p.id, p]));
  check(name_get(by_id.MEMORY002.current) === 'Gothassz    ', 'MEMORY002 current name');
  check(by_id.MEMORY002.current.name === 'MEMORY002B.RC0', 'MEMORY002 current is B');
  check(name_get(by_id.MEMORY007.current) === 'Memory07    ', 'MEMORY007 current name');
  check(by_id.MEMORY007.current.name === 'MEMORY007A.RC0', 'MEMORY007 current is A');
  check(by_id.SYSTEM.current.name === 'SYSTEM1.RC0', 'SYSTEM current is 1');
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

const raw = files_load();
check(raw.length === 200, `expected 200 RC0 files without RHYTHM, got ${raw.length}`);
test_round_trip(raw);
const files = raw.map(r => rc0_file_load(r.name, text_from_bytes(r.bytes)));
test_single_edit(files);
test_export(test_pairs(files));
test_field_map(files);
test_widgets();

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
