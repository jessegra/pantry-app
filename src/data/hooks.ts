// Live read hooks. Each returns undefined while the first query is loading.
import { useLiveQuery } from 'dexie-react-hooks';
import { buildInventory, locationLabel, type InventorySection } from '../domain/inventory';
import { groupListByStore, type StoreGroup } from '../domain/rules';
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
