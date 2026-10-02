// Copy of a whole memory, its assigns, or its Input or Track FX to other
// memories. A copy is a list of field edits on each destination, so it
// goes through the same Changes list and export as a hand edit.

export const slot_max = 99;

// "6,9,20,33-99" -> { slots: [6, 9, 20, 33, ..., 99], errors: [] }.
// The source slot is left out; a destination is listed once.
export function dest_list_parse(text, source_slot) {
  const slots = new Set();
  const errors = [];
  const items = String(text).split(',').map(s => s.trim()).filter(Boolean);
  if (!items.length)
    errors.push('No destination given.');
  for (const item of items) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(item);
    if (!m) {
      errors.push(`"${item}" is not a number or a range such as 33-99.`);
      continue;
    }
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to > slot_max || from > to) {
      errors.push(`"${item}" is outside 1-${slot_max} or runs backwards.`);
      continue;
    }
    for (let n = from; n <= to; n++)
      slots.add(n);
  }
  const skipped_source = slots.delete(source_slot);
  return { slots: [...slots].sort((a, b) => a - b), errors, skipped_source };
}

// [6, 9, 20, 33, 34, 35] -> "6, 9, 20, 33-35"
export function slot_list_format(slots) {
  const parts = [];
  for (let i = 0; i < slots.length; i++) {
    let j = i;
    while (j + 1 < slots.length && slots[j + 1] === slots[j] + 1)
      j++;
    parts.push(j > i + 1 ? `${slots[i]}-${slots[j]}` : slots.slice(i, j + 1).join(', '));
    i = j;
  }
  return parts.join(', ');
}

// The recording fields describe the audio in WAVE/NNN_T of the
// destination, so a whole-memory copy keeps them. TRACK S (measure count),
// U (recording tempo), V (measure length), W (phrase recorded) and X
// (phrase length) describe the phrase. In the sample data J (MEASURE) is
// S + 7 on every track with a phrase and 1 (FREE) on the empty tracks, and
// R and Y take one value on every empty track, so they follow the phrase
// as well. MASTER A (TEMPO), B and D give the loop: B is the measure
// length at tempo A. The NAME stays too, so the memory list stays readable.
const kept_tags = new Map([
  [/^mem\/TRACK[1-6]$/, new Set(['J', 'R', 'S', 'U', 'V', 'W', 'X', 'Y'])],
  [/^mem\/MASTER$/, new Set(['A', 'B', 'D'])],
]);

function memory_field_copied(path, tag) {
  if (path === 'mem/NAME')
    return false;
  for (const [re, tags] of kept_tags)
    if (re.test(path))
      return !tags.has(tag);
  return true;
}

export const copy_kinds = {
  memory: {
    label: 'Whole memory',
    note: 'All settings, Input FX, Track FX and assigns. The destination keeps its NAME, its TEMPO, and the fields of its tracks that follow the recording (MEASURE and the phrase data).',
    copied: (path, tag) => /^(mem|ifx|tfx)\//.test(path) && memory_field_copied(path, tag),
  },
  assign: {
    label: 'Assign',
    note: 'ASSIGN1-16.',
    copied: path => /^mem\/ASSIGN\d+$/.test(path),
  },
  ifx: {
    label: 'Input FX',
    note: 'All 4 banks and 16 slots, with the stored values of every FX type.',
    copied: path => path.startsWith('ifx/'),
  },
  tfx: {
    label: 'Track FX',
    note: 'All 4 banks and 16 slots, with the stored values of every FX type.',
    copied: path => path.startsWith('tfx/'),
  },
};

// The edits that make `dest_doc` hold the source values of one copy kind.
// `source_value(path, tag)` returns the source value (with its edits).
// A field that the destination file does not have is counted, not added.
export function copy_plan(kind, source_doc, source_value, dest_doc) {
  const copied = copy_kinds[kind].copied;
  const dest_fields = new Map();
  for (const s of dest_doc.sections)
    for (const f of s.fields)
      dest_fields.set(`${s.path}|${f.tag}`, true);
  const edits = [];
  let missing = 0;
  for (const s of source_doc.sections)
    for (const f of s.fields) {
      if (!copied(s.path, f.tag))
        continue;
      if (!dest_fields.has(`${s.path}|${f.tag}`)) {
        missing++;
        continue;
      }
      edits.push({ path: s.path, tag: f.tag, value: source_value(s.path, f.tag) });
    }
  return { edits, missing };
}
