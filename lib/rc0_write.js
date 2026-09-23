export const count_max = 0xffff;

export function rc0_edits_apply(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].end > sorted[i - 1].start)
      throw new Error(`overlapping edits at ${sorted[i].start}`);
  let out = text;
  for (const e of sorted) {
    if (!/^-?\d+$/.test(String(e.value)))
      throw new Error(`value "${e.value}" at ${e.start} is not an integer`);
    out = out.slice(0, e.start) + String(e.value) + out.slice(e.end);
  }
  return out;
}

export function rc0_count_format(n) {
  // The wrap rule of the unit after FFFF is not known, so refuse to guess.
  if (!Number.isInteger(n) || n < 0 || n > count_max)
    throw new Error(`count ${n} is outside 0000-FFFF`);
  return n.toString(16).toUpperCase().padStart(4, '0');
}

export function rc0_count_set(text, doc, n) {
  return text.slice(0, doc.count_start) + rc0_count_format(n) + text.slice(doc.count_end);
}
