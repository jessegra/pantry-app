import { beforeEach, describe, expect, it } from 'vitest';
import { PantryDB } from './db';
import { Repo } from './repo';

let repo: Repo;
let db: PantryDB;

beforeEach(async () => {
  let clock = 1_000;
  db = new PantryDB(`test-${crypto.randomUUID()}`);
  repo = new Repo(db, () => ++clock);
  await repo.loadSampleData();
});

const item = (id: string) => db.items.get(id).then((i) => i!);
const entriesFor = (itemId: string) => db.listEntries.where('itemId').equals(itemId).toArray();

describe('first run', () => {
  it('starts uninitialised, then sample or empty', async () => {
    const fresh = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    expect(await fresh.isInitialized()).toBe(false);
    await fresh.startEmpty();
    expect(await fresh.isInitialized()).toBe(true);
    expect(await fresh.db.items.count()).toBe(0);
    expect(await fresh.db.staples.count()).toBe(7);
    expect(await repo.db.items.count()).toBe(11);
  });
});

describe('auto list entries', () => {
  it('tapping Black beans down to the threshold adds it silently at Costco, 6 cans', async () => {
    expect(await entriesFor('it-blackbeans')).toEqual([]);
    expect(await repo.tap('it-blackbeans', -1)).toEqual({ list: 'added', promptForStore: false });
    const [e] = await entriesFor('it-blackbeans');
    expect(e).toMatchObject({ name: 'Black beans', quantity: 6, unit: 'can', storeId: 'st-costco', source: 'auto' });
  });

  it('keeps quantity in step, then removes the entry when the item recovers', async () => {
    await repo.tap('it-blackbeans', -1);
    expect(await repo.tap('it-blackbeans', -1)).toEqual({ list: 'updated', promptForStore: false });
    expect((await entriesFor('it-blackbeans'))[0].quantity).toBe(7);
    await repo.setAmount('it-blackbeans', 5);
    expect(await entriesFor('it-blackbeans')).toEqual([]);
  });

  it('never lists a leftover', async () => {
    expect(await repo.setAmount('it-blackbeans-open', 0)).toEqual({ list: null, promptForStore: false });
    expect(await entriesFor('it-blackbeans-open')).toEqual([]);
  });

  it('asks for a store when the item has none (the nag)', async () => {
    await repo.updateItem('it-butter', { preferredStoreId: undefined });
    expect(await repo.setAmount('it-butter', 1)).toEqual({ list: 'added', promptForStore: true });
    expect((await entriesFor('it-butter'))[0].storeId).toBeNull();
    // Answering the nag moves the entry out of Unassigned.
    await repo.updateItem('it-butter', { preferredStoreId: 'st-tj' });
    expect((await entriesFor('it-butter'))[0].storeId).toBe('st-tj');
  });

  it('archiving removes the auto entry; restoring brings it back', async () => {
    await repo.archiveItem('it-chicken');
    expect(await entriesFor('it-chicken')).toEqual([]);
    expect((await item('it-chicken')).archivedAt).toBeDefined();
    expect((await repo.restoreItem('it-chicken')).list).toBe('added');
    expect((await item('it-chicken')).archivedAt).toBeUndefined();
  });

  it('setting a par on a not-set-up item can list it straight away', async () => {
    expect((await repo.updateItem('it-rice', { unit: 'bag', par: 2 })).list).toBe('added');
    expect((await entriesFor('it-rice'))[0]).toMatchObject({ quantity: 2, unit: 'bag', storeId: null });
  });

  it('leaves checked and manual entries alone', async () => {
    const [chicken] = await entriesFor('it-chicken');
    await repo.toggleEntry(chicken.id);
    await repo.setAmount('it-chicken', 4);
    expect((await entriesFor('it-chicken')).map((e) => e.checked)).toEqual([true]);
  });
});

describe('activity', () => {
  it('logs taps, edits and new items; no-op taps are not logged; old rows prune', async () => {
    await repo.tap('it-milk', 1);
    await repo.tap('it-milk', -1);
    await repo.setAmount('it-milk', 1); // unchanged: not logged
    await repo.updateItem('it-eggs', { par: 18 });
    const { id } = await repo.createItem({ name: 'Tortillas', locationId: 'loc-cab' });
    expect((await db.activity.toArray()).map((a) => a.itemId)).toEqual(['it-milk', 'it-milk', 'it-eggs', id]);
    const old = new Repo(db, () => Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await old.pruneActivity()).toBe(4);
  });
});

describe('items', () => {
  it('creates with a guessed category, and re-guesses on rename until confirmed', async () => {
    const { id } = await repo.createItem({ name: 'Tortillas', locationId: 'loc-cab' });
    expect((await item(id)).category).toBe('grains');
    await repo.updateItem(id, { name: 'Lemons' });
    expect((await item(id)).category).toBe('produce');
    await repo.updateItem(id, { category: 'generic' });
    await repo.updateItem(id, { name: 'Coffee' });
    expect((await item(id)).category).toBe('generic');
  });

  it('renaming updates the open entry name', async () => {
    await repo.updateItem('it-chicken', { name: 'Chicken thighs, boneless' });
    expect((await entriesFor('it-chicken'))[0].name).toBe('Chicken thighs, boneless');
  });

  it('open one creates a full leftover and takes one can from the parent', async () => {
    const { leftoverId, parentChange } = await repo.openOne('it-blackbeans', {
      unit: 'oz',
      locationId: 'loc-fridge',
      subtractFromParent: true,
    });
    expect(await item(leftoverId)).toMatchObject({ name: 'Black beans, opened', par: 8, amount: 8, isLeftover: true });
    expect((await item('it-blackbeans')).amount).toBe(2);
    expect(parentChange.list).toBe('added'); // 2 of 8 is at threshold
  });

  it('open one without subtracting leaves the parent alone', async () => {
    const { parentChange } = await repo.openOne('it-blackbeans', { locationId: null, subtractFromParent: false });
    expect(parentChange.list).toBeNull();
    expect((await item('it-blackbeans')).amount).toBe(3);
  });
});

