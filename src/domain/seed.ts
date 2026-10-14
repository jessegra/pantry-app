// Sample data from the design brief, used on first run (behind a "Load sample data"
// option or in dev) and in tests. Real locations and stores are user-maintained.
import type { Item, ListEntry, Location, LocationGroup, Staple, Store } from './types';

const T0 = Date.UTC(2026, 9, 12, 17, 0, 0);

export const seedGroups: LocationGroup[] = [{ id: 'grp-pantry', name: 'Pantry', sortOrder: 3 }];

// Top-level order: Refrigerator, Refrigerator Drawer, Deep Freeze, [Pantry group], Kitchen Cabinet Left.
export const seedLocations: Location[] = [
  { id: 'loc-fridge', name: 'Refrigerator', groupId: null, sortOrder: 0 },
  { id: 'loc-drawer', name: 'Refrigerator Drawer', groupId: null, sortOrder: 1 },
  { id: 'loc-freeze', name: 'Deep Freeze', groupId: null, sortOrder: 2 },
  { id: 'loc-shelf1', name: 'Shelf 1', groupId: 'grp-pantry', sortOrder: 0 },
  { id: 'loc-shelf2', name: 'Shelf 2', groupId: 'grp-pantry', sortOrder: 1 },
  // Not in the brief's sample list; added to exercise the empty-location state.
  { id: 'loc-floor', name: 'Floor bin', groupId: 'grp-pantry', sortOrder: 2 },
  { id: 'loc-cab', name: 'Kitchen Cabinet Left', groupId: null, sortOrder: 4 },
];

export const seedStores: Store[] = [
  { id: 'st-costco', name: 'Costco', sortOrder: 0 },
  { id: 'st-fredmeyer', name: 'Fred Meyer', sortOrder: 1 },
  { id: 'st-tj', name: "Trader Joe's", sortOrder: 2 },
];

const base = { isLeftover: false, createdAt: T0, updatedAt: T0 } as const;

export const seedItems: Item[] = [
  { ...base, id: 'it-blackbeans', name: 'Black beans', locationId: 'loc-shelf1', unit: 'can', packageSize: { amount: 8, unit: 'oz' }, par: 8, amount: 3, preferredStoreId: 'st-costco', secondaryStoreId: 'st-tj', category: 'canned' },
  { ...base, id: 'it-blackbeans-open', name: 'Black beans, opened', locationId: 'loc-fridge', unit: 'oz', par: 8, amount: 4, category: 'canned', isLeftover: true, parentId: 'it-blackbeans' },
  { ...base, id: 'it-milk', name: 'Milk', locationId: 'loc-fridge', unit: 'gal', par: 2, amount: 1, preferredStoreId: 'st-fredmeyer', category: 'dairy' },
  { ...base, id: 'it-eggs', name: 'Eggs', locationId: 'loc-fridge', unit: 'each', par: 12, amount: 9, preferredStoreId: 'st-costco', category: 'eggs' },
  { ...base, id: 'it-butter', name: 'Butter', locationId: 'loc-drawer', unit: 'stick', par: 4, amount: 2, preferredStoreId: 'st-tj', category: 'butter' },
  { ...base, id: 'it-flour', name: 'Flour', locationId: 'loc-cab', unit: 'bag', par: 1, amount: 0.4, preferredStoreId: 'st-fredmeyer', category: 'baking' },
  { ...base, id: 'it-oil', name: 'Olive oil', locationId: 'loc-cab', unit: 'bottle', par: 1, amount: 0.7, preferredStoreId: 'st-tj', category: 'oil' },
  { ...base, id: 'it-peas', name: 'Frozen peas', locationId: 'loc-freeze', unit: 'bag', par: 3, amount: 2, preferredStoreId: 'st-tj', category: 'frozen' },
  { ...base, id: 'it-chicken', name: 'Chicken thighs', locationId: 'loc-freeze', unit: 'lb', par: 4, amount: 1, preferredStoreId: 'st-costco', secondaryStoreId: 'st-fredmeyer', category: 'meat' },
  // Brief says "low"; ½ bag of 2 is at/below the 25% threshold.
  { ...base, id: 'it-coffee', name: 'Coffee beans', locationId: 'loc-shelf2', unit: 'bag', par: 2, amount: 0.5, preferredStoreId: 'st-tj', secondaryStoreId: 'st-fredmeyer', category: 'coffee' },
  // Name and location only: renders as a "Set up" row.
  { ...base, id: 'it-rice', name: 'Rice', locationId: 'loc-shelf1', amount: 0, category: 'grains' },
];

// Chicken thighs and Coffee beans are auto entries (they're low). The three manual
// entries are invented to show manual vs auto, a checked row, and the Unassigned group.
export const seedListEntries: ListEntry[] = [
  { id: 'le-chicken', itemId: 'it-chicken', name: 'Chicken thighs', quantity: 3, unit: 'lb', storeId: 'st-costco', source: 'auto', checked: false, createdAt: T0 },
  { id: 'le-coffee', itemId: 'it-coffee', name: 'Coffee beans', quantity: 2, unit: 'bag', storeId: 'st-tj', source: 'auto', checked: false, createdAt: T0 + 1 },
  { id: 'le-lemons', name: 'Lemons', quantity: 4, storeId: 'st-fredmeyer', source: 'manual', checked: true, checkedAt: T0 + 10, createdAt: T0 + 2 },
  { id: 'le-tortillas', name: 'Tortillas', quantity: 1, unit: 'pack', storeId: 'st-tj', source: 'manual', checked: false, createdAt: T0 + 3 },
  { id: 'le-soap', name: 'Dish soap', quantity: 1, storeId: null, source: 'manual', checked: false, createdAt: T0 + 4 },
];

export const seedStaples: Staple[] = ['salt', 'pepper', 'oil', 'butter', 'water', 'sugar', 'flour'].map((name) => ({
  id: `sp-${name}`,
  name,
}));
