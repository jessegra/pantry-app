import { describe, expect, it } from 'vitest';
import { buildInventory } from './inventory';
import { seedGroups, seedItems, seedListEntries, seedLocations, seedStores } from './seed';
import { houseOrder, tripOrder, tripSummary, untrackedPurchases, type TripResult } from './trip';

describe('tripOrder', () => {
  it('walks stores in order, including checked entries, Unassigned last', () => {
    expect(tripOrder(seedListEntries, seedStores).map((e) => `${e.storeName}: ${e.name}`)).toEqual([
      'Costco: Chicken thighs',
      'Fred Meyer: Lemons',
      "Trader Joe's: Coffee beans",
      "Trader Joe's: Tortillas",
      'Unassigned: Dish soap',
    ]);
  });
});

describe('houseOrder', () => {
  it('walks set-up items location by location, skipping ones already logged', () => {
    const sections = buildInventory(seedGroups, seedLocations, seedItems, []);
    const walk = houseOrder(sections, new Set(['it-chicken', 'it-coffee']));
    expect(walk.map((w) => w.item.name)).toEqual([
      'Milk',
      'Eggs',
      'Black beans, opened',
      'Butter',
      'Frozen peas',
      'Black beans', // Rice is not set up
      'Flour',
      'Olive oil',
    ]);
    expect(walk[5].where).toBe('Pantry · Shelf 1');
  });
});

describe('summary', () => {
  const results: TripResult[] = [
    { kind: 'bought', entryId: 'a', name: 'Chicken thighs', quantity: 3, unit: 'lb', itemId: 'it-chicken' },
    { kind: 'bought', entryId: 'b', name: 'Lemons', quantity: 4 },
    { kind: 'bought', entryId: 'c', name: 'Tortillas', quantity: 1, unit: 'pack' },
    { kind: 'skipped', entryId: 'd', name: 'Dish soap' },
  ];
  it('counts bought and skipped', () => {
    expect(tripSummary(results)).toBe("3 items added to what's on hand. 1 skipped and still on the list.");
    expect(tripSummary([results[3]])).toBe('Nothing logged from the list. 1 skipped and still on the list.');
  });
  it('lists untracked purchases', () => {
    expect(untrackedPurchases(results)).toEqual(['Lemons', 'Tortillas']);
  });
});
