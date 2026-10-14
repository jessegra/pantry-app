// Shapes raw records into the Inventory screen's structure. Pure. See SPEC §4.1.
import { getStatus, isLowOrOut } from './rules';
import type { ID, Item, ItemStatus, ListEntry, Location, LocationGroup } from './types';

export interface InventoryRow {
  item: Item;
  status: ItemStatus;
  /** Has an unchecked shopping-list entry (shows the cart glyph). */
  onList: boolean;
}

export interface InventoryLocation {
  /** null = the Unassigned bucket for items whose location was deleted. */
  id: ID | null;
  name: string;
  rows: InventoryRow[];
  /** All items here, before any filter (the header count). */
  itemCount: number;
  lowCount: number;
}

export type InventorySection =
  | { kind: 'location'; location: InventoryLocation }
  | { kind: 'group'; group: LocationGroup; locations: InventoryLocation[]; lowCount: number };

export const UNASSIGNED_NAME = 'Unassigned';

/** Creation order, except a leftover sits directly after its parent when they share a location. */
export function orderRows(rows: InventoryRow[]): InventoryRow[] {
  const sorted = [...rows].sort((a, b) => a.item.createdAt - b.item.createdAt || a.item.name.localeCompare(b.item.name));
  const ids = new Set(sorted.map((r) => r.item.id));
  const childrenOf = new Map<ID, InventoryRow[]>();
  const top: InventoryRow[] = [];
  for (const r of sorted) {
    const p = r.item.parentId;
    if (r.item.isLeftover && p && ids.has(p)) childrenOf.set(p, [...(childrenOf.get(p) ?? []), r]);
    else top.push(r);
  }
  return top.flatMap((r) => [r, ...(childrenOf.get(r.item.id) ?? [])]);
}

/**
 * Sections in display order: ungrouped locations and groups share one top-level
 * ordering; a group's locations follow their own order. Archived items are hidden.
 * Unassigned comes last and only when it has items.
 */
export function buildInventory(
  groups: LocationGroup[],
  locations: Location[],
  items: Item[],
  entries: ListEntry[],
): InventorySection[] {
  const listed = new Set(entries.filter((e) => !e.checked && e.itemId).map((e) => e.itemId!));
  const known = new Set(locations.map((l) => l.id));
  const byLocation = new Map<ID | null, InventoryRow[]>();
  for (const item of items) {
    if (item.archivedAt != null) continue;
    const key = item.locationId != null && known.has(item.locationId) ? item.locationId : null;
    const row: InventoryRow = { item, status: getStatus(item), onList: listed.has(item.id) };
    byLocation.set(key, [...(byLocation.get(key) ?? []), row]);
  }

  const toView = (id: ID | null, name: string): InventoryLocation => {
    const rows = orderRows(byLocation.get(id) ?? []);
    return { id, name, rows, itemCount: rows.length, lowCount: rows.filter((r) => isLowOrOut(r.item)).length };
  };

  const groupIds = new Set(groups.map((g) => g.id));
  type Top = { sortOrder: number; section: InventorySection };
  const top: Top[] = [];
  for (const loc of locations) {
    if (loc.groupId != null && groupIds.has(loc.groupId)) continue;
    top.push({ sortOrder: loc.sortOrder, section: { kind: 'location', location: toView(loc.id, loc.name) } });
  }
  for (const group of groups) {
    const locs = locations
      .filter((l) => l.groupId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => toView(l.id, l.name));
    const lowCount = locs.reduce((n, l) => n + l.lowCount, 0);
    top.push({ sortOrder: group.sortOrder, section: { kind: 'group', group, locations: locs, lowCount } });
  }
  const sections = top.sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.section);

  if (byLocation.has(null)) sections.push({ kind: 'location', location: toView(null, UNASSIGNED_NAME) });
  return sections;
}

export type StatusFilter = 'all' | 'low' | 'out';

const passes = (row: InventoryRow, filter: StatusFilter) =>
  filter === 'all' ||
  (filter === 'out' ? row.status === 'out' : row.status === 'low' || row.status === 'out');

/**
 * Applies the search box and the All / Low / Out chips. With no query and "All",
 * everything shows (including empty locations). Otherwise locations and groups
 * with no matching rows are dropped. Search is case-insensitive, name contains.
 */
export function filterInventory(sections: InventorySection[], filter: StatusFilter, query: string): InventorySection[] {
  const q = query.trim().toLocaleLowerCase();
  if (filter === 'all' && !q) return sections;
  const keep = (loc: InventoryLocation): InventoryLocation | null => {
    const rows = loc.rows.filter((r) => passes(r, filter) && (!q || r.item.name.toLocaleLowerCase().includes(q)));
    return rows.length ? { ...loc, rows } : null;
  };
  return sections.flatMap((s): InventorySection[] => {
    if (s.kind === 'location') {
      const loc = keep(s.location);
      return loc ? [{ kind: 'location', location: loc }] : [];
    }
    const locations = s.locations.flatMap((l) => keep(l) ?? []);
    return locations.length ? [{ ...s, locations }] : [];
  });
}

/** Counts for the Low · n and Out · n chips. */
export function statusCounts(sections: InventorySection[]): { low: number; out: number } {
  const rows = sections.flatMap((s) => (s.kind === 'group' ? s.locations : [s.location])).flatMap((l) => l.rows);
  return {
    low: rows.filter((r) => r.status === 'low' || r.status === 'out').length,
    out: rows.filter((r) => r.status === 'out').length,
  };
}

/** "Pantry · Shelf 1" or "Refrigerator". */
export function locationLabel(locationId: ID | null, locations: Location[], groups: LocationGroup[]): string {
  const loc = locations.find((l) => l.id === locationId);
  if (!loc) return UNASSIGNED_NAME;
  const group = loc.groupId ? groups.find((g) => g.id === loc.groupId) : undefined;
  return group ? `${group.name} · ${loc.name}` : loc.name;
}
