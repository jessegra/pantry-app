import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './recipeParse';

const p = parseIngredientLine;

describe('parseIngredientLine', () => {
  it('reads quantities: whole, decimal, fractions, mixed, unicode, ranges', () => {
    expect(p('2 cups flour')).toEqual({ quantity: 2, unit: 'cup', name: 'flour', optional: false });
    expect(p('1.5 cups milk')).toMatchObject({ quantity: 1.5, unit: 'cup', name: 'milk' });
    expect(p('1/2 tsp salt')).toMatchObject({ quantity: 0.5, unit: 'tsp', name: 'salt' });
    expect(p('1 1/2 cups water')).toMatchObject({ quantity: 1.5, unit: 'cup', name: 'water' });
    expect(p('1½ cups milk')).toMatchObject({ quantity: 1.5, unit: 'cup' });
    expect(p('¾ cup sugar')).toMatchObject({ quantity: 0.75, unit: 'cup', name: 'sugar' });
    expect(p('2-3 cloves garlic')).toMatchObject({ quantity: 3, unit: 'clove', name: 'garlic' });
    expect(p('2 to 3 tbsp olive oil')).toMatchObject({ quantity: 3, unit: 'tbsp', name: 'olive oil' });
  });

  it('normalizes units, including T vs t', () => {
    expect(p('2 Tbsp. butter')).toMatchObject({ quantity: 2, unit: 'tbsp', name: 'butter' });
    expect(p('1 T sugar')).toMatchObject({ unit: 'tbsp', name: 'sugar' });
    expect(p('1 t salt')).toMatchObject({ unit: 'tsp', name: 'salt' });
    expect(p('500 g pasta')).toMatchObject({ quantity: 500, unit: 'g', name: 'pasta' });
    expect(p('8 fl oz cream')).toMatchObject({ quantity: 8, unit: 'fl oz', name: 'cream' });
    expect(p('1 lb chicken thighs')).toMatchObject({ quantity: 1, unit: 'lb', name: 'chicken thighs' });
  });

  it('counts without a unit, sizes in brackets, a/an', () => {
    expect(p('2 large eggs')).toMatchObject({ quantity: 2, unit: undefined, name: 'large eggs' });
    expect(p('1 (15 oz) can black beans')).toMatchObject({ quantity: 1, unit: 'can', name: 'black beans' });
    expect(p('a pinch of salt')).toMatchObject({ quantity: 1, unit: 'pinch', name: 'salt' });
    expect(p('an onion')).toMatchObject({ quantity: 1, name: 'onion' });
    expect(p('8 tortillas')).toMatchObject({ quantity: 8, unit: undefined, name: 'tortillas' });
  });

  it('splits preparation, drops "to taste", spots optional', () => {
    expect(p('½ cup butter, melted')).toMatchObject({ name: 'butter', prep: 'melted' });
    expect(p('1 onion, finely diced')).toMatchObject({ name: 'onion', prep: 'finely diced' });
    expect(p('salt and pepper, to taste')).toEqual({
      quantity: undefined,
      unit: undefined,
      name: 'salt and pepper',
      optional: false,
    });
    expect(p('cilantro (optional)')).toMatchObject({ name: 'cilantro', optional: true });
    expect(p('Optional: 1 cup pepperoni')).toMatchObject({
      quantity: 1,
      unit: 'cup',
      name: 'pepperoni',
      optional: true,
    });
    expect(p('lime wedges, optional')).toMatchObject({ name: 'lime wedges', optional: true });
  });

  it('leaves words that look like units alone when there is no quantity', () => {
    expect(p('can of worms')).toMatchObject({ unit: undefined, name: 'can of worms' });
    expect(p('Tomato sauce')).toMatchObject({ unit: undefined, name: 'Tomato sauce' });
  });
});
