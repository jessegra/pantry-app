/** "1 item", "3 items", "2 list entries". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How names compare for duplicates: case, surrounding and repeated spaces don't count. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Same-named records, grouped: each group's first row (in the given order) is the
 * one to keep, the rest are duplicates to merge into it. `scope` separates names
 * that may legitimately repeat (e.g. "Shelf 1" in two different location groups).
 */
export function findDuplicates<T extends { id: string; name: string }>(
  rows: T[],
  scope: (row: T) => string = () => '',
): Array<{ keep: T; merge: T[] }> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${scope(r)}\u0000${nameKey(r.name)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map(([keep, ...merge]) => ({ keep, merge }));
}
