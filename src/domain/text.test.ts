import { describe, expect, it } from 'vitest';
import { findDuplicates, nameKey, plural, relativeTime } from './text';

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

describe('relativeTime', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  it('reads naturally', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 60_000, now)).toBe('1 minute ago');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(relativeTime(now - 2 * 3600_000, now)).toBe('2 hours ago');
    expect(relativeTime(now - 26 * 3600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 3 * 86400_000, now)).toBe('3 days ago');
    expect(relativeTime(now + 5000, now)).toBe('just now'); // a phone clock slightly ahead
  });
});
