// Dexie (IndexedDB) schema. See SPEC §2. Only the repository imports this.
import Dexie, { type EntityTable } from 'dexie';
import type { Item, ListEntry, Location, LocationGroup, Staple, Store } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class PantryDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  groups!: EntityTable<LocationGroup, 'id'>;
  stores!: EntityTable<Store, 'id'>;
  listEntries!: EntityTable<ListEntry, 'id'>;
  staples!: EntityTable<Staple, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'pantry') {
    super(name);
    // v1. Add migrations as new `this.version(n)` blocks below; never edit this one.
    // `checked` is boolean, which IndexedDB can't index, so it's filtered in memory.
    // null locationId/storeId aren't indexed either; Unassigned is derived, not queried.
    this.version(1).stores({
      items: 'id, locationId, parentId, archivedAt',
      locations: 'id, groupId',
      groups: 'id',
      stores: 'id',
      listEntries: 'id, itemId, storeId',
      staples: 'id',
      meta: 'key',
    });
  }
}

/** Bump with every new Dexie version. Also written to meta for export/import. */
export const SCHEMA_VERSION = 1;
