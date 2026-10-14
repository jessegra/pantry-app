// Live read hooks. Each returns undefined while the first query is loading.
import { useLiveQuery } from 'dexie-react-hooks';
import { buildInventory, locationLabel, type InventorySection } from '../domain/inventory';
import { toRows, type Row } from '../domain/layout';
import { rankRecent } from '../domain/quickAdd';
import { groupListByStore, isSetUp, type StoreGroup } from '../domain/rules';
import type { ID, Item, ListEntry, Location, LocationGroup, Store } from '../domain/types';
import { repo } from './repo';

const { db } = repo;

const byOrder = <T extends { sortOrder: number }>(rows: T[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

export function useInitialized(): boolean | undefined {
  return useLiveQuery(() => repo.isInitialized(), []);
}

export interface InventoryData {
  sections: InventorySection[];
  /** Every non-archived item, for search and counts. */
  items: Item[];
}

export function useInventory(): InventoryData | undefined {
  return useLiveQuery(async () => {
    const [groups, locations, items, entries] = await Promise.all([
      db.groups.toArray(),
      db.locations.toArray(),
      db.items.toArray(),
      db.listEntries.toArray(),
    ]);
    return {
      sections: buildInventory(groups, locations, items, entries),
      items: items.filter((i) => i.archivedAt == null),
    };
  }, []);
}

export interface ItemData {
  item: Item;
  /** "Pantry · Shelf 1" */
  locationLabel: string;
  leftovers: Item[];
  parent?: Item;
  /** The unchecked list entry for this item, if any. */
  openEntry?: ListEntry;
}

/** null = no such item. */
export function useItem(id: ID | undefined): ItemData | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const item = await db.items.get(id);
    if (!item) return null;
    const [locations, groups, leftovers, parent, entries] = await Promise.all([
      db.locations.toArray(),
      db.groups.toArray(),
      db.items.where('parentId').equals(id).toArray(),
      item.parentId ? db.items.get(item.parentId) : undefined,
      db.listEntries.where('itemId').equals(id).toArray(),
    ]);
    return {
      item,
      locationLabel: locationLabel(item.locationId, locations, groups),
      leftovers: leftovers.filter((l) => l.archivedAt == null),
      parent,
      openEntry: entries.find((e) => !e.checked),
    };
  }, [id]);
}

export interface ShoppingListData {
  groups: StoreGroup[];
  /** Unchecked entries: the List tab badge. */
  remaining: number;
  itemsById: Map<ID, Item>;
}

export function useShoppingList(): ShoppingListData | undefined {
  return useLiveQuery(async () => {
    const [entries, stores, items] = await Promise.all([
      db.listEntries.toArray(),
      db.stores.toArray(),
      db.items.toArray(),
    ]);
    return {
      groups: groupListByStore(entries, stores),
      remaining: entries.filter((e) => !e.checked).length,
      itemsById: new Map(items.map((i) => [i.id, i])),
    };
  }, []);
}

export interface QuickAddData {
  /** Non-archived items. */
  items: Item[];
  /** Up to 9 for the Recent & frequent grid. */
  recent: Item[];
  /** "Pantry · Shelf 1" by item id. */
  whereById: Map<ID, string>;
}

export function useQuickAdd(): QuickAddData | undefined {
  return useLiveQuery(async () => {
    const [all, events, locations, groups] = await Promise.all([
      db.items.toArray(),
      db.activity.toArray(),
      db.locations.toArray(),
      db.groups.toArray(),
    ]);
    const items = all.filter((i) => i.archivedAt == null);
    return {
      items,
      // Only items with a bar: a tile tap adds one step, which means nothing untracked.
      recent: rankRecent(events, items.filter(isSetUp), Date.now()),
      whereById: new Map(items.map((i) => [i.id, locationLabel(i.locationId, locations, groups)])),
    };
  }, []);
}

export interface LocationSettingsRow {
  row: Row;
  name: string;
  /** Non-archived items stored here (locations only). */
  itemCount: number;
  /** Locations in the group (groups only). */
  childCount: number;
}

/** Settings → Locations: the flat, reorderable list (SPEC §4.7). */
export function useLocationSettings(): { rows: LocationSettingsRow[]; unassignedCount: number } | undefined {
  return useLiveQuery(async () => {
    const [layout, locations, groups, items] = await Promise.all([
      repo.currentLayout(),
      db.locations.toArray(),
      db.groups.toArray(),
      db.items.toArray(),
    ]);
    const live = items.filter((i) => i.archivedAt == null);
    const known = new Set(locations.map((l) => l.id));
    const names = new Map<ID, string>([...locations, ...groups].map((x) => [x.id, x.name]));
    return {
      rows: toRows(layout).map((row) => ({
        row,
        name: names.get(row.id) ?? '',
        itemCount: row.kind === 'location' ? live.filter((i) => i.locationId === row.id).length : 0,
        childCount: row.kind === 'group' ? locations.filter((l) => l.groupId === row.id).length : 0,
      })),
      unassignedCount: live.filter((i) => i.locationId == null || !known.has(i.locationId)).length,
    };
  }, []);
}

export interface StoreSettingsRow {
  store: Store;
  preferredFor: number;
  backupFor: number;
  /** List entries under this store. */
  entries: number;
}

export function useStoreSettings(): StoreSettingsRow[] | undefined {
  return useLiveQuery(async () => {
    const [stores, items, entries] = await Promise.all([db.stores.toArray(), db.items.toArray(), db.listEntries.toArray()]);
    const live = items.filter((i) => i.archivedAt == null);
    return byOrder(stores).map((store) => ({
      store,
      preferredFor: live.filter((i) => i.preferredStoreId === store.id).length,
      backupFor: live.filter((i) => i.secondaryStoreId === store.id).length,
      entries: entries.filter((e) => e.storeId === store.id).length,
    }));
  }, []);
}

/** Archived items, most recently archived first. */
export function useArchived(): Item[] | undefined {
  return useLiveQuery(async () => {
    const items = await db.items.where('archivedAt').above(0).toArray();
    return items.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  }, []);
}

export interface LocationsData {
  groups: LocationGroup[];
  locations: Location[];
}

export function useLocations(): LocationsData | undefined {
  return useLiveQuery(async () => {
    const [groups, locations] = await Promise.all([db.groups.toArray(), db.locations.toArray()]);
    return { groups: byOrder(groups), locations: byOrder(locations) };
  }, []);
}

export function useStores(): Store[] | undefined {
  return useLiveQuery(async () => byOrder(await db.stores.toArray()), []);
}
