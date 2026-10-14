import { describe, expect, it } from 'vitest';
import { hasExactMatch, matchItems, nameFromQuery, rankRecent, RECENT_WINDOW_MS } from './quickAdd';
import { seedItems } from './seed';

const NOW = Date.UTC(2026, 9, 13);
const DAY = 24 * 60 * 60 * 1000;
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('rankRecent', () => {
  it('ranks by count, then most recent; ignores old and archived activity', () => {
    const items = seedItems.map((i) => (i.id === 'it-oil' ? { ...i, archivedAt: 1 } : i));
    const events = [
      { itemId: 'it-milk', at: NOW - DAY },
      { itemId: 'it-eggs', at: NOW - 2 * DAY },
      { itemId: 'it-eggs', at: NOW - 3 * DAY },
      { itemId: 'it-butter', at: NOW - 1000 },
      { itemId: 'it-flour', at: NOW - RECENT_WINDOW_MS - 1 }, // too old
      { itemId: 'it-flour', at: NOW - RECENT_WINDOW_MS - 2 },
      { itemId: 'it-oil', at: NOW }, // archived
    ];
    expect(names(rankRecent(events, items, NOW, 3))).toEqual(['Eggs', 'Butter', 'Milk']);
  });

  it('tops up with the newest items when history is thin, up to 9, never archived', () => {
    const items = seedItems.map((i) => (i.id === 'it-oil' ? { ...i, archivedAt: 1 } : i));
    const out = rankRecent([{ itemId: 'it-milk', at: NOW }], items, NOW);
    expect(out).toHaveLength(9);
    expect(out[0].name).toBe('Milk');
    expect(out[1].name).toBe('Flour'); // newest createdAt after Olive oil (archived)
    expect(names(out)).not.toContain('Olive oil');
  });
});

describe('matchItems', () => {
  it('puts names starting with the query first', () => {
    expect(names(matchItems(seedItems, 'be'))).toEqual(['Black beans', 'Black beans, opened', 'Coffee beans']);
    expect(names(matchItems(seedItems, 'b'))).toEqual(['Black beans', 'Black beans, opened', 'Butter', 'Coffee beans']);
    expect(names(matchItems(seedItems, 'co'))).toEqual(['Coffee beans']);
    expect(matchItems(seedItems, '  ')).toEqual([]);
  });
});

describe('helpers', () => {
  it('names from a query and spots exact matches', () => {
    expect(nameFromQuery('  tortillas   corn ')).toBe('Tortillas corn');
    expect(hasExactMatch(seedItems, 'milk ')).toBe(true);
    expect(hasExactMatch(seedItems, 'mil')).toBe(false);
  });
});
