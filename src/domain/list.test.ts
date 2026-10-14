import { describe, expect, it } from 'vitest';
import { autoReason, parseListInput } from './list';
import { seedItems } from './seed';

const byId = (id: string) => seedItems.find((i) => i.id === id)!;

describe('parseListInput', () => {
  it('reads a leading quantity', () => {
    expect(parseListInput('4 lemons')).toEqual({ name: 'Lemons', quantity: 4, unit: undefined });
    expect(parseListInput('  dish soap ')).toEqual({ name: 'Dish soap' });
    expect(parseListInput('7up')).toEqual({ name: '7up' });
    expect(parseListInput('2')).toEqual({ name: '2' });
  });

  it('reads a unit after the quantity', () => {
    expect(parseListInput('2 lb ground beef')).toEqual({ name: 'Ground beef', quantity: 2, unit: 'lb' });
    expect(parseListInput('3 cans of tomatoes')).toEqual({ name: 'Tomatoes', quantity: 3, unit: 'can' });
    expect(parseListInput('1½ bags rice')).toEqual({ name: 'Rice', quantity: 1.5, unit: 'bag' });
    expect(parseListInput('2 boxes')).toEqual({ name: 'Boxes', quantity: 2, unit: undefined });
  });
});

describe('autoReason', () => {
  it('says why and to what', () => {
    expect(autoReason(byId('it-chicken'))).toBe('low, back to 4 lb');
    expect(autoReason(byId('it-coffee'))).toBe('low, back to 2 bags');
    expect(autoReason({ ...byId('it-milk'), amount: 0 })).toBe('out, back to 2 gal');
    expect(autoReason(byId('it-rice'))).toBe('');
  });
});