describe('shopping list', () => {
  it('manual add linked to a not-set-up item reports what to ask for', async () => {
    const { id, missing } = await repo.addListEntry({ name: 'rice', itemId: 'it-rice' });
    expect(missing).toEqual(['unit', 'par', 'preferredStore']);
    expect(await db.listEntries.get(id)).toMatchObject({ name: 'Rice', quantity: 1, source: 'manual', storeId: null });
  });

  it('picking a store for an Unassigned entry also sets the item’s preferred store', async () => {
    await repo.updateItem('it-chicken', { preferredStoreId: undefined });
    await repo.setEntryStore('le-chicken', 'st-tj');
    expect((await db.listEntries.get('le-chicken'))!.storeId).toBe('st-tj');
    expect((await item('it-chicken')).preferredStoreId).toBe('st-tj');
    await repo.setEntryStore('le-chicken', 'st-costco'); // already has one: unchanged
    expect((await item('it-chicken')).preferredStoreId).toBe('st-tj');
  });

  it('removes manual entries, but an auto entry for a still-low item stays', async () => {
    expect(await repo.removeListEntry('le-soap')).toEqual({ removed: true });
    expect(await repo.removeListEntry('le-chicken')).toEqual({ removed: false });
    expect(await db.listEntries.get('le-chicken')).toBeDefined();
  });

  it('moves an entry to the other store and back', async () => {
    await repo.moveEntryToAlternate('le-chicken');
    expect((await db.listEntries.get('le-chicken'))!.storeId).toBe('st-fredmeyer');
    await repo.moveEntryToAlternate('le-chicken');
    expect((await db.listEntries.get('le-chicken'))!.storeId).toBe('st-costco');
  });

  it('logs a trip: purchases add stock, finish clears logged entries, skipped stay', async () => {
    await repo.logPurchase('le-chicken', 3);
    await repo.logPurchase('le-coffee', 2);
    await repo.logPurchase('le-tortillas', 1);
    expect((await item('it-chicken')).amount).toBe(4);
    expect((await item('it-coffee')).amount).toBe(2.5);
    expect((await repo.finishTrip()).cleared).toBe(4); // 3 logged + Lemons (already checked)
    expect((await db.listEntries.toArray()).map((e) => e.name)).toEqual(['Dish soap']);
  });

  it('an item still low after the trip is listed again', async () => {
    await repo.logPurchase('le-chicken', 0);
    await repo.finishTrip();
    expect(await entriesFor('it-chicken')).toMatchObject([{ quantity: 3, checked: false, source: 'auto' }]);
  });
});

describe('locations and groups', () => {
  it('deleting a location moves its items to Unassigned', async () => {
    expect(await repo.deleteLocation('loc-cab')).toEqual({ movedItems: 2 });
    expect((await item('it-flour')).locationId).toBeNull();
    expect(await db.locations.get('loc-cab')).toBeUndefined();
  });

  it('adds at the end of the top level or of a group', async () => {
    const top = await repo.addLocation('Garage');
    const inGroup = await repo.addLocation('Top shelf', 'grp-pantry');
    expect(await db.locations.get(top)).toMatchObject({ groupId: null, sortOrder: 5 });
    expect(await db.locations.get(inGroup)).toMatchObject({ groupId: 'grp-pantry', sortOrder: 3 });
  });

  it('reorders, moving a location into a group', async () => {
    const layout = await repo.currentLayout();
    expect(layout.map((n) => n.id)).toEqual(['loc-fridge', 'loc-drawer', 'loc-freeze', 'grp-pantry', 'loc-cab']);
    await repo.reorderLocations([
      { kind: 'group', id: 'grp-pantry', locationIds: ['loc-shelf1', 'loc-cab', 'loc-shelf2', 'loc-floor'] },
      { kind: 'location', id: 'loc-fridge' },
      { kind: 'location', id: 'loc-drawer' },
      { kind: 'location', id: 'loc-freeze' },
    ]);
    expect(await db.locations.get('loc-cab')).toMatchObject({ groupId: 'grp-pantry', sortOrder: 1 });
    expect((await repo.currentLayout())[0]).toMatchObject({ id: 'grp-pantry' });
  });

  it('deleting a group puts its locations where the group was', async () => {
    await repo.deleteGroup('grp-pantry');
    expect((await repo.currentLayout()).map((n) => n.id)).toEqual([
      'loc-fridge',
      'loc-drawer',
      'loc-freeze',
      'loc-shelf1',
      'loc-shelf2',
      'loc-floor',
      'loc-cab',
    ]);
  });
});

describe('stores', () => {
  it('deleting a store clears it from items and moves its entries to Unassigned', async () => {
    expect(await repo.deleteStore('st-costco')).toEqual({ affectedItems: 3, movedEntries: 1 });
    const beans = await item('it-blackbeans');
    expect(beans.preferredStoreId).toBeUndefined();
    expect(beans.secondaryStoreId).toBe('st-tj');
    expect((await db.listEntries.get('le-chicken'))!.storeId).toBeNull();
  });

  it('adds and reorders', async () => {
    const id = await repo.addStore('Safeway');
    await repo.reorderStores([id, 'st-tj', 'st-costco', 'st-fredmeyer']);
    const order = (await db.stores.toArray()).sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.name);
    expect(order).toEqual(['Safeway', "Trader Joe's", 'Costco', 'Fred Meyer']);
  });
});
