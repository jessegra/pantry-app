// Sample data from the design brief, used on first run (behind a "Load sample data"
// option or in dev) and in tests. Real locations and stores are user-maintained.
import { autoMatch } from './recipeMatch';
import { parseIngredientLine } from './recipeParse';
import type { Item, ListEntry, Location, LocationGroup, Recipe, RecipeIngredient, Staple, Store } from './types';

const T0 = Date.UTC(2026, 9, 12, 17, 0, 0);
const stamp = { updatedAt: T0 } as const;

export const seedGroups: LocationGroup[] = [{ id: 'grp-pantry', name: 'Pantry', sortOrder: 3, ...stamp }];

// Top-level order: Refrigerator, Refrigerator Drawer, Deep Freeze, [Pantry group], Kitchen Cabinet Left.
export const seedLocations: Location[] = [
  { id: 'loc-fridge', name: 'Refrigerator', groupId: null, sortOrder: 0, ...stamp },
  { id: 'loc-drawer', name: 'Refrigerator Drawer', groupId: null, sortOrder: 1, ...stamp },
  { id: 'loc-freeze', name: 'Deep Freeze', groupId: null, sortOrder: 2, ...stamp },
  { id: 'loc-shelf1', name: 'Shelf 1', groupId: 'grp-pantry', sortOrder: 0, ...stamp },
  { id: 'loc-shelf2', name: 'Shelf 2', groupId: 'grp-pantry', sortOrder: 1, ...stamp },
  // Not in the brief's sample list; added to exercise the empty-location state.
  { id: 'loc-floor', name: 'Floor bin', groupId: 'grp-pantry', sortOrder: 2, ...stamp },
  { id: 'loc-cab', name: 'Kitchen Cabinet Left', groupId: null, sortOrder: 4, ...stamp },
];

export const seedStores: Store[] = [
  { id: 'st-costco', name: 'Costco', sortOrder: 0, ...stamp },
  { id: 'st-fredmeyer', name: 'Fred Meyer', sortOrder: 1, ...stamp },
  { id: 'st-tj', name: "Trader Joe's", sortOrder: 2, ...stamp },
];

const base = { isLeftover: false, createdAt: T0, updatedAt: T0 } as const;

// createdAt is staggered (below) so items list in the mockup's order within a location.
export const seedItems: Item[] = (
  [
    {
      ...base,
      id: 'it-milk',
      name: 'Milk',
      locationId: 'loc-fridge',
      unit: 'gal',
      par: 2,
      amount: 1,
      preferredStoreId: 'st-fredmeyer',
      category: 'dairy',
    },
    {
      ...base,
      id: 'it-eggs',
      name: 'Eggs',
      locationId: 'loc-fridge',
      unit: 'each',
      par: 12,
      amount: 9,
      preferredStoreId: 'st-costco',
      category: 'eggs',
    },
    {
      ...base,
      id: 'it-blackbeans',
      name: 'Black beans',
      locationId: 'loc-shelf1',
      unit: 'can',
      packageSize: { amount: 8, unit: 'oz' },
      par: 8,
      amount: 3,
      preferredStoreId: 'st-costco',
      secondaryStoreId: 'st-tj',
      category: 'canned',
    },
    {
      ...base,
      id: 'it-blackbeans-open',
      name: 'Black beans, opened',
      locationId: 'loc-fridge',
      unit: 'oz',
      par: 8,
      amount: 4,
      category: 'canned',
      isLeftover: true,
      parentId: 'it-blackbeans',
    },
    {
      ...base,
      id: 'it-butter',
      name: 'Butter',
      locationId: 'loc-drawer',
      unit: 'stick',
      par: 4,
      amount: 2,
      preferredStoreId: 'st-tj',
      category: 'butter',
    },
    {
      ...base,
      id: 'it-peas',
      name: 'Frozen peas',
      locationId: 'loc-freeze',
      unit: 'bag',
      par: 3,
      amount: 2,
      preferredStoreId: 'st-tj',
      category: 'frozen',
    },
    {
      ...base,
      id: 'it-chicken',
      name: 'Chicken thighs',
      locationId: 'loc-freeze',
      unit: 'lb',
      par: 4,
      amount: 1,
      preferredStoreId: 'st-costco',
      secondaryStoreId: 'st-fredmeyer',
      category: 'meat',
    },
    // Name and location only: renders as a "Set up" row.
    { ...base, id: 'it-rice', name: 'Rice', locationId: 'loc-shelf1', amount: 0, category: 'grains' },
    // Brief says "low"; ½ bag of 2 is at/below the 25% threshold.
    {
      ...base,
      id: 'it-coffee',
      name: 'Coffee beans',
      locationId: 'loc-shelf2',
      unit: 'bag',
      par: 2,
      amount: 0.5,
      preferredStoreId: 'st-tj',
      secondaryStoreId: 'st-fredmeyer',
      category: 'coffee',
    },
    {
      ...base,
      id: 'it-flour',
      name: 'Flour',
      locationId: 'loc-cab',
      unit: 'bag',
      par: 1,
      amount: 0.4,
      preferredStoreId: 'st-fredmeyer',
      category: 'baking',
    },
    {
      ...base,
      id: 'it-oil',
      name: 'Olive oil',
      locationId: 'loc-cab',
      unit: 'bottle',
      par: 1,
      amount: 0.7,
      preferredStoreId: 'st-tj',
      category: 'oil',
    },
  ] satisfies Item[]
).map((item, i) => ({ ...item, createdAt: T0 + i }));

