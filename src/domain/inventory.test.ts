import { describe, expect, it } from 'vitest';
import {
  buildInventory,
  filterInventory,
  locationLabel,
  statusCounts,
  type InventoryLocation,
  type InventorySection,
} from './inventory';
import { seedGroups, seedItems, seedListEntries, seedLocations } from './seed';

const names = (l: InventoryLocation) => l.rows.map((r) => r.item.name);
const flat = (sections: InventorySection[]) =>
  sections.flatMap((s) => (s.kind === 'group' ? s.locations : [s.location]));

describe('buildInventory', () => {
  const sections = buildInventory(seedGroups, seedLocations, seedItems, seedListEntries);

  it('orders top-level locations and groups together', () => {
    expect(sections.map((s) => (s.kind === 'group' ? `[${s.group.name}]` : s.location.name))).toEqual([
      'Refrigerator',
      'Refrigerator Drawer',
      'Deep Freeze',
      '[Pantry]',
      'Kitchen Cabinet Left',
    ]);
    const pantry = sections[3];
    expect(pantry.kind === 'group' && pantry.locations.map((l) => l.name)).toEqual(['Shelf 1', 'Shelf 2', 'Floor bin']);
  });

  it('keeps the mockup row order and counts low items', () => {
    const [fridge, , freeze] = flat(sections);
    expect(names(fridge)).toEqual(['Milk', 'Eggs', 'Black beans, opened']);
    expect(names(freeze)).toEqual(['Frozen peas', 'Chicken thighs']);
    expect(freeze.lowCount).toBe(1);
    expect(sections[3].kind === 'group' && sections[3].lowCount).toBe(1); // Coffee beans
  });

  it('marks items with an unchecked list entry', () => {
    const rows = flat(sections).flatMap((l) => l.rows);
    expect(rows.filter((r) => r.onList).map((r) => r.item.name)).toEqual(['Chicken thighs', 'Coffee beans']);
  });

  it('puts a leftover right after its parent when they share a location', () => {
    const items = seedItems.map((i) => (i.id === 'it-blackbeans-open' ? { ...i, locationId: 'loc-shelf1' } : i));
    const shelf1 = flat(buildInventory(seedGroups, seedLocations, items, []))[3];
    expect(names(shelf1)).toEqual(['Black beans', 'Black beans, opened', 'Rice']);
  });

  it('hides archived items and adds Unassigned last only when needed', () => {
    expect(flat(sections).some((l) => l.id === null)).toBe(false);
    const items = seedItems.map((i) =>
      i.id === 'it-milk' ? { ...i, locationId: null } : i.id === 'it-eggs' ? { ...i, archivedAt: 1 } : i,
    );
    const out = buildInventory(seedGroups, seedLocations, items, []);
    const last = out.at(-1)!;
    expect(last.kind === 'location' && last.location.name).toBe('Unassigned');
    expect(last.kind === 'location' && names(last.location)).toEqual(['Milk']);
    expect(names(flat(out)[0])).toEqual(['Black beans, opened']);
  });

  it('a deleted group leaves its locations at the top level', () => {
    const out = buildInventory([], seedLocations, seedItems, []);
    expect(out.every((s) => s.kind === 'location')).toBe(true);
  });
});

describe('filterInventory', () => {
  const sections = buildInventory(seedGroups, seedLocations, seedItems, seedListEntries);
  const shown = (s: InventorySection[]) => flat(s).flatMap(names);

  it('All with no query keeps everything, including empty locations', () => {
    expect(filterInventory(sections, 'all', '')).toBe(sections);
  });

  it('Low shows low and out items only, dropping empty locations and groups', () => {
    expect(shown(filterInventory(sections, 'low', ''))).toEqual(['Chicken thighs', 'Coffee beans']);
    const eggsOut = buildInventory(
      seedGroups,
      seedLocations,
      seedItems.map((i) => (i.id === 'it-eggs' ? { ...i, amount: 0 } : i)),
      [],
    );
    expect(shown(filterInventory(eggsOut, 'out', ''))).toEqual(['Eggs']);
    expect(filterInventory(eggsOut, 'out', '')).toHaveLength(1);
  });

  it('search matches names across locations, case-insensitive', () => {
    expect(shown(filterInventory(sections, 'all', 'BEANS'))).toEqual([
      'Black beans, opened',
      'Black beans',
      'Coffee beans',
    ]);
    expect(shown(filterInventory(sections, 'low', 'beans'))).toEqual(['Coffee beans']);
    expect(filterInventory(sections, 'all', 'zzz')).toEqual([]);
  });

  it('counts low and out for the chips', () => {
    expect(statusCounts(sections)).toEqual({ low: 2, out: 0 });
  });
});

describe('locationLabel', () => {
  it('prefixes the group', () => {
    expect(locationLabel('loc-shelf1', seedLocations, seedGroups)).toBe('Pantry · Shelf 1');
    expect(locationLabel('loc-fridge', seedLocations, seedGroups)).toBe('Refrigerator');
    expect(locationLabel(null, seedLocations, seedGroups)).toBe('Unassigned');
  });
});
