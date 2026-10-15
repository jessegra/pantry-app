import { describe, expect, it } from 'vitest';
import { builtInGuess } from './icons';
import { seedItems } from '../domain/seed';

describe('builtInGuess', () => {
  it('matches the sample data categories', () => {
    for (const item of seedItems) expect([item.name, builtInGuess(item.name)]).toEqual([item.name, item.category]);
  });
  it('falls back to generic', () => {
    expect(builtInGuess('Mystery jar')).toBe('generic');
    expect(builtInGuess('Tortillas')).toBe('grains');
    expect(builtInGuess('Lemons')).toBe('produce');
  });
});
