import { describe, expect, it } from 'vitest';
import {
  autoMatch,
  checkRecipe,
  ingredientStatus,
  ingredientWords,
  isStapleName,
  missingForShopping,
  pantryContext,
  suggestItem,
} from './recipeMatch';
import { seedItems, seedListEntries, seedRecipes, seedStaples } from './seed';
import type { Item, Recipe, RecipeIngredient } from './types';

const ctx = pantryContext(seedItems, seedStaples);
const recipe = (id: string) => seedRecipes.find((r) => r.id === id)!;
const names = (ings: RecipeIngredient[]) => ings.map((i) => i.name);
const withItem = (id: string, patch: Partial<Item>) => seedItems.map((i) => (i.id === id ? { ...i, ...patch } : i));
const ing = (patch: Partial<RecipeIngredient>): RecipeIngredient => ({
  id: 'x',
  text: '',
  name: 'x',
  match: 'none',
  ...patch,
});

describe('ingredient names', () => {
  it('drops descriptions and plurals', () => {
    expect(ingredientWords('2 Large Eggs')).toEqual(['2', 'egg']);
    expect(ingredientWords('large eggs')).toEqual(['egg']);
    expect(ingredientWords('all-purpose flour')).toEqual(['flour']);
    expect(ingredientWords('shredded mozzarella')).toEqual(['mozzarella']);
    expect(ingredientWords('Black beans, opened')).toEqual(['black', 'bean']);
    expect(ingredientWords('tomatoes')).toEqual(['tomato']);
    expect(ingredientWords('berries')).toEqual(['berry']);
  });
});

describe('suggestItem / autoMatch', () => {
  it('links exact names, never leftovers', () => {
    expect(suggestItem('large eggs', seedItems)).toEqual({ itemId: 'it-eggs', confidence: 'exact' });
    expect(suggestItem('chicken thighs', seedItems)).toEqual({ itemId: 'it-chicken', confidence: 'exact' });
    expect(suggestItem('black beans', seedItems)).toEqual({ itemId: 'it-blackbeans', confidence: 'exact' });
    expect(suggestItem('frozen peas', seedItems)).toEqual({ itemId: 'it-peas', confidence: 'exact' });
  });

  it('only suggests (asks about) partial overlaps', () => {
    expect(suggestItem('coconut milk', seedItems)).toEqual({ itemId: 'it-milk', confidence: 'unsure' });
    expect(suggestItem('beans', seedItems)).toEqual({ itemId: 'it-blackbeans', confidence: 'unsure' });
    expect(suggestItem('chicken', seedItems)).toEqual({ itemId: 'it-chicken', confidence: 'unsure' });
    expect(suggestItem('tortillas', seedItems)).toBeNull();
  });

  it('first guess: item, else staple, else ask', () => {
    expect(autoMatch('flour', seedItems, seedStaples)).toEqual({
      match: 'item',
      itemId: 'it-flour',
      needsReview: false,
    });
    expect(autoMatch('olive oil', seedItems, seedStaples)).toEqual({
      match: 'item',
      itemId: 'it-oil',
      needsReview: false,
    });
    expect(autoMatch('vegetable oil', seedItems, seedStaples)).toEqual({ match: 'staple', needsReview: false });
    expect(autoMatch('kosher salt', seedItems, seedStaples)).toEqual({ match: 'staple', needsReview: false });
    expect(autoMatch('coconut milk', seedItems, seedStaples)).toEqual({
      match: 'item',
      itemId: 'it-milk',
      needsReview: true,
    });
    expect(autoMatch('baking powder', seedItems, seedStaples)).toEqual({ match: 'none', needsReview: true });
  });

  it('recognizes staples, including pairs', () => {
    expect(isStapleName('salt and pepper', seedStaples)).toBe(true);
    expect(isStapleName('black pepper', seedStaples)).toBe(true);
    expect(isStapleName('warm water', seedStaples)).toBe(true);
    expect(isStapleName('salt and cumin', seedStaples)).toBe(false);
    expect(isStapleName('peppercorns', seedStaples)).toBe(false);
  });
});

