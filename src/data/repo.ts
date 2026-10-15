// The only way the app reads or writes storage. Intent-named methods run the
// SPEC §3 side-effects (auto list entries) in one Dexie transaction each.
// A sync layer can later wrap this without changing screens.
import {
  alternateStore,
  applyPurchase,
  applyTap,
  missingForList,
  openOne as buildLeftover,
  reconcileAutoEntry,
  restockQuantity,
  shouldAutoList,
  type OpenOneInput,
  type TapDirection,
} from '../domain/rules';
import { defaultCategories, guessCategory } from '../domain/categories';
import { buildInventory } from '../domain/inventory';
import { RECENT_WINDOW_MS } from '../domain/quickAdd';
import { houseOrder, tripOrder } from '../domain/trip';
import { seedGroups, seedItems, seedListEntries, seedLocations, seedStaples, seedStores } from '../domain/seed';
import {
  FALLBACK_CATEGORY,
  type Category,
  type CategoryKey,
  type ID,
  type Item,
  type ListEntry,
  type Location,
  type LocationGroup,
  type PackageSize,
  type Staple,
  type Store,
  type Timestamp,
} from '../domain/types';
import { PantryDB, SCHEMA_VERSION } from './db';

/** What happened to the item's auto list entry after a change. */
export interface ItemChange {
  list: 'added' | 'updated' | 'removed' | null;
  /**
   * The item was just auto-added with no preferred store (it sits in Unassigned).
   * The UI should show the "Where do you buy…?" sheet (the nag, SPEC §3).
   */
  promptForStore: boolean;
}

const NO_CHANGE: ItemChange = { list: null, promptForStore: false };

export interface NewItemInput {
  name: string;
  locationId: ID | null;
  unit?: string;
  packageSize?: PackageSize;
  par?: number;
  lowThreshold?: number;
  amount?: number;
  preferredStoreId?: ID;
  secondaryStoreId?: ID;
  category?: ID;
}

/** Fields the item detail screen can edit. `undefined` clears an optional field. */
export type ItemPatch = Partial<
  Pick<
    Item,
    | 'name'
    | 'locationId'
    | 'unit'
    | 'packageSize'
    | 'par'
    | 'lowThreshold'
    | 'amount'
    | 'preferredStoreId'
    | 'secondaryStoreId'
    | 'category'
  >
>;

export interface NewEntryInput {
  name: string;
  quantity?: number;
  unit?: string;
  /** Omitted: the linked item's preferred store, else Unassigned. */
  storeId?: ID | null;
  /** Link to an inventory item (e.g. the add field matched "Rice"). */
  itemId?: ID;
}

/** Drag-to-reorder result for Settings → Locations: the full top-level order. */
export type LocationLayout = Array<{ kind: 'location'; id: ID } | { kind: 'group'; id: ID; locationIds: ID[] }>;

export class Repo {
  readonly db: PantryDB;
  private readonly now: () => number;

