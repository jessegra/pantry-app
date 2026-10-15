import { describe, expect, it } from 'vitest';
import { categoryIcon, defaultCategories, guessCategory, parseKeywords, sortCategories } from './categories';
import { CATEGORY_ICONS } from '../ui/icons';
import type { Category } from './types';

const defaults = defaultCategories();
const snacks: Category = { id: 'c-snacks', name: 'Snacks', icon: 'generic', keywords: ['chips', 'crackers'], updatedAt: 0 };

describe('guessCategory', () => {
  it('uses the built-in guesses', () => {
    expect(guessCategory('Black beans', defaults)).toBe('canned');
    expect(guessCategory('Mystery jar', defaults)).toBe('generic');
  });

  it('words added in Settings win, matching word starts', () => {
    expect(guessCategory('Tortilla chips', [...defaults, snacks])).toBe('c-snacks'); // not grains
    expect(guessCategory('Rice crackers', [...defaults, snacks])).toBe('c-snacks');
    expect(guessCategory('Microchips', [...defaults, snacks])).toBe('generic'); // not a word start
  });

  it('falls back to Other when the built-in category was deleted', () => {
    expect(guessCategory('Black beans', defaults.filter((c) => c.id !== 'canned'))).toBe('generic');
  });
});

describe('helpers', () => {
  it('parses comma-separated words', () => {
    expect(parseKeywords(' Tortilla, wrap ,, Wrap , ')).toEqual(['tortilla', 'wrap']);
  });

  it('looks up icons, defaulting to the generic box', () => {
    const byId = new Map([...defaults, snacks].map((c) => [c.id, c]));
    expect(categoryIcon('dairy', byId)).toBe(CATEGORY_ICONS.dairy);
    expect(categoryIcon('c-snacks', byId)).toBe(CATEGORY_ICONS.generic);
    expect(categoryIcon('deleted', byId)).toBe(CATEGORY_ICONS.generic);
  });

  it('sorts by name with Other last', () => {
    const names = sortCategories([...defaults, snacks]).map((c) => c.name);
    expect(names[0]).toBe('Baking');
    expect(names.at(-1)).toBe('Other');
    expect(names).toContain('Snacks');
  });
});
