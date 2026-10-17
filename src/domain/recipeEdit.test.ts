import { describe, expect, it } from 'vitest';
import {
  addSubstitute,
  cleanRecipeInput,
  cleanTags,
  draftIngredients,
  ingredientsText,
  parseServings,
  recipeProblem,
  removeSubstitute,
  setMatch,
} from './recipeEdit';
import { seedItems, seedRecipes, seedStaples } from './seed';
import type { RecipeIngredient } from './types';

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const draft = (text: string, previous: RecipeIngredient[] = [], items = seedItems) =>
  draftIngredients(text, previous, items, seedStaples, ids());

describe('typing ingredients', () => {
  it('matches each line: clear items and staples are taken, the rest asked', () => {
    const d = draft('2 cups flour\n\n 1 tsp salt \n1 can coconut milk\n3 limes\nsalsa, optional');
    expect(
      d.map((x) => [x.ingredient.text, x.ingredient.match, x.ingredient.itemId, x.needsReview, x.suggestedId]),
    ).toEqual([
      ['2 cups flour', 'item', 'it-flour', false, undefined],
      ['1 tsp salt', 'staple', undefined, false, undefined],
      // "Milk" might be meant, but it's asked, never assumed.
      ['1 can coconut milk', 'none', undefined, true, 'it-milk'],
      ['3 limes', 'none', undefined, true, undefined],
      ['salsa, optional', 'none', undefined, true, undefined],
    ]);
    expect(d[0].ingredient).toMatchObject({ id: 'new-1', quantity: 2, unit: 'cup', name: 'flour' });
    expect(d[4].ingredient.optional).toBe(true);
  });

  it('a line typed as before keeps its earlier answer', () => {
    const tacos = seedRecipes.find((r) => r.id === 'rc-tacos')!;
    const linked = tacos.ingredients.map((i) =>
      i.text === '8 small tortillas' ? { ...i, match: 'staple' as const } : i,
    );
    const d = draft(`${ingredientsText(linked)}\n2 eggs`, linked);
    expect(d.slice(0, -1).map((x) => x.ingredient)).toEqual(linked);
    expect(d.every((x, i) => i === d.length - 1 || !x.needsReview)).toBe(true);
    expect(d.at(-1)!.ingredient).toMatchObject({ match: 'item', itemId: 'it-eggs' });
  });

  it('asks again about a line whose item was deleted', () => {
    const prev: RecipeIngredient[] = [{ id: 'a', text: '2 eggs', name: 'eggs', match: 'item', itemId: 'it-gone' }];
    const [d] = draft('2 eggs', prev);
    expect(d.ingredient).toEqual({ id: 'a', text: '2 eggs', name: 'eggs', match: 'none' });
    expect(d).toMatchObject({ needsReview: true, suggestedId: 'it-eggs' });
  });
});

describe('the review', () => {
  const ing: RecipeIngredient = { id: 'a', text: '1 can coconut milk', name: 'coconut milk', match: 'none' };

  it('links, makes a staple, or leaves it', () => {
    const linked = setMatch(ing, 'item', 'it-milk');
    expect(linked).toMatchObject({ match: 'item', itemId: 'it-milk' });
    expect(setMatch(linked, 'staple')).toEqual({ ...ing, match: 'staple' });
    expect(setMatch(linked, 'none')).toEqual(ing);
    expect(setMatch(ing, 'item')).toEqual(ing); // no item chosen
  });

  it('adds and removes substitutes, never the item itself or twice', () => {
    const linked = setMatch(ing, 'item', 'it-butter');
    const both = addSubstitute(addSubstitute(addSubstitute(linked, 'it-oil'), 'it-oil'), 'it-butter');
    expect(both.substituteIds).toEqual(['it-oil']);
    expect(removeSubstitute(both, 'it-oil')).toEqual(linked);
    expect(addSubstitute(ing, 'it-oil')).toBe(ing); // unlinked: nothing to substitute for
    // Linking to what was a substitute drops it from the substitutes.
    expect(setMatch(both, 'item', 'it-oil')).toMatchObject({ itemId: 'it-oil' });
    expect(setMatch(both, 'item', 'it-oil').substituteIds).toBeUndefined();
  });
});

describe('saving', () => {
  it('tags are lower case, without repeats', () => {
    expect(cleanTags(['Breakfast', ' quick ,breakfast', '', 'Weekend'])).toEqual(['breakfast', 'quick', 'weekend']);
  });

  it('servings are a whole number or nothing', () => {
    expect(parseServings('')).toBeUndefined();
    expect(parseServings(' 4 ')).toBe(4);
    expect(parseServings('0')).toBe('invalid');
    expect(parseServings('2.5')).toBe('invalid');
    expect(parseServings('four')).toBe('invalid');
  });

  it('needs a name not already used by another recipe', () => {
    expect(recipeProblem({ name: '  ' }, seedRecipes)).toBe('Give the recipe a name.');
    expect(recipeProblem({ name: 'waffles ' }, seedRecipes)).toBe('There’s already a recipe called waffles.');
    expect(recipeProblem({ name: 'Waffles' }, seedRecipes, 'rc-waffles')).toBeNull();
    expect(recipeProblem({ name: 'Pancakes' }, seedRecipes)).toBeNull();
  });

  it('trims and leaves out empty text', () => {
    expect(
      cleanRecipeInput({ name: ' Fried  rice ', tags: ['Dinner'], ingredients: [], steps: '  ', notes: ' Good. ' }),
    ).toEqual({ name: 'Fried rice', tags: ['dinner'], ingredients: [], notes: 'Good.' });
  });
});
