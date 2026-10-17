// Phase 2 of recipes: "do I have enough" (docs/RECIPES_PLAN.md, step 4). Pure.
// Amounts are compared only where the units allow it: the same unit, weight to
// weight, volume to volume, or through an item's package size (1 can = 15 oz).
// Weight and volume never convert into each other (that needs a density).
import { isSetUp } from './rules';
import type { Item, RecipeIngredient } from './types';

type Dimension = 'weight' | 'volume';

/** Grams or millilitres per unit. US measures; a stick is butter's ½ cup. */
const MEASURES: Record<string, { dim: Dimension; base: number }> = {
  g: { dim: 'weight', base: 1 },
  kg: { dim: 'weight', base: 1000 },
  oz: { dim: 'weight', base: 28.3495 },
  lb: { dim: 'weight', base: 453.592 },
  ml: { dim: 'volume', base: 1 },
  l: { dim: 'volume', base: 1000 },
  tsp: { dim: 'volume', base: 4.92892 },
  tbsp: { dim: 'volume', base: 14.7868 },
  'fl oz': { dim: 'volume', base: 29.5735 },
  cup: { dim: 'volume', base: 236.588 },
  pt: { dim: 'volume', base: 473.176 },
  qt: { dim: 'volume', base: 946.353 },
  gal: { dim: 'volume', base: 3785.41 },
  stick: { dim: 'volume', base: 118.294 },
};

/** Item units are free text: "cans", "Each", "lbs" mean the same as "can", "each", "lb". */
export function normalUnit(unit: string | undefined): string {
  const u = (unit ?? '').trim().toLocaleLowerCase().replace(/\.$/, '');
  if (!u || u === 'each' || u === 'ea' || u === 'whole') return 'each';
  const aliases: Record<string, string> = {
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
    ounce: 'oz',
    ounces: 'oz',
    grams: 'g',
    gram: 'g',
    liter: 'l',
    liters: 'l',
    litre: 'l',
    litres: 'l',
    gallon: 'gal',
    gallons: 'gal',
    quart: 'qt',
    quarts: 'qt',
    pint: 'pt',
    pints: 'pt',
    cups: 'cup',
    'fl. oz': 'fl oz',
    floz: 'fl oz',
  };
  if (aliases[u]) return aliases[u];
  if (MEASURES[u] || u.length <= 3 || !/^[a-z]+s$/.test(u)) return u;
  return /(?:x|ch|sh)es$/.test(u) ? u.slice(0, -2) : u.slice(0, -1); // boxes, cans
}

/** `n` of `from`, in `to`; undefined when the units don't convert. */
export function convert(n: number, from: string, to: string): number | undefined {
  const f = normalUnit(from);
  const t = normalUnit(to);
  if (f === t) return n;
  const a = MEASURES[f];
  const b = MEASURES[t];
  if (a && b && a.dim === b.dim) return (n * a.base) / b.base;
  return undefined;
}

/** How much of `item` is on hand, in `unit`: directly, or through its package size. */
function onHandIn(item: Item, unit: string): number | undefined {
  const direct = convert(item.amount, item.unit ?? 'each', unit);
  if (direct !== undefined) return direct;
  const pkg = item.packageSize;
  return pkg ? convert(item.amount * pkg.amount, pkg.unit, unit) : undefined;
}

export type AmountCheck =
  | { kind: 'enough' | 'short'; have: number; need: number; unit: string }
  /** The recipe and the pantry measure it differently ("2 cups" of a bag of flour). */
  | { kind: 'unknown'; recipeUnit: string; itemUnit: string };

/**
 * Is there enough of one item (and its opened leftovers) for an ingredient?
 * undefined = nothing to compare: no quantity in the recipe, or no amount tracked.
 * A leftover that can't be converted is left out of the total.
 */
export function amountFor(ing: RecipeIngredient, item: Item, leftovers: Item[] = []): AmountCheck | undefined {
  if (ing.quantity === undefined || !isSetUp(item)) return undefined;
  const unit = normalUnit(ing.unit);
  const own = onHandIn(item, unit);
  if (own === undefined) return { kind: 'unknown', recipeUnit: unit, itemUnit: normalUnit(item.unit) };
  const extra = leftovers.reduce((sum, l) => sum + (onHandIn(l, unit) ?? 0), 0);
  const have = Math.round((own + extra) * 1000) / 1000;
  // A whisker under counts as enough: bars move in steps and conversions round.
  const enough = have >= ing.quantity * 0.98;
  return { kind: enough ? 'enough' : 'short', have, need: ing.quantity, unit };
}
