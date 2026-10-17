// Category icons (24×24 viewBox, stroke-only, round caps/joins) and UI glyphs,
// lifted from the mockups. Render as:
// <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
//      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={...} /></svg>
import type { CategoryKey } from '../domain/types';

export const CATEGORY_ICONS: Record<CategoryKey, string> = {
  canned: 'M6 5c0-1.1 2.7-2 6-2s6 .9 6 2v14c0 1.1-2.7 2-6 2s-6-.9-6-2V5zM6 5c0 1.1 2.7 2 6 2s6-.9 6-2M6 10.5h12M6 14.5h12',
  dairy: 'M8 3h8v3l3 4v11H5V10l3-4V3zM5 10h14M8 6h8',
  eggs: 'M12 3c3.5 0 6.5 5.5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.5 8.5 3 12 3z',
  butter: 'M3 10l4-3h14v8l-4 3H3v-8zM3 10h14v8M17 10l4-3',
  baking: 'M6 8h12l1 13H5L6 8zM8 8V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V8M9 13h6',
  oil: 'M10 2.5h4v3.5l2 3v11.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3V2.5zM8 13h8',
  frozen: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5',
  meat: 'M14 3.5a6 6 0 0 1 5.5 8.5c-1.2 2.6-4.4 3.3-6.5 2.5L9 18.5a2 2 0 1 1-2.8 1.3 2 2 0 1 1-1-3.3l4-4c-.7-2.2-.2-5.2 2.2-7.4a6 6 0 0 1 2.6-1.6z',
  coffee: 'M12 3c4 0 7 4 7 9s-3 9-7 9-7-4-7-9 3-9 7-9zM12 3.5c-2 2.8-2 5.6 0 8.5s2 5.7 0 8.5',
  grains: 'M3 11h18a9 9 0 0 1-18 0zM8 8.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5',
  produce: 'M12 7c-4 0-7 3-7 7s3 7 7 7 7-3 7-7-3-7-7-7zM12 7c0-2 1-4 3-4',
  household: 'M9 3h6v4H9zM7 7h10l1 14H6L7 7zM9 12h6',
  generic: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
};

export const UI_ICONS = {
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l4.5 4.5',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  close: 'M7 7l10 10M17 7L7 17',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 6v12M6 12h12',
  minus: 'M6 12h12',
  cart: 'M3 4h2l2.4 11h10.2L20 8H6.2M9 18.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM17 18.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
  inventory: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h3M8 16.5h3',
  addCircle: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8v8M8 12h8',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  swapStore: 'M4 8h13l-3-3M20 16H7l3 3',
  auto: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  // An open recipe book.
  recipes: 'M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2zM12 6.5v13',
  // drag handle is six dots: render as circles r=1.6 at (9|15, 6|12|18), fill currentColor
} as const;

const KEYWORDS: [CategoryKey, RegExp][] = [
  ['frozen', /\bfrozen\b|ice cream/i],
  ['coffee', /coffee|espresso|\btea\b/i], // before 'canned' so "coffee beans" isn't a can
  ['canned', /\bbeans?\b|\bcanned\b|\btomato(es)? (paste|sauce)\b|\bsoup\b|\btuna\b|chickpea/i],
  ['eggs', /\beggs?\b/i],
  ['butter', /\bbutter\b|margarine/i],
  ['dairy', /\bmilk\b|\bcream\b|yogurt|cheese|half.and.half/i],
  ['baking', /\bflour\b|\bsugar\b|baking|yeast|cornstarch/i],
  ['oil', /\boil\b|vinegar/i],
  ['meat', /chicken|beef|pork|turkey|sausage|bacon|thighs?|steak|fish|salmon/i],
  ['grains', /\brice\b|pasta|quinoa|oats?\b|cereal|bread|tortilla|noodle/i],
  ['produce', /lemon|lime|apple|banana|onion|garlic|potato|carrot|lettuce|berr(y|ies)|avocado/i],
  ['household', /soap|detergent|paper towel|toilet|sponge|trash bag|foil|wrap/i],
];

/**
 * Built-in guess of a category from a free-text item name. Falls back to 'generic'.
 * domain/categories guessCategory() layers the user's own words on top.
 */
export function builtInGuess(name: string): CategoryKey {
  for (const [key, re] of KEYWORDS) if (re.test(name)) return key;
  return 'generic';
}
