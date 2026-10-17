import Dexie from 'dexie';
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

describe('categories', () => {
  it('new items are guessed from user words first, then built-ins', async () => {
    await repo.addCategory({ name: 'Snacks', icon: 'generic', keywords: ['chips'] });
    const { id: chips } = await repo.createItem({ name: 'Tortilla chips', locationId: null });
    const { id: tortillas } = await repo.createItem({ name: 'Tortillas', locationId: null });
    const snacks = (await db.categories.toArray()).find((c) => c.name === 'Snacks')!;
    expect((await item(chips)).category).toBe(snacks.id);
    expect((await item(tortillas)).category).toBe('grains');
  });

  it('deleting a category moves its items to Other; Other stays', async () => {
    expect(await repo.deleteCategory('canned')).toEqual({ movedItems: 2 });
    expect((await item('it-blackbeans')).category).toBe('generic');
    await expect(repo.deleteCategory('generic')).rejects.toThrow('Other');
  });

  it('a v2 database (before categories) upgrades with the built-ins and keeps its items', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      items: 'id, locationId, parentId, archivedAt',
      locations: 'id, groupId',
      groups: 'id',
      stores: 'id',
      listEntries: 'id, itemId, storeId',
      staples: 'id',
      meta: 'key',
    });
    old.version(2).stores({ activity: '++id, itemId, at' });
    await old.table('items').add({
      id: 'x',
      name: 'Milk',
      category: 'dairy',
      amount: 1,
      locationId: null,
      isLeftover: false,
      createdAt: 1,
      updatedAt: 1,
    });
    old.close();
    const upgraded = new PantryDB(name);
    expect(await upgraded.categories.get('dairy')).toMatchObject({ name: 'Dairy', icon: 'dairy' });
    expect(await upgraded.categories.count()).toBe(13);
    expect(await upgraded.items.get('x')).toMatchObject({ category: 'dairy' });
  });

  it('a backup made before categories imports with the built-ins', async () => {
    const backup = await repo.exportData();
    delete backup.tables.categories;
    const other = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    await other.importData({ ...backup, schemaVersion: 2 });
    expect(await other.db.categories.count()).toBe(13);
  });
});