// Chicken thighs and Coffee beans are auto entries (they're low). The three manual
// entries are invented to show manual vs auto, a checked row, and the Unassigned group.
export const seedListEntries: ListEntry[] = [
  {
    id: 'le-chicken',
    itemId: 'it-chicken',
    name: 'Chicken thighs',
    quantity: 3,
    unit: 'lb',
    storeId: 'st-costco',
    source: 'auto',
    checked: false,
    createdAt: T0,
    ...stamp,
  },
  {
    id: 'le-coffee',
    itemId: 'it-coffee',
    name: 'Coffee beans',
    quantity: 2,
    unit: 'bag',
    storeId: 'st-tj',
    source: 'auto',
    checked: false,
    createdAt: T0 + 1,
    ...stamp,
  },
  {
    id: 'le-lemons',
    name: 'Lemons',
    quantity: 4,
    storeId: 'st-fredmeyer',
    source: 'manual',
    checked: true,
    checkedAt: T0 + 10,
    createdAt: T0 + 2,
    ...stamp,
  },
  {
    id: 'le-tortillas',
    name: 'Tortillas',
    quantity: 1,
    unit: 'pack',
    storeId: 'st-tj',
    source: 'manual',
    checked: false,
    createdAt: T0 + 3,
    ...stamp,
  },
  {
    id: 'le-soap',
    name: 'Dish soap',
    quantity: 1,
    storeId: null,
    source: 'manual',
    checked: false,
    createdAt: T0 + 4,
    ...stamp,
  },
];

export const seedStaples: Staple[] = ['salt', 'pepper', 'oil', 'butter', 'water', 'sugar', 'flour'].map((name) => ({
  id: `sp-${name}`,
  name,
  ...stamp,
}));

/**
 * A sample recipe from typed lines, matched to the sample pantry the same way the
 * editor will. Only clear matches are linked here; anything the editor would ask
 * about stays unlinked (so "coconut milk" doesn't become the pantry's Milk).
 */
interface SampleRecipe {
  id: string;
  name: string;
  tags: string[];
  servings: number;
  lines: string[];
  steps: string;
}

