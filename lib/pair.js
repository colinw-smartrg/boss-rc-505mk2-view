// The unit keeps two copies of each memory (A/B) and of the system
// settings (1/2). It loads the copy with the higher <count> and writes the
// next save over the other copy.

export function pair_select(first, second) {
  if (!first || !second) {
    const only = first || second;
    return { current: only, next: null };
  }
  if (second.doc.count > first.doc.count)
    return { current: second, next: first };
  return { current: first, next: second };
}
