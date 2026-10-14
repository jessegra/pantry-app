import { describe, expect, it } from 'vitest';
import { guessCategory } from './icons';
import { seedItems } from '../domain/seed';

describe('guessCategory', () => {
  it('matches the sample data categories', () => {
    for (const item of seedItems) expect([item.name, guessCategory(item.name)]).toEqual([item.name, item.category]);
  });
  it('falls back to generic', () => {
    expect(guessCategory('Mystery jar')).toBe('generic');
    expect(guessCategory('Tortillas')).toBe('grains');
    expect(guessCategory('Lemons')).toBe('produce');
  });
});
