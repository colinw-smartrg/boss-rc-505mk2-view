// Folds the 16 FX slots (AA..DD) and the 4 banks (A..D) of a section path
// into one key, so that value ranges merge across slots.
export function section_key(section_path) {
  return section_path.replace(/\/[A-D][A-D]_/, '/*_').replace(/\/[A-D][A-D]$/, '/**').replace(/\/[A-D]$/, '/*');
}

// Map(section key -> Map(tag -> Map(value string -> count))).
export function stats_add(stats, doc) {
  for (const s of doc.sections) {
    const key = section_key(s.path);
    const tags = stats.get(key) || new Map();
    for (const f of s.fields) {
      const values = tags.get(f.tag) || new Map();
      values.set(f.value, (values.get(f.value) || 0) + 1);
      tags.set(f.tag, values);
    }
    stats.set(key, tags);
  }
  return stats;
}

export function stats_range(stats, section_path, tag) {
  const values = stats.get(section_key(section_path))?.get(tag);
  if (!values)
    return null;
  const nums = [...values.keys()].map(Number);
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
