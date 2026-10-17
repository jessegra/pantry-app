import { describe, expect, it } from 'vitest';
import { amountFor, convert, normalUnit } from './recipeAmount';
import { checkRecipe, missingForShopping, pantryContext } from './recipeMatch';
import { parseIngredientLine } from './recipeParse';
import { seedItems, seedRecipes, seedStaples } from './seed';
import type { Item, RecipeIngredient } from './types';

const item = (id: string, patch: Partial<Item> = {}) => ({ ...seedItems.find((i) => i.id === id)!, ...patch });
const line = (text: string, itemId = 'x'): RecipeIngredient => ({
  id: 'i',
  text,
  ...parseIngredientLine(text),
  match: 'item',
  itemId,
});
const beansLeftover = item('it-blackbeans-open');

describe('units', () => {
  it('reads free-text units the same way', () => {
    expect(['cans', 'Can', 'can.'].map(normalUnit)).toEqual(['can', 'can', 'can']);
    expect([undefined, '', 'Each', 'ea'].map(normalUnit)).toEqual(['each', 'each', 'each', 'each']);
    expect(['lbs', 'Pounds', 'cups', 'boxes', 'oz', 'tbsp'].map(normalUnit)).toEqual([
      'lb',
      'lb',
      'cup',
      'box',
      'oz',
      'tbsp',
    ]);
  });

  it('converts weight to weight and volume to volume, never across', () => {
    expect(convert(1, 'gal', 'cup')).toBeCloseTo(16);
    expect(convert(1, 'lb', 'oz')).toBeCloseTo(16);
    expect(convert(3, 'tsp', 'tbsp')).toBeCloseTo(1);
    expect(convert(1, 'kg', 'lb')).toBeCloseTo(2.2046);
    expect(convert(2, 'stick', 'cup')).toBeCloseTo(1); // butter
    expect(convert(2, 'cans', 'can')).toBe(2);
    expect(convert(1, 'cup', 'g')).toBeUndefined();
    expect(convert(1, 'bag', 'cup')).toBeUndefined();
  });
});

describe('do I have enough?', () => {
  it('compares in the same unit, or by converting', () => {
    expect(amountFor(line('2 large eggs'), item('it-eggs'))).toEqual({
      kind: 'enough',
      have: 9,
      need: 2,
      unit: 'each',
    });
    expect(amountFor(line('2 large eggs'), item('it-eggs', { amount: 1 }))).toMatchObject({ kind: 'short', have: 1 });
    expect(amountFor(line('1¾ cups milk'), item('it-milk'))).toMatchObject({ kind: 'enough', have: 16, unit: 'cup' });
    expect(amountFor(line('1¾ cups milk'), item('it-milk', { amount: 0.1 }))).toMatchObject({
      kind: 'short',
      have: 1.6,
    });
    expect(amountFor(line('½ cup butter, melted'), item('it-butter'))).toMatchObject({ kind: 'enough', have: 1 });
    expect(amountFor(line('2 lb chicken thighs'), item('it-chicken'))).toMatchObject({
      kind: 'short',
      have: 1,
      need: 2,
    });
  });

  it('goes through the package size, and counts opened leftovers', () => {
    // 3 cans × 8 oz + 4 oz opened = 28 oz.
    expect(amountFor(line('12 oz black beans'), item('it-blackbeans'), [beansLeftover])).toMatchObject({
      kind: 'enough',
      have: 28,
    });
    expect(amountFor(line('12 oz black beans'), item('it-blackbeans', { amount: 0.5 }), [beansLeftover])).toMatchObject(
      { kind: 'short', have: 8 },
    );
    // A leftover in a unit that doesn't convert is left out.
    expect(
      amountFor(line('2 cans black beans'), item('it-blackbeans'), [{ ...beansLeftover, unit: 'scoop' }]),
    ).toMatchObject({ kind: 'enough', have: 3 });
  });

  it('says when it can’t compare, and stays quiet when there is nothing to compare', () => {
    expect(amountFor(line('2 cups flour'), item('it-flour'))).toEqual({
      kind: 'unknown',
      recipeUnit: 'cup',
      itemUnit: 'bag',
    });
    // Volume vs. a can measured by weight: no density, no guess.
    expect(amountFor(line('1 cup black beans'), item('it-blackbeans'))).toMatchObject({ kind: 'unknown' });
    expect(amountFor(line('2 cups rice'), item('it-rice'))).toBeUndefined(); // no amount tracked
    expect(amountFor(line('salt and pepper'), item('it-eggs'))).toBeUndefined(); // no quantity
  });

  it('a whisker under is still enough', () => {
    expect(amountFor(line('1 lb chicken'), item('it-chicken', { amount: 0.99 }))).toMatchObject({ kind: 'enough' });
  });
});

describe('recipes with amounts', () => {
  const waffles = seedRecipes.find((r) => r.id === 'rc-waffles')!;
  const withItems = (patches: Record<string, Partial<Item>>) =>
    pantryContext(
      seedItems.map((i) => ({ ...i, ...patches[i.id] })),
      seedStaples,
    );

  it('not enough counts as missing, and goes on the list', () => {
    const ctx = withItems({ 'it-eggs': { amount: 1 } });
    const check = checkRecipe(waffles, ctx);
    const eggs = waffles.ingredients.find((i) => i.name === 'large eggs')!;
    expect(check.status.get(eggs.id)).toBe('short');
    expect(check.amounts.get(eggs.id)).toMatchObject({ kind: 'short', have: 1, need: 2 });
    expect(check.missing.map((i) => i.name)).toEqual(['baking powder', 'large eggs']);
    expect(check.readiness).toBe('almost');
    expect(missingForShopping(waffles, ctx, []).map((m) => m.name)).toEqual(['Baking powder', 'Eggs']);
  });

  it('enough of a low item is still low, not short', () => {
    const ctx = withItems({ 'it-eggs': { amount: 2 } });
    const eggs = waffles.ingredients.find((i) => i.name === 'large eggs')!;
    expect(checkRecipe(waffles, ctx).status.get(eggs.id)).toBe('low');
  });

  it('a substitute with enough wins over a linked item without', () => {
    const recipe = {
      ...waffles,
      ingredients: [{ ...line('½ cup butter', 'it-butter'), substituteIds: ['it-oil'] }],
    };
    const ctx = withItems({ 'it-butter': { amount: 0.5 } });
    expect(checkRecipe(recipe, ctx).status.get('i')).toBe('have'); // oil: amount not comparable, counts as have
    expect(checkRecipe({ ...recipe, ingredients: [line('½ cup butter', 'it-butter')] }, ctx).status.get('i')).toBe(
      'short',
    );
  });

  it('the sample pantry still shows a mix of Ready, Almost and Need more', () => {
    const ctx = pantryContext(seedItems, seedStaples);
    expect(seedRecipes.map((r) => [r.id, checkRecipe(r, ctx).readiness])).toEqual([
      ['rc-waffles', 'almost'],
      ['rc-tacos', 'almost'],
      ['rc-pizza', 'almost'],
      ['rc-flatbread', 'ready'],
      ['rc-curry', 'more'],
    ]);
  });
});