function buildRecipe(r: SampleRecipe, items: Item[], staples: Staple[], now: number): Recipe {
  const { id, name, tags, servings, lines, steps } = r;
  const ingredients: RecipeIngredient[] = lines.map((text, i) => {
    const p = parseIngredientLine(text);
    const m = autoMatch(p.name, items, staples);
    const sure = !m.needsReview;
    return {
      id: `${id}-${i + 1}`,
      text,
      ...(p.quantity !== undefined && { quantity: p.quantity }),
      ...(p.unit && { unit: p.unit }),
      name: p.name,
      ...(p.prep && { prep: p.prep }),
      match: sure ? m.match : 'none',
      ...(sure && m.itemId && { itemId: m.itemId }),
      ...(p.optional && { optional: true }),
    };
  });
  return { id, name, tags, servings, ingredients, steps, createdAt: now, updatedAt: now };
}

const sampleRecipes: SampleRecipe[] = [
  {
    id: 'rc-waffles',
    name: 'Waffles',
    tags: ['breakfast', 'weekend'],
    servings: 4,
    lines: [
      '2 cups flour',
      '1 tbsp baking powder',
      '2 tbsp sugar',
      '½ tsp salt',
      '2 large eggs',
      '1¾ cups milk',
      '½ cup butter, melted',
    ],
    steps:
      'Heat the waffle iron. Whisk the dry ingredients. Beat the eggs with the milk and butter, stir into the dry until just combined. Cook until golden.',
  },
  {
    id: 'rc-tacos',
    name: 'Chicken tacos',
    tags: ['dinner', 'quick'],
    servings: 4,
    lines: [
      '1 lb chicken thighs',
      '8 small tortillas',
      '1 (15 oz) can black beans, drained',
      '1 cup shredded cheese',
      '1 onion, diced',
      'salsa (optional)',
      'lime wedges, optional',
    ],
    steps:
      'Season and sear the chicken, then slice. Warm the beans and tortillas. Fill with chicken, beans, cheese and onion.',
  },
  {
    id: 'rc-pizza',
    name: 'Pizza',
    tags: ['dinner', 'weekend'],
    servings: 2,
    lines: [
      '3 cups flour',
      '2¼ tsp yeast',
      '1 cup warm water',
      '2 tbsp olive oil',
      '1 tsp salt',
      '1 cup tomato sauce',
      '2 cups shredded mozzarella',
      'pepperoni (optional)',
    ],
    steps:
      'Mix the dough and let it rise an hour. Stretch into two rounds, top with sauce and cheese, bake at 475°F for 12 minutes.',
  },
  {
    id: 'rc-flatbread',
    name: 'Skillet flatbread',
    tags: ['bread', 'quick'],
    servings: 4,
    lines: ['2 cups flour', '1 tsp salt', '¾ cup water', '2 tbsp olive oil'],
    steps:
      'Mix to a soft dough and rest 10 minutes. Divide into four, roll thin, cook in a hot dry skillet about a minute a side.',
  },
  {
    id: 'rc-curry',
    name: 'Vegetable curry',
    tags: ['dinner', 'vegetarian'],
    servings: 4,
    lines: [
      '1 onion, diced',
      '2 cloves garlic, minced',
      '2 tbsp curry paste',
      '1 (13.5 oz) can coconut milk',
      '1 (15 oz) can chickpeas, drained',
      '2 cups frozen peas',
      '2 cups rice',
    ],
    steps:
      'Soften the onion and garlic, stir in the curry paste. Add coconut milk and chickpeas, simmer 10 minutes, add peas. Serve over rice.',
  },
];

/** The sample recipes, matched against a given pantry (the sample one, or a real one). */
export function sampleRecipesFor(items: Item[], staples: Staple[], now = T0): Recipe[] {
  return sampleRecipes.map((r) => buildRecipe(r, items, staples, now));
}

// Against the sample pantry: Flatbread is ready; Waffles, Tacos and Pizza are almost
// (1-3 missing); Vegetable curry needs more.
export const seedRecipes: Recipe[] = sampleRecipesFor(seedItems, seedStaples);
