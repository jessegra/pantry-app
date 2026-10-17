// Dexie (IndexedDB) schema. See SPEC §2. Only the repository imports this.
import Dexie, { type EntityTable } from 'dexie';
import { defaultCategories } from '../domain/categories';
import { installSyncHooks, type Tombstone } from './sync/hooks';
import type { Category, ID, Item, ListEntry, Location, LocationGroup, Recipe, Staple, Store, Timestamp } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** One tap burst or edit on an item. Feeds Quick add's "Recent & frequent". Local only. */
export interface ActivityRow {
  id?: number;
  itemId: ID;
  at: Timestamp;
}

export class PantryDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  groups!: EntityTable<LocationGroup, 'id'>;
  stores!: EntityTable<Store, 'id'>;
  listEntries!: EntityTable<ListEntry, 'id'>;
  staples!: EntityTable<Staple, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  activity!: EntityTable<ActivityRow, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  tombstones!: Dexie.Table<Tombstone, [string, string]>;
  recipes!: EntityTable<Recipe, 'id'>;

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
    // v2 (M5): tap/edit log for Quick add's recent & frequent grid.
    this.version(2).stores({
      activity: '++id, itemId, at',
    });
    // v3: categories become user-maintained. Built-ins keep their old ids, so
    // existing items' `category` values still match.
    this.version(3)
      .stores({ categories: 'id' })
      .upgrade((tx) => tx.table('categories').bulkPut(defaultCategories(Date.now())));
    // v4 (sync): deletions waiting to be sent to the server.
    this.version(4).stores({ tombstones: '[tbl+id]' });
    // v5: recipes (docs/RECIPES_PLAN.md). Ingredients live inside the recipe record.
    this.version(5).stores({ recipes: 'id' });

    installSyncHooks(this);
  }
}

/** Bump with every new Dexie version. Also written to meta for export/import. */
export const SCHEMA_VERSION = 5;