describe('do I have it?', () => {
  it('reads each ingredient against the pantry', () => {
    expect(ingredientStatus(ing({ match: 'staple' }), ctx)).toBe('staple');
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-eggs' }), ctx)).toBe('have');
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-chicken' }), ctx)).toBe('low');
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-rice' }), ctx)).toBe('have'); // not tracked: assumed
    expect(ingredientStatus(ing({ match: 'none', name: 'yeast' }), ctx)).toBe('missing');
    expect(ingredientStatus(ing({ match: 'none', name: 'salt' }), ctx)).toBe('staple');
  });

  it('counts an opened leftover toward its item', () => {
    const out = pantryContext(withItem('it-blackbeans', { amount: 0 }), seedStaples);
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-blackbeans' }), out)).toBe('low');
    const noneLeft = pantryContext(
      withItem('it-blackbeans', { amount: 0 }).map((i) => (i.id === 'it-blackbeans-open' ? { ...i, amount: 0 } : i)),
      seedStaples,
    );
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-blackbeans' }), noneLeft)).toBe('missing');
  });

  it('a substitute counts; the best of them wins', () => {
    const noMilk = pantryContext(withItem('it-milk', { amount: 0 }), seedStaples);
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-milk' }), noMilk)).toBe('missing');
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-milk', substituteIds: ['it-butter'] }), noMilk)).toBe(
      'have',
    );
  });

  it('a deleted or archived linked item falls back to the name', () => {
    const archived = pantryContext(withItem('it-eggs', { archivedAt: 1 }), seedStaples);
    expect(ingredientStatus(ing({ match: 'item', itemId: 'it-eggs', name: 'eggs' }), archived)).toBe('missing');
    expect(ingredientStatus(ing({ match: 'item', itemId: 'gone', name: 'sugar' }), ctx)).toBe('staple');
  });
});

describe('the sample recipes against the sample pantry', () => {
  it('match as typed', () => {
    const waffles = recipe('rc-waffles').ingredients;
    expect(waffles.map((i) => [i.name, i.match, i.itemId ?? null])).toEqual([
      ['flour', 'item', 'it-flour'],
      ['baking powder', 'none', null],
      ['sugar', 'staple', null],
      ['salt', 'staple', null],
      ['large eggs', 'item', 'it-eggs'],
      ['milk', 'item', 'it-milk'],
      ['butter', 'item', 'it-butter'],
    ]);
    expect(waffles[6]).toMatchObject({ quantity: 0.5, unit: 'cup', prep: 'melted' });
    const coconut = recipe('rc-curry').ingredients.find((i) => i.name === 'coconut milk')!;
    expect(coconut).toMatchObject({ match: 'none', quantity: 1, unit: 'can' });
  });

  it('show a mix: ready, almost, need more', () => {
    const summary = seedRecipes.map((r) => {
      const c = checkRecipe(r, ctx);
      return [r.name, c.readiness, names(c.missing)];
    });
    expect(summary).toEqual([
      ['Waffles', 'almost', ['baking powder']],
      ['Chicken tacos', 'almost', ['small tortillas', 'shredded cheese', 'onion']],
      ['Pizza', 'almost', ['yeast', 'tomato sauce', 'shredded mozzarella']],
      ['Skillet flatbread', 'ready', []],
      ['Vegetable curry', 'more', ['onion', 'garlic', 'curry paste', 'coconut milk', 'chickpeas']],
    ]);
    const tacos = checkRecipe(recipe('rc-tacos'), ctx);
    expect(names(tacos.low)).toEqual(['chicken thighs']);
    expect(names(tacos.optionalMissing)).toEqual(['salsa', 'lime wedges']);
  });

  it('running out of something moves a recipe down', () => {
    const noFlour = pantryContext(withItem('it-flour', { amount: 0 }), seedStaples);
    expect(checkRecipe(recipe('rc-flatbread'), noFlour)).toMatchObject({ readiness: 'almost' });
  });
});

describe('add missing to list', () => {
  it('adds each missing ingredient once, by item where linked, skipping what is already listed', () => {
    const r: Recipe = {
      ...recipe('rc-tacos'),
      ingredients: [
        ...recipe('rc-tacos').ingredients,
        ing({ id: 'e1', name: 'eggs', match: 'item', itemId: 'it-eggs' }),
      ],
    };
    const noEggs = pantryContext(withItem('it-eggs', { amount: 0 }), seedStaples);
    // The sample list already has Tortillas.
    expect(missingForShopping(r, noEggs, seedListEntries)).toEqual([
      { name: 'Shredded cheese' },
      { name: 'Onion' },
      { itemId: 'it-eggs', name: 'Eggs' },
    ]);
  });

  it('nothing for a ready recipe', () => {
    expect(missingForShopping(recipe('rc-flatbread'), ctx, [])).toEqual([]);
  });
});