describe('permanent delete', () => {
  it('only deletes archived items, taking entries and activity with them; leftovers stay', async () => {
    await expect(repo.deleteItem('it-blackbeans')).rejects.toThrow('Archive');
    await repo.tap('it-blackbeans', -1); // listed + activity
    await repo.archiveItem('it-blackbeans');
    await repo.addListEntry({ name: 'Black beans', itemId: 'it-blackbeans' });
    await repo.deleteItem('it-blackbeans');
    expect(await db.items.get('it-blackbeans')).toBeUndefined();
    expect(await entriesFor('it-blackbeans')).toEqual([]);
    expect(await db.activity.where('itemId').equals('it-blackbeans').count()).toBe(0);
    expect((await item('it-blackbeans-open')).parentId).toBeUndefined();
  });

  it('first open loads the sample data once, even if asked twice at the same time', async () => {
    const fresh = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    await Promise.all([fresh.ensureInitialized(), fresh.ensureInitialized()]);
    expect(await fresh.db.items.count()).toBe(11);
    await fresh.ensureInitialized();
    expect(await fresh.db.items.count()).toBe(11);
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

  it('skipping a checked entry unchecks it so Finish keeps it', async () => {
    await repo.skipEntry('le-lemons');
    await repo.finishTrip();
    expect(await db.listEntries.get('le-lemons')).toMatchObject({ checked: false });
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

describe('backup', () => {
  it('round-trips everything through JSON into an empty database', async () => {
    await repo.tap('it-blackbeans', -1);
    const json = JSON.stringify(await repo.exportData());
    const other = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    expect(await other.isInitialized()).toBe(false);
    await other.importData(JSON.parse(json));
    expect(await other.isInitialized()).toBe(true);
    expect(await other.db.items.get('it-blackbeans')).toMatchObject({ amount: 2 });
    expect(await other.db.listEntries.count()).toBe(6);
    expect(await other.db.locations.count()).toBe(7);
    expect(await other.db.staples.count()).toBe(7);
  });

  it('rejects files that aren’t backups, without touching data', async () => {
    await expect(repo.importData({ hello: 1 } as never)).rejects.toThrow('isn’t a Pantry backup');
    const backup = await repo.exportData();
    await expect(repo.importData({ ...backup, schemaVersion: 99 })).rejects.toThrow('newer version');
    await expect(
      repo.importData({ ...backup, tables: { ...backup.tables, items: [{ name: 'no id' }] } } as never),
    ).rejects.toThrow('damaged');
    expect(await db.items.count()).toBe(11);
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

describe('no duplicates', () => {
  it('add* returns the existing record for the same name, even when called twice at once', async () => {
    const [a, b] = await Promise.all([repo.addLocation('Garage'), repo.addLocation(' garage ')]);
    expect(a).toBe(b);
    expect(await repo.addLocation('REFRIGERATOR')).toBe('loc-fridge');
    expect(await repo.addStore('costco')).toBe('st-costco');
    expect(await repo.addGroup('Pantry')).toBe('grp-pantry');
    expect(await repo.addCategory({ name: 'dairy', icon: 'generic', keywords: [] })).toBe('dairy');
    expect(await db.stores.count()).toBe(3);
  });

  it('the same name may repeat in a different group, unless asked to match any group', async () => {
    const garage = await repo.addGroup('Garage');
    const garageShelf = await repo.addLocation('Shelf 1', garage);
    expect(garageShelf).not.toBe('loc-shelf1');
    expect(await repo.addLocation('shelf 1', null, { anyGroup: true })).toBe('loc-shelf1');
  });

  it('merges duplicates left by older builds, moving what pointed at them', async () => {
    const t = Date.now();
    await db.locations.bulkAdd([
      { id: 'dup-cab', name: 'kitchen cabinet left ', groupId: null, sortOrder: 9, updatedAt: t },
      { id: 'dup-g1', name: 'Garage', groupId: null, sortOrder: 10, updatedAt: t },
      { id: 'dup-g2', name: 'Garage', groupId: null, sortOrder: 11, updatedAt: t },
    ]);
    await db.groups.add({ id: 'dup-pantry', name: 'PANTRY', sortOrder: 12, updatedAt: t });
    await db.locations.add({ id: 'dup-shelf9', name: 'Shelf 9', groupId: 'dup-pantry', sortOrder: 0, updatedAt: t });
    await db.stores.add({ id: 'dup-tj', name: "trader joe's", sortOrder: 5, updatedAt: t });
    await db.items.update('it-oil', { locationId: 'dup-cab', secondaryStoreId: 'dup-tj' });
    await db.listEntries.update('le-tortillas', { storeId: 'dup-tj' });

    expect(await repo.mergeDuplicates()).toEqual({ groups: 1, locations: 2, stores: 1, categories: 0 });
    expect(await item('it-oil')).toMatchObject({ locationId: 'loc-cab', preferredStoreId: 'st-tj' });
    expect((await item('it-oil')).secondaryStoreId).toBeUndefined(); // was the same store twice
    expect((await db.listEntries.get('le-tortillas'))!.storeId).toBe('st-tj');
    expect((await db.locations.get('dup-shelf9'))!.groupId).toBe('grp-pantry');
    expect((await db.locations.toArray()).filter((l) => l.name === 'Garage')).toHaveLength(1);
    // Running it again changes nothing.
    expect(await repo.mergeDuplicates()).toEqual({ groups: 0, locations: 0, stores: 0, categories: 0 });
  });
});

describe('recipes', () => {
  it('the sample data has five recipes, and they go in and out of backups', async () => {
    expect(await db.recipes.count()).toBe(5);
    const backup = await repo.exportData();
    expect(backup.tables.recipes).toHaveLength(5);
    const other = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    await other.importData(JSON.parse(JSON.stringify(backup)));
    expect(await other.db.recipes.get('rc-waffles')).toMatchObject({ name: 'Waffles', tags: ['breakfast', 'weekend'] });
    const old = { ...backup, schemaVersion: 4, tables: { ...backup.tables } };
    delete old.tables.recipes;
    await other.importData(old);
    expect(await other.db.recipes.count()).toBe(0);
  });

  it('sample recipes added to a real pantry are matched against its own items, once', async () => {
    const real = new Repo(new PantryDB(`test-${crypto.randomUUID()}`));
    await real.startEmpty();
    const { id: eggs } = await real.createItem({ name: 'Eggs', locationId: null });
    expect(await real.addSampleRecipes()).toBe(5);
    const waffles = (await real.db.recipes.get('rc-waffles'))!;
    expect(waffles.ingredients.find((i) => i.name === 'large eggs')).toMatchObject({ match: 'item', itemId: eggs });
    expect(waffles.ingredients.find((i) => i.name === 'flour')).toMatchObject({ match: 'staple' }); // no Flour item here
    expect(await real.addSampleRecipes()).toBe(0);
    expect(await real.db.recipes.count()).toBe(5);
  });
});

describe('recipe: add missing to list', () => {
  it('adds what is missing once, by item where linked, skipping what is already listed', async () => {
    await repo.setAmount('it-blackbeans', 0);
    await repo.setAmount('it-blackbeans-open', 0); // no leftover to fall back on
    const { added } = await repo.addRecipeMissingToList('rc-tacos');
    // Black beans is already on the list (it just ran out), and so is Tortillas.
    expect(added).toEqual(['Shredded cheese', 'Onion']);
    const cheese = (await db.listEntries.toArray()).find((e) => e.name === 'Shredded cheese')!;
    expect(cheese).toMatchObject({ source: 'manual', storeId: null, quantity: 1 });
    expect(await repo.addRecipeMissingToList('rc-tacos')).toEqual({ added: [] });
  });

  it('a linked missing item goes under its store', async () => {
    await repo.setAmount('it-eggs', 0);
    await db.listEntries.where('itemId').equals('it-eggs').delete(); // drop the auto entry, so the recipe adds it
    const { added } = await repo.addRecipeMissingToList('rc-waffles');
    expect(added).toEqual(['Baking powder', 'Eggs']);
    expect(await db.listEntries.where('itemId').equals('it-eggs').first()).toMatchObject({
      storeId: 'st-costco',
      quantity: 12,
    });
  });
});

describe('adding and editing recipes', () => {
  const ing = { id: 'i1', text: '2 eggs', name: 'eggs', quantity: 2, match: 'item' as const, itemId: 'it-eggs' };

  it('adds a recipe, tidied, and edits it in place', async () => {
    const r = await repo.saveRecipe({
      name: ' Fried  rice ',
      tags: ['Dinner', 'quick', 'dinner'],
      servings: 2,
      ingredients: [ing],
      steps: ' Fry. ',
      notes: '  ',
    });
    if (!('id' in r)) throw new Error(r.problem);
    const saved = (await db.recipes.get(r.id))!;
    expect(saved).toMatchObject({ name: 'Fried rice', tags: ['dinner', 'quick'], servings: 2, steps: 'Fry.' });
    expect(saved.notes).toBeUndefined();
    expect(await repo.saveRecipe({ name: 'Egg fried rice', tags: [], ingredients: [ing] }, r.id)).toEqual({ id: r.id });
    const edited = (await db.recipes.get(r.id))!;
    expect(edited).toMatchObject({ name: 'Egg fried rice', tags: [], createdAt: saved.createdAt });
    expect(edited.servings).toBeUndefined();
    expect(edited.updatedAt).toBeGreaterThan(saved.updatedAt);
    expect(await db.recipes.count()).toBe(6);
  });

  it('refuses a second recipe with the same name, or none', async () => {
    expect(await repo.saveRecipe({ name: 'waffles', tags: [], ingredients: [] })).toEqual({
      problem: 'There’s already a recipe called waffles.',
    });
    expect(await repo.saveRecipe({ name: ' ', tags: [], ingredients: [] })).toEqual({
      problem: 'Give the recipe a name.',
    });
    expect(await db.recipes.count()).toBe(5);
  });

  it('deletes a recipe, leaving a tombstone for the other phone', async () => {
    await repo.deleteRecipe('rc-pizza');
    expect(await db.recipes.get('rc-pizza')).toBeUndefined();
    expect(await db.tombstones.get(['recipes', 'rc-pizza'])).toMatchObject({ tbl: 'recipes', id: 'rc-pizza' });
  });
});

describe('staples', () => {
  it('adds once per name, renames, deletes', async () => {
    const id = await repo.addStaple(' Baking Soda ');
    expect(await db.staples.get(id)).toMatchObject({ name: 'baking soda' });
    expect(await repo.addStaple('baking soda')).toBe(id);
    await repo.renameStaple(id, 'Baking  powder');
    expect(await db.staples.get(id)).toMatchObject({ name: 'baking powder' });
    await repo.renameStaple(id, '  ');
    expect(await db.staples.get(id)).toMatchObject({ name: 'baking powder' });
    await repo.deleteStaple(id);
    expect(await db.staples.count()).toBe(7);
    expect(await db.tombstones.get(['staples', id])).toBeTruthy();
  });
});
