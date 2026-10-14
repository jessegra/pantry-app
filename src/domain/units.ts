// Unit choices offered as chips. Free text is always allowed too.
import type { CategoryKey } from './types';

export const COUNT_UNITS = ['can', 'bag', 'each', 'box', 'jar', 'bottle', 'pack', 'stick', 'carton'];
export const MEASURE_UNITS = ['oz', 'lb', 'gal', 'g', 'kg', 'ml', 'l'];
export const ITEM_UNITS = [...COUNT_UNITS.slice(0, 3), 'oz', 'lb', 'gal', ...COUNT_UNITS.slice(3)];
/** "1 can = 8 oz": what's inside one unit. */
export const PACKAGE_UNITS = ['oz', 'fl oz', 'lb', 'g', 'kg', 'ml', 'l', 'each'];
/** Open one (SPEC §4.3): these, plus the parent's unit if different. */
export const LEFTOVER_UNITS = ['can', 'oz', 'lb', 'bag', 'each'];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  canned: 'Canned goods',
  dairy: 'Dairy',
  eggs: 'Eggs',
  butter: 'Butter & spreads',
  baking: 'Baking',
  oil: 'Oils & vinegars',
  frozen: 'Frozen',
  meat: 'Meat & fish',
  coffee: 'Coffee & tea',
  grains: 'Grains & bread',
  produce: 'Produce',
  household: 'Household',
  generic: 'Other',
};

/** Adds `extra` to `base` when it's set and not already there. */
export function withUnit(base: string[], extra?: string): string[] {
  return extra && !base.includes(extra) ? [...base, extra] : base;
}
