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
  type OpenOneInput,
  type TapDirection,
} from '../domain/rules';
import { RECENT_WINDOW_MS } from '../domain/quickAdd';
import { seedGroups, seedItems, seedListEntries, seedLocations, seedStaples, seedStores } from '../domain/seed';
import type { CategoryKey, ID, Item, ListEntry, PackageSize } from '../domain/types';
import { guessCategory } from '../ui/icons';
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
  category?: CategoryKey;
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

  /** Real use: no locations or stores yet, staples seeded. */
  async startEmpty(): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.staples.bulkAdd(seedStaples);
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
      await this.markInitialized();
    });
  }

  private async markInitialized() {
    await this.db.meta.bulkPut([
      { key: 'initialized', value: true },
      { key: 'schemaVersion', value: SCHEMA_VERSION },
    ]);
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
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
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
      category: input.category ?? guessCategory(name),
      categoryConfirmed: input.category != null || undefined,
      isLeftover: false,
      createdAt: t,
      updatedAt: t,
    };
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
      await db.items.add(item);
      await this.touch(item.id);
      return { id: item.id, change: await this.reconcile(item.id) };
    });
  }

  /** Edits fields. Renaming re-guesses the icon until the user has picked one. */
  async updateItem(itemId: ID, patch: ItemPatch): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
      const item = await db.items.get(itemId);
      if (!item) throw new Error(`No item ${itemId}`);
      const changes: Partial<Item> = { ...patch, updatedAt: this.now() };
      if (patch.name != null) {
        changes.name = patch.name.trim() || item.name;
        if (!item.categoryConfirmed && patch.category == null) changes.category = guessCategory(changes.name);
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
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
      const item = await db.items.get(itemId);
      if (!item) throw new Error(`No item ${itemId}`);
      const restored: Item = { ...item, updatedAt: this.now() };
      delete restored.archivedAt;
      await db.items.put(restored);
      return this.reconcile(itemId);
    });
  }

  /** Creates a linked leftover; optionally takes one from the parent. */
  async openOne(parentId: ID, input: OpenOneInput): Promise<{ leftoverId: ID; parentChange: ItemChange }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
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
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
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
    await db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
      const e = await db.listEntries.get(entryId);
      if (!e) return;
      const item = e.itemId ? await db.items.get(e.itemId) : undefined;
      const to = alternateStore(e, item);
      if (to !== undefined) await db.listEntries.update(entryId, { storeId: to, updatedAt: this.now() });
    });
  }

  /**
   * Just shopped → Confirm. Marks the entry done and adds the bought quantity to
   * the linked item. Marking first means the recovered item doesn't delete it.
   */
  async logPurchase(entryId: ID, quantity: number): Promise<ItemChange> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
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

  /**
   * Just shopped → Finish. Clears every checked entry (they've been logged);
   * skipped ones stay. Items still low get a fresh auto entry.
   */
  async finishTrip(): Promise<{ cleared: number }> {
    const { db } = this;
    return db.transaction('rw', db.items, db.listEntries, db.activity, async () => {
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

/** App-wide instance. Tests construct their own `new Repo(new PantryDB(name))`. */
export const repo = new Repo();
