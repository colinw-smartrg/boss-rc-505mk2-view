import { state, value_get } from './state.js';
import { section_map_get } from '../lib/field_map.js';

// With STEREO LINK on, the unit shows one control for a stereo pair and
// operates on the L (or 1) settings only; it does not copy them to the R
// side (Parameter Guide pp. 9-13, confirmed by the user). The app copies
// an edit to the R side as well, so that the R side starts from the same
// values when the link is turned off.
// The system settings decide the link state here, because the guide
// default for PREFERENCE is SYSTEM.
const link_fields = [
  ['MIC', 'sys/INPUT', 'E'],
  ['INST1', 'sys/INPUT', 'F'],
  ['INST2', 'sys/INPUT', 'G'],
  ['MAIN', 'sys/OUTPUT', 'B'],
  ['SUB1', 'sys/OUTPUT', 'C'],
  ['SUB2', 'sys/OUTPUT', 'D'],
];

export const link_tags = { 'sys/INPUT': ['E', 'F', 'G'], 'sys/OUTPUT': ['B', 'C', 'D'] };

export function link_state() {
  const sys = state.pair_by_id.get('SYSTEM');
  const links = {};
  for (const [name, path, tag] of link_fields)
    links[name] = sys ? value_get(sys, path, tag) === '1' : false;
  return links;
}

// PHANTOM power stays per connector; the guide does not merge it.
const unlinked_re = /^(PHANTOM|STEREO LINK)/;
const mic_re = /\bMIC([12])\b/;
const pair_re = /\b(INST1|INST2|MAIN|SUB1|SUB2)-([LR])\b/;

// Returns the label to show, or null if the label is the hidden side of a
// linked pair.
export function link_label(label, links) {
  if (!label || unlinked_re.test(label))
    return label;
  let m = mic_re.exec(label);
  if (m && links.MIC)
    return m[1] === '1' ? label.replace(mic_re, 'MIC') : null;
  m = pair_re.exec(label);
  if (m && links[m[1]])
    return m[2] === 'L' ? label.replace(pair_re, m[1]) : null;
  return label;
}

// The R twin of an L label, or null if the label is not the L side of a
// linked pair.
export function link_twin_label(label, links) {
  if (!label || unlinked_re.test(label))
    return null;
  let m = mic_re.exec(label);
  if (m)
    return links.MIC && m[1] === '1' ? label.replace(mic_re, 'MIC2') : null;
  m = pair_re.exec(label);
  if (m)
    return links[m[1]] && m[2] === 'L' ? label.replace(pair_re, `${m[1]}-R`) : null;
  return null;
}

const eq_twins = {
  EQ_MIC1: ['MIC', 'EQ_MIC2'],
  EQ_INST1L: ['INST1', 'EQ_INST1R'],
  EQ_INST2L: ['INST2', 'EQ_INST2R'],
  EQ_MAINOUTL: ['MAIN', 'EQ_MAINOUTR'],
  EQ_SUBOUT1L: ['SUB1', 'EQ_SUBOUT1R'],
  EQ_SUBOUT2L: ['SUB2', 'EQ_SUBOUT2R'],
};

// The fields that take a copy of an edit to (path, tag): the same tag in
// the R section of an EQ pair, or the field named as the R twin in the
// same section.
export function link_twins(path, tag, entry, links) {
  const [parent, name] = path.split('/');
  const eq = eq_twins[name];
  if (eq)
    return links[eq[0]] ? [{ path: `${parent}/${eq[1]}`, tag }] : [];
  const twin_name = link_twin_label(entry?.name, links);
  if (!twin_name)
    return [];
  const twin = [...section_map_get(path).fields.values()].find(e => e.name === twin_name);
  return twin ? [{ path, tag: twin.tag }] : [];
}

// For a list of bit labels: Map(index of an L bit -> index of its R twin).
export function link_bit_twins(labels, links) {
  const out = new Map();
  labels.forEach((label, i) => {
    const j = labels.indexOf(link_twin_label(label, links));
    if (j >= 0)
      out.set(i, j);
  });
  return out;
}