  constructor(db: PantryDB = new PantryDB(), now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  private id(): ID {
    return crypto.randomUUID();
  }

  // ---------- First run ----------

  async isInitialized(): Promise<boolean> {
    return (await this.db.meta.get('initialized'))?.value === true;
  }

  private initializing: Promise<void> | null = null;

  /**
   * First open: load the sample data (owner's call, for testing; "Erase everything"
   * in Settings → More gives a blank start). Safe to call repeatedly or concurrently.
   */
  ensureInitialized(): Promise<void> {
    this.initializing ??= (async () => {
      if (!(await this.isInitialized())) await this.loadSampleData();
    })().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  /** Real use: no locations or stores yet, staples seeded. */
  async startEmpty(): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.staples.bulkAdd(seedStaples);
      await db.categories.bulkAdd(defaultCategories(this.now()));
      await this.markInitialized();
    });
  }

  /** Replaces everything with the design brief's sample data. */
  async loadSampleData(): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.groups.bulkAdd(seedGroups);
      await db.locations.bulkAdd(seedLocations);
      await db.stores.bulkAdd(seedStores);
      await db.items.bulkAdd(seedItems);
      await db.listEntries.bulkAdd(seedListEntries);
      await db.staples.bulkAdd(seedStaples);
      await db.categories.bulkAdd(defaultCategories(this.now()));
      await this.markInitialized();
    });
  }

  private async markInitialized() {
    await this.db.meta.bulkPut([
      { key: 'initialized', value: true },
      { key: 'schemaVersion', value: SCHEMA_VERSION },
    ]);
  }

  // ---------- Backup (SPEC §5: until sync exists) ----------

  /** Everything except the local-only activity log. */
  async exportData(): Promise<Backup> {
    const { db } = this;
    const tables = [db.items, db.locations, db.groups, db.stores, db.listEntries, db.staples, db.categories];
    return db.transaction('r', tables, async () => ({
      app: 'pantry' as const,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.now(),
      tables: {
        items: await db.items.toArray(),
        locations: await db.locations.toArray(),
        groups: await db.groups.toArray(),
        stores: await db.stores.toArray(),
        listEntries: await db.listEntries.toArray(),
        staples: await db.staples.toArray(),
        categories: await db.categories.toArray(),
      },
    }));
  }

  /** Replaces everything with a validated backup, in one transaction. */
  async importData(backup: Backup): Promise<void> {
    const { db } = this;
    const { tables } = validateBackup(backup);
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.items.bulkAdd(tables.items);
      await db.locations.bulkAdd(tables.locations);
      await db.groups.bulkAdd(tables.groups);
      await db.stores.bulkAdd(tables.stores);
      await db.listEntries.bulkAdd(tables.listEntries);
      await db.staples.bulkAdd(tables.staples);
      // Backups from before categories were editable don't carry them.
      await db.categories.bulkAdd(tables.categories ?? defaultCategories(this.now()));
      await this.markInitialized();
    });
  }

  // ---------- Categories (Settings → Categories) ----------

  async addCategory(input: { name: string; icon: CategoryKey; keywords: string[] }): Promise<ID> {
    const id = this.id();
    await this.db.categories.add({ id, name: input.name.trim(), icon: input.icon, keywords: input.keywords, updatedAt: this.now() });
    return id;
  }

  async updateCategory(id: ID, patch: Partial<Pick<Category, 'name' | 'icon' | 'keywords'>>): Promise<void> {
    const changes = { ...patch, updatedAt: this.now() };
    if (patch.name != null) changes.name = patch.name.trim();
    await this.db.categories.update(id, changes);
  }

  /** Its items move to Other. Other itself can't be deleted. */
  async deleteCategory(id: ID): Promise<{ movedItems: number }> {
    if (id === FALLBACK_CATEGORY) throw new Error('Other can’t be deleted');
    const { db } = this;
    return db.transaction('rw', db.categories, db.items, async () => {
      const t = this.now();
      const movedItems = await db.items
        .filter((i) => i.category === id)
        .modify({ category: FALLBACK_CATEGORY, updatedAt: t });
      await db.categories.delete(id);
      return { movedItems };
    });
  }

  // ---------- Auto list entries ----------

  /** Runs reconcileAutoEntry for one item. Call inside a transaction covering items + listEntries. */
  private async reconcile(itemId: ID): Promise<ItemChange> {
    const { db } = this;
    const item = await db.items.get(itemId);
    if (!item) return NO_CHANGE;
    const entries = await db.listEntries.where('itemId').equals(itemId).toArray();
    const action = reconcileAutoEntry(item, entries);
    const t = this.now();
    switch (action.type) {
      case 'add':
        await db.listEntries.add({ ...action.entry, id: this.id(), createdAt: t, updatedAt: t });
        return { list: 'added', promptForStore: action.promptForStore };
      case 'update':
        await db.listEntries.update(action.entryId, { quantity: action.quantity, updatedAt: t });
        return { list: 'updated', promptForStore: false };
      case 'remove':
        await db.listEntries.delete(action.entryId);
        return { list: 'removed', promptForStore: false };
      default:
        return NO_CHANGE;
    }
  }

  private async changeItem(itemId: ID, mutate: (item: Item) => Partial<Item> | null): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const item = await db.items.get(itemId);
      if (!item) throw new Error(`No item ${itemId}`);
      const changes = mutate(item);
      if (!changes) return NO_CHANGE;
      await db.items.update(itemId, { ...changes, updatedAt: this.now() });
      await this.touch(itemId);
      return this.reconcile(itemId);
    });
  }

  // ---------- Activity (Quick add's recent & frequent) ----------

  /** Logs a tap burst or edit. Call inside a transaction that includes db.activity. */
  private async touch(itemId: ID) {
    await this.db.activity.add({ itemId, at: this.now() });
  }

  /** Drops activity older than the ranking window. Run once at startup. */
  async pruneActivity(): Promise<number> {
    return this.db.activity.where('at').below(this.now() - RECENT_WINDOW_MS).delete();
  }

  // ---------- Items ----------

  async createItem(input: NewItemInput): Promise<{ id: ID; change: ItemChange }> {
    const { db } = this;
    const name = input.name.trim();
    if (!name) throw new Error('Item name is required');
    const t = this.now();
    const item: Item = {
      ...input,
      id: this.id(),
      name,
      amount: Math.max(0, input.amount ?? 0),
      category: input.category ?? FALLBACK_CATEGORY, // guessed below, inside the transaction
      categoryConfirmed: input.category != null || undefined,
      isLeftover: false,
      createdAt: t,
      updatedAt: t,
    };
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      if (input.category == null) item.category = guessCategory(name, await db.categories.toArray());
      await db.items.add(item);
      await this.touch(item.id);
      return { id: item.id, change: await this.reconcile(item.id) };
    });
  }

  /** Edits fields. Renaming re-guesses the icon until the user has picked one. */
  async updateItem(itemId: ID, patch: ItemPatch): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const item = await db.items.get(itemId);
      if (!item) throw new Error(`No item ${itemId}`);
      const changes: Partial<Item> = { ...patch, updatedAt: this.now() };
      if (patch.name != null) {
        changes.name = patch.name.trim() || item.name;
        if (!item.categoryConfirmed && patch.category == null) {
          changes.category = guessCategory(changes.name, await db.categories.toArray());
        }
      }
      if (patch.category != null) changes.categoryConfirmed = true;
      // Dexie's update() ignores undefined values; explicit clears need a full put.
      await db.items.put({ ...item, ...changes });

      // Keep open entries' copied name/unit current, and move an Unassigned auto entry
      // to the store the user just picked (answering the nag).
      const open = (await db.listEntries.where('itemId').equals(itemId).toArray()).filter((e) => !e.checked);
      for (const e of open) {
        const next: Partial<ListEntry> = {};
        if (changes.name && e.name !== changes.name) next.name = changes.name;
        if ('unit' in patch && e.source === 'auto') next.unit = patch.unit;
        if (patch.preferredStoreId && e.storeId === null) next.storeId = patch.preferredStoreId;
        if (Object.keys(next).length) await db.listEntries.put({ ...e, ...next, updatedAt: this.now() });
      }
      await this.touch(itemId);
      return this.reconcile(itemId);
    });
  }

  async setAmount(itemId: ID, amount: number): Promise<ItemChange> {
    return this.changeItem(itemId, (item) => {
      const next = Math.max(0, Math.round(amount * 100) / 100);
      return next === item.amount ? null : { amount: next };
    });
  }

  /** One step on the status bar (right half +1, left half −1). */
  async tap(itemId: ID, dir: TapDirection): Promise<ItemChange> {
    return this.changeItem(itemId, (item) => {
      const next = applyTap(item, dir);
      return next === item.amount ? null : { amount: next };
    });
  }

  async archiveItem(itemId: ID): Promise<ItemChange> {
    return this.changeItem(itemId, () => ({ archivedAt: this.now() }));
  }

  async restoreItem(itemId: ID): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const item = await db.items.get(itemId);
      if (!item) throw new Error(`No item ${itemId}`);
      const restored: Item = { ...item, updatedAt: this.now() };
      delete restored.archivedAt;
      await db.items.put(restored);
      return this.reconcile(itemId);
    });
  }

  /**
   * Permanently deletes an archived item (owner's call: archive first, then delete
   * from there). Its list entries and activity go too; its leftovers stay, unlinked.
   */
  async deleteItem(itemId: ID): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const item = await db.items.get(itemId);
      if (!item) return;
      if (item.archivedAt == null) throw new Error('Archive an item before deleting it');
      await db.listEntries.where('itemId').equals(itemId).delete();
      await db.activity.where('itemId').equals(itemId).delete();
      const t = this.now();
      await db.items.where('parentId').equals(itemId).modify((l) => {
        delete l.parentId;
        l.updatedAt = t;
      });
      await db.items.delete(itemId);
    });
  }

  /** Creates a linked leftover; optionally takes one from the parent. */
  async openOne(parentId: ID, input: OpenOneInput): Promise<{ leftoverId: ID; parentChange: ItemChange }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const parent = await db.items.get(parentId);
      if (!parent) throw new Error(`No item ${parentId}`);
      const { leftover, parentAmount } = buildLeftover(parent, input);
      const t = this.now();
      const leftoverId = this.id();
      await db.items.add({ ...leftover, id: leftoverId, createdAt: t, updatedAt: t });
      let parentChange = NO_CHANGE;
      if (parentAmount !== parent.amount) {
        await db.items.update(parentId, { amount: parentAmount, updatedAt: t });
        parentChange = await this.reconcile(parentId);
      }
      return { leftoverId, parentChange };
    });
  }

  // ---------- Shopping list ----------

  /**
   * Manual add. When linked to an item, `missing` lists the fields to ask for
   * (the nag, case 2): show the set-up sheet if it's non-empty.
   */
  async addListEntry(input: NewEntryInput): Promise<{ id: ID; missing: ReturnType<typeof missingForList> }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const item = input.itemId ? await db.items.get(input.itemId) : undefined;
      const t = this.now();
      const entry: ListEntry = {
        id: this.id(),
        itemId: item?.id,
        name: item?.name ?? input.name.trim(),
        quantity: input.quantity ?? (item && restockQuantity(item)) ?? 1,
        unit: input.unit ?? item?.unit,
        storeId: input.storeId !== undefined ? input.storeId : (item?.preferredStoreId ?? null),
        source: 'manual',
        checked: false,
        createdAt: t,
        updatedAt: t,
      };
      if (!entry.name) throw new Error('Entry name is required');
      await db.listEntries.add(entry);
      return { id: entry.id, missing: item ? missingForList(item) : [] };
    });
  }

  async updateListEntry(entryId: ID, patch: Partial<Pick<ListEntry, 'name' | 'quantity' | 'unit' | 'storeId'>>) {
    await this.db.listEntries.update(entryId, { ...patch, updatedAt: this.now() });
  }

  async toggleEntry(entryId: ID): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.listEntries, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) return;
      const t = this.now();
      await db.listEntries.put({ ...e, checked: !e.checked, checkedAt: e.checked ? undefined : t, updatedAt: t });
    });
  }

  /** Swap between the item's preferred and secondary store. No-op if it lacks either. */
  async moveEntryToAlternate(entryId: ID): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) return;
      const item = e.itemId ? await db.items.get(e.itemId) : undefined;
      const to = alternateStore(e, item);
      if (to !== undefined) await db.listEntries.update(entryId, { storeId: to, updatedAt: this.now() });
    });
  }

  /**
   * Put an entry under a store (or Unassigned). If the linked item has no preferred
   * store yet, this one becomes it: same answer as the nag.
   */
  async setEntryStore(entryId: ID, storeId: ID | null): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.items, db.listEntries, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) return;
      const t = this.now();
      await db.listEntries.update(entryId, { storeId, updatedAt: t });
      const item = e.itemId ? await db.items.get(e.itemId) : undefined;
      if (item && storeId && !item.preferredStoreId) {
        await db.items.update(item.id, { preferredStoreId: storeId, updatedAt: t });
      }
    });
  }

  /**
   * Removes an entry. If it was an auto entry for an item that's still low, it
   * would come straight back, so it stays: the caller should say why.
   */
  async removeListEntry(entryId: ID): Promise<{ removed: boolean }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) return { removed: false };
      const item = e.itemId ? await db.items.get(e.itemId) : undefined;
      if (e.source === 'auto' && !e.checked && item && shouldAutoList(item)) return { removed: false };
      await db.listEntries.delete(entryId);
      return { removed: true };
    });
  }

  /**
   * Just shopped → Confirm. Marks the entry done and adds the bought quantity to
   * the linked item. Marking first means the recovered item doesn't delete it.
   */
  async logPurchase(entryId: ID, quantity: number): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) throw new Error(`No entry ${entryId}`);
      const t = this.now();
      await db.listEntries.put({ ...e, quantity, checked: true, checkedAt: e.checkedAt ?? t, updatedAt: t });
      const item = e.itemId ? await db.items.get(e.itemId) : undefined;
      if (!item || quantity <= 0) return NO_CHANGE;
      await db.items.update(item.id, { amount: applyPurchase(item, quantity), updatedAt: t });
      await this.touch(item.id);
      return this.reconcile(item.id);
    });
  }

  /** Just shopped → Skip: the entry stays on the list, unchecked (so Finish won't clear it). */
  async skipEntry(entryId: ID): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.listEntries, async () => {
      const e = await db.listEntries.get(entryId);
      if (e?.checked) {
        await db.listEntries.put({ ...e, checked: false, checkedAt: undefined, updatedAt: this.now() });
      }
    });
  }

  /** One-time snapshot of the walk, so the order doesn't shift while you're shopping. */
  async tripPlan() {
    const [entries, stores] = await Promise.all([this.db.listEntries.toArray(), this.db.stores.toArray()]);
    return tripOrder(entries, stores);
  }

  /** "Continue through the house": snapshot of set-up items by location, minus ones just logged. */
  async housePlan(exclude: Set<ID>) {
    const { db } = this;
    const [groups, locations, items] = await Promise.all([db.groups.toArray(), db.locations.toArray(), db.items.toArray()]);
    return houseOrder(buildInventory(groups, locations, items, []), exclude);
  }

  /**
   * Just shopped → Finish. Clears every checked entry (they've been logged);
   * skipped ones stay. Items still low get a fresh auto entry.
   */
  async finishTrip(): Promise<{ cleared: number }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, db.categories, async () => {
      const done = (await db.listEntries.toArray()).filter((e) => e.checked);
      await db.listEntries.bulkDelete(done.map((e) => e.id));
      const itemIds = new Set(done.flatMap((e) => (e.itemId ? [e.itemId] : [])));
      for (const id of itemIds) await this.reconcile(id);
      return { cleared: done.length };
    });
  }

  // ---------- Locations & groups ----------

  /** Next sortOrder at the top level (shared by ungrouped locations and groups) or within a group. */
  private async nextSortOrder(groupId: ID | null): Promise<number> {
    const { db } = this;
    const orders =
      groupId === null
        ? [
            ...(await db.locations.filter((l) => l.groupId === null).toArray()).map((l) => l.sortOrder),
            ...(await db.groups.toArray()).map((g) => g.sortOrder),
          ]
        : (await db.locations.where('groupId').equals(groupId).toArray()).map((l) => l.sortOrder);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  async addLocation(name: string, groupId: ID | null = null): Promise<ID> {
    const { db } = this;
    return db.transaction('rw', db.locations, db.groups, async () => {
      const id = this.id();
      const sortOrder = await this.nextSortOrder(groupId);
      await db.locations.add({ id, name: name.trim(), groupId, sortOrder, updatedAt: this.now() });
      return id;
    });
  }

  async renameLocation(id: ID, name: string) {
    if (name.trim()) await this.db.locations.update(id, { name: name.trim(), updatedAt: this.now() });
  }

  /** Its items move to Unassigned (locationId null). */
  async deleteLocation(id: ID): Promise<{ movedItems: number }> {
    const { db } = this;
    return db.transaction('rw', db.locations, db.items, async () => {
      const t = this.now();
      const movedItems = await db.items.where('locationId').equals(id).modify({ locationId: null, updatedAt: t });
      await db.locations.delete(id);
      return { movedItems };
    });
  }

  async addGroup(name: string): Promise<ID> {
    const { db } = this;
    return db.transaction('rw', db.locations, db.groups, async () => {
      const id = this.id();
      const sortOrder = await this.nextSortOrder(null);
      await db.groups.add({ id, name: name.trim(), sortOrder, updatedAt: this.now() });
      return id;
    });
  }

  async renameGroup(id: ID, name: string) {
    if (name.trim()) await this.db.groups.update(id, { name: name.trim(), updatedAt: this.now() });
  }

  /** Ungroups its locations; they take the group's place in the top-level order. */
  async deleteGroup(id: ID): Promise<void> {
    const layout = await this.currentLayout();
    const next = layout.flatMap((n) =>
      n.kind === 'group' && n.id === id ? n.locationIds.map((lid) => ({ kind: 'location' as const, id: lid })) : [n],
    );
    const { db } = this;
    await db.transaction('rw', db.locations, db.groups, async () => {
      await db.groups.delete(id);
      await this.applyLayout(next);
    });
  }

  /** The current top-level order, in the shape reorderLocations takes. */
  async currentLayout(): Promise<LocationLayout> {
    const { db } = this;
    const [locations, groups] = await Promise.all([db.locations.toArray(), db.groups.toArray()]);
    const groupIds = new Set(groups.map((g) => g.id));
    const top = [
      ...locations
        .filter((l) => l.groupId === null || !groupIds.has(l.groupId))
        .map((l) => ({ sortOrder: l.sortOrder, node: { kind: 'location' as const, id: l.id } })),
      ...groups.map((g) => ({
        sortOrder: g.sortOrder,
        node: {
          kind: 'group' as const,
          id: g.id,
          locationIds: locations
            .filter((l) => l.groupId === g.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((l) => l.id),
        },
      })),
    ];
    return top.sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.node);
  }

  /** Saves a drag result: sortOrders renumbered, groupId follows the location's new parent. */
  async reorderLocations(layout: LocationLayout): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.locations, db.groups, () => this.applyLayout(layout));
  }

  private async applyLayout(layout: LocationLayout) {
    const { db } = this;
    const t = this.now();
    for (const [i, node] of layout.entries()) {
      if (node.kind === 'location') {
        await db.locations.update(node.id, { groupId: null, sortOrder: i, updatedAt: t });
      } else {
        await db.groups.update(node.id, { sortOrder: i, updatedAt: t });
        for (const [j, lid] of node.locationIds.entries()) {
          await db.locations.update(lid, { groupId: node.id, sortOrder: j, updatedAt: t });
        }
      }
    }
  }

  // ---------- Stores ----------

  async addStore(name: string): Promise<ID> {
    const { db } = this;
    return db.transaction('rw', db.stores, async () => {
      const id = this.id();
      const orders = (await db.stores.toArray()).map((s) => s.sortOrder);
      const sortOrder = orders.length ? Math.max(...orders) + 1 : 0;
      await db.stores.add({ id, name: name.trim(), sortOrder, updatedAt: this.now() });
      return id;
    });
  }

  async renameStore(id: ID, name: string) {
    if (name.trim()) await this.db.stores.update(id, { name: name.trim(), updatedAt: this.now() });
  }

  async reorderStores(ids: ID[]): Promise<void> {
    const { db } = this;
    const t = this.now();
    await db.transaction('rw', db.stores, async () => {
      for (const [i, id] of ids.entries()) await db.stores.update(id, { sortOrder: i, updatedAt: t });
    });
  }

  /** Items forget the store; its list entries move to Unassigned. */
  async deleteStore(id: ID): Promise<{ affectedItems: number; movedEntries: number }> {
    const { db } = this;
    return db.transaction('rw', db.stores, db.items, db.listEntries, async () => {
      const t = this.now();
      let affectedItems = 0;
      await db.items.toCollection().modify((item) => {
        if (item.preferredStoreId !== id && item.secondaryStoreId !== id) return;
        if (item.preferredStoreId === id) delete item.preferredStoreId;
        if (item.secondaryStoreId === id) delete item.secondaryStoreId;
        item.updatedAt = t;
        affectedItems++;
      });
      const movedEntries = await db.listEntries.where('storeId').equals(id).modify({ storeId: null, updatedAt: t });
      await db.stores.delete(id);
      return { affectedItems, movedEntries };
    });
  }
}

