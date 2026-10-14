// Quick add rules (SPEC §4.4). Pure.
import type { ID, Item, Timestamp } from './types';

export const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_LIMIT = 9;

/**
 * "Recent & frequent": items ranked by how often they were tapped or edited in the
 * last 30 days, most recent as tiebreak. Archived items are skipped. If there isn't
 * enough history (a new install), the grid is topped up with the newest items.
 */
export function rankRecent(
  events: Array<{ itemId: ID; at: Timestamp }>,
  items: Item[],
  now: Timestamp,
  limit = RECENT_LIMIT,
): Item[] {
  const live = new Map(items.filter((i) => i.archivedAt == null).map((i) => [i.id, i]));
  const stats = new Map<ID, { count: number; last: Timestamp }>();
  for (const e of events) {
    if (e.at < now - RECENT_WINDOW_MS || !live.has(e.itemId)) continue;
    const s = stats.get(e.itemId) ?? { count: 0, last: 0 };
    stats.set(e.itemId, { count: s.count + 1, last: Math.max(s.last, e.at) });
  }
  const ranked = [...stats.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .map(([id]) => live.get(id)!);
  const seen = new Set(ranked.map((i) => i.id));
  const fill = [...live.values()]
    .filter((i) => !seen.has(i.id))
    .sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
  return [...ranked, ...fill].slice(0, limit);
}

/**
 * Search matches: non-archived items whose name contains the query, case-insensitive.
 * Names starting with the query come first, then alphabetical.
 */
export function matchItems(items: Item[], query: string): Item[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return items
    .filter((i) => i.archivedAt == null && i.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => {
      const sa = a.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
      const sb = b.name.toLocaleLowerCase().startsWith(q) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
}

/** "tortillas " -> "Tortillas" for the Create row and the new item's name. */
export function nameFromQuery(query: string): string {
  const t = query.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}

/** True when an item already has exactly this name (so Enter shouldn't create a duplicate). */
export function hasExactMatch(items: Item[], query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return items.some((i) => i.archivedAt == null && i.name.toLocaleLowerCase() === q);
}
