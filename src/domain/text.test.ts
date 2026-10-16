import { describe, expect, it } from 'vitest';
import { findDuplicates, nameKey, plural } from './text';

describe('text', () => {
  it('plural', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(2, 'list entry', 'list entries')).toBe('2 list entries');
  });

  it('nameKey ignores case and spacing', () => {
    expect(nameKey('  Garage   Shelf ')).toBe(nameKey('garage shelf'));
    expect(nameKey('Shelf 1')).not.toBe(nameKey('Shelf 2'));
  });

  it('findDuplicates keeps the first of each same-named set, within a scope', () => {
    const rows = [
      { id: 'a', name: 'Garage', g: null },
      { id: 'b', name: 'garage ', g: null },
      { id: 'c', name: 'Shelf 1', g: 'pantry' },
      { id: 'd', name: 'Shelf 1', g: 'garage' }, // different group: not a duplicate
      { id: 'e', name: 'GARAGE', g: null },
    ];
    const dups = findDuplicates(rows, (r) => String(r.g));
    expect(dups.map((d) => [d.keep.id, d.merge.map((m) => m.id)])).toEqual([['a', ['b', 'e']]]);
  });
});
