// Live read hooks. Each returns undefined while the first query is loading.
import { useLiveQuery } from 'dexie-react-hooks';
import { buildInventory, locationLabel, type InventorySection } from '../domain/inventory';
import { toRows, type Row } from '../domain/layout';
import { rankRecent } from '../domain/quickAdd';
import { checkRecipe, missingForShopping, pantryContext, type RecipeCheck } from '../domain/recipeMatch';
import { groupListByStore, isSetUp, type StoreGroup } from '../domain/rules';
import type { ID, Item, ListEntry, Location, LocationGroup, Recipe, Staple, Store } from '../domain/types';
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
    const [stores, items, entries] = await Promise.all([
      db.stores.toArray(),
      db.items.toArray(),
      db.listEntries.toArray(),
    ]);
    const live = items.filter((i) => i.archivedAt == null);
    return byOrder(stores).map((store) => ({
      store,
      preferredFor: live.filter((i) => i.preferredStoreId === store.id).length,
      backupFor: live.filter((i) => i.secondaryStoreId === store.id).length,
      entries: entries.filter((e) => e.storeId === store.id).length,
    }));
  }, []);
}

/** Non-archived items per category id, for Settings → Categories. */
export function useCategoryCounts(): Map<ID, number> | undefined {
  return useLiveQuery(async () => {
    const counts = new Map<ID, number>();
    for (const i of await db.items.toArray()) {
      if (i.archivedAt == null) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    }
    return counts;
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

// ---------- Recipes ----------

export interface RecipeView {
  recipe: Recipe;
  check: RecipeCheck;
}

export interface RecipesData {
  /** Alphabetical. */
  recipes: RecipeView[];
  /** Every tag in use, alphabetical. */
  tags: string[];
}

/** All recipes, each checked against the pantry; updates as the pantry changes. */
export function useRecipes(): RecipesData | undefined {
  return useLiveQuery(async () => {
    const [recipes, items, staples] = await Promise.all([
      db.recipes.toArray(),
      db.items.toArray(),
      db.staples.toArray(),
    ]);
    const ctx = pantryContext(items, staples);
    const views = recipes
      .map((recipe) => ({ recipe, check: checkRecipe(recipe, ctx) }))
      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
    const tags = [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
    return { recipes: views, tags };
  }, []);
}

export interface RecipeData extends RecipeView {
  /** For naming linked items and substitutes. */
  itemsById: Map<ID, Item>;
  /** What "Add missing to list" would add right now (nothing already listed). */
  toAdd: Array<{ itemId?: ID; name: string }>;
}

/** null = no such recipe. */
export function useRecipe(id: ID | undefined): RecipeData | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const recipe = await db.recipes.get(id);
    if (!recipe) return null;
    const [items, staples, entries] = await Promise.all([
      db.items.toArray(),
      db.staples.toArray(),
      db.listEntries.toArray(),
    ]);
    const ctx = pantryContext(items, staples);
    return {
      recipe,
      check: checkRecipe(recipe, ctx),
      itemsById: new Map(items.map((i) => [i.id, i])),
      toAdd: missingForShopping(recipe, ctx, entries),
    };
  }, [id]);
}

export interface RecipeEditData {
  /** undefined when adding a new recipe. */
  recipe?: Recipe;
  /** Live pantry items (not leftovers), by name: what an ingredient can link to. */
  items: Item[];
  staples: Staple[];
  /** Every tag in use, for the tag chips. */
  tags: string[];
}

/** What the recipe editor needs. null = editing a recipe that no longer exists. */
export function useRecipeEdit(id: ID | undefined): RecipeEditData | null | undefined {
  return useLiveQuery(async () => {
    const [recipes, items, staples] = await Promise.all([
      db.recipes.toArray(),
      db.items.toArray(),
      db.staples.toArray(),
    ]);
    const recipe = id ? recipes.find((r) => r.id === id) : undefined;
    if (id && !recipe) return null;
    return {
      recipe,
      items: items.filter((i) => !i.isLeftover && i.archivedAt == null).sort((a, b) => a.name.localeCompare(b.name)),
      staples,
      tags: [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)),
    };
  }, [id]);
}

/** Settings → Staples, by name. */
export function useStaples(): Staple[] | undefined {
  return useLiveQuery(async () => (await db.staples.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
}