// ---------- Backup ----------

export interface Backup {
  app: 'pantry';
  schemaVersion: number;
  exportedAt: Timestamp;
  tables: {
    items: Item[];
    locations: Location[];
    groups: LocationGroup[];
    stores: Store[];
    listEntries: ListEntry[];
    staples: Staple[];
    /** Missing in backups made before categories were editable. */
    categories?: Category[];
  };
}

const BACKUP_TABLES = ['items', 'locations', 'groups', 'stores', 'listEntries', 'staples'] as const;

export class BackupError extends Error {}

/** Checks a parsed file looks like one of our backups. Throws BackupError with a readable reason. */
export function validateBackup(data: unknown): Backup {
  const d = data as Partial<Backup> | null;
  if (!d || typeof d !== 'object' || d.app !== 'pantry') throw new BackupError('This isn’t a Pantry backup file.');
  if (typeof d.schemaVersion !== 'number' || d.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('This backup is from a newer version of Pantry. Update the app first.');
  }
  for (const t of BACKUP_TABLES) {
    if (!Array.isArray(d.tables?.[t])) throw new BackupError(`The backup is missing its ${t}.`);
  }
  const ok = (rows: unknown[]) => rows.every((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string');
  if (!BACKUP_TABLES.every((t) => ok(d.tables![t]))) throw new BackupError('The backup looks damaged.');
  const cats = d.tables!.categories;
  if (cats !== undefined && !(Array.isArray(cats) && ok(cats))) throw new BackupError('The backup looks damaged.');
  return d as Backup;
}

/** App-wide instance. Tests construct their own `new Repo(new PantryDB(name))`. */
export const repo = new Repo();
