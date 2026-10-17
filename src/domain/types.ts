// Pantry data model. See docs/SPEC.md §2.
// Every item is one name, one unit, one par, one location, one bar.
// A half-used package is a separate leftover item linked to its parent.

export type ID = string;

/** Epoch milliseconds. */
export type Timestamp = number;

/**
 * An icon from the built-in set. Also the id of each built-in category, so items
 * saved before categories became editable keep pointing at the right one.
 */
export type CategoryKey =
  | 'canned'
  | 'dairy'
  | 'eggs'
  | 'butter'
  | 'baking'
  | 'oil'
  | 'frozen'
  | 'meat'
  | 'coffee'
  | 'grains'
  | 'produce'
  | 'household'
  | 'generic';

export interface PackageSize {
  /** e.g. 15 for "1 can = 15 oz" */
  amount: number;
  /** e.g. "oz" */
  unit: string;
}

export interface Item {
  id: ID;
  /** Required at creation. Free text. */
  name: string;
  /** Required at creation. null = Unassigned (its location was deleted). */
  locationId: ID | null;

  /** Singular unit: "can", "oz", "lb", "bag", "each", "gal", "stick", "bottle"... */
  unit?: string;
  /** Needed later for recipe totals and for summing parent + leftover. */
  packageSize?: PackageSize;
  /** Full end of the bar, in `unit`s. Undefined = not set up (renders as "Set up" row). */
  par?: number;
  /** Absolute amount, in `unit`s. Undefined = default (25% of par). */
  lowThreshold?: number;
  /** Current amount on hand, in `unit`s. Always >= 0. */
  amount: number;

  preferredStoreId?: ID;
  secondaryStoreId?: ID;

  /** Category id. Guessed from the name, correctable. Drives the icon only. */
  category: ID;
  /** True once the user has picked a category, so re-guessing on rename stops. */
  categoryConfirmed?: boolean;

  /** Set by "Open one". Leftovers never auto-add to the list. */
  isLeftover: boolean;
  /** Ties a leftover to the item it came from. */
  parentId?: ID;

  /** Archived items are hidden from inventory and recoverable. Never hard-deleted. */
  archivedAt?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** User-maintained in Settings → Categories. Only picks an icon. */
export interface Category {
  /** Built-ins use their icon key as id ('canned'); new ones get a UUID. */
  id: ID;
  name: string;
  icon: CategoryKey;
  /** Extra words that pick this category when naming an item ("tortilla", "wrap"). */
  keywords: string[];
  updatedAt: Timestamp;
}

/** "Other": the fallback. Can be renamed, never deleted. */
export const FALLBACK_CATEGORY: ID = 'generic';

export interface LocationGroup {
  id: ID;
  /** Display header only, e.g. "Pantry". */
  name: string;
  sortOrder: number;
  updatedAt: Timestamp;
}

export interface Location {
  id: ID;
  name: string;
  /** Optional display group. */
  groupId: ID | null;
  /**
   * Order among top-level entries (ungrouped locations and groups share one ordering),
   * or within the group when groupId is set.
   */
  sortOrder: number;
  updatedAt: Timestamp;
}

export interface Store {
  id: ID;
  name: string;
  /** Order of store groups on the shopping list. */
  sortOrder: number;
  /** Reserved for a future Instacart hand-off. No UI yet. */
  onInstacart?: boolean;
  updatedAt: Timestamp;
}

export type ListEntrySource = 'auto' | 'manual';

export interface ListEntry {
  id: ID;
  /** Linked inventory item. Manual entries may have none ("Dish soap"). */
  itemId?: ID;
  /** Copied from the item for auto entries; typed by the user for manual ones. */
  name: string;
  /** How many to buy. For auto entries = restockQuantity(item). */
  quantity: number;
  unit?: string;
  /** null = Unassigned group. */
  storeId: ID | null;
  source: ListEntrySource;
  checked: boolean;
  checkedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Staple {
  id: ID;
  /** Assumed always on hand. Never counts against a recipe. */
  name: string;
  updatedAt: Timestamp;
}

export type ItemStatus = 'untracked' | 'ok' | 'low' | 'out';

/**
 * How a recipe ingredient relates to the pantry (docs/RECIPES_PLAN.md):
 * - item: linked to a pantry item (substitutes, if any, also do)
 * - staple: always assumed on hand
 * - none: not something we stock; counts as missing, goes on the list by name
 */
export type IngredientMatch = 'item' | 'staple' | 'none';

export interface RecipeIngredient {
  /** Stable within the recipe. */
  id: ID;
  /** The line as typed: "2 cups flour, sifted". */
  text: string;
  quantity?: number;
  /** Normalized: "cup", "tbsp", "tsp", "g", "oz", "can"… */
  unit?: string;
  /** "flour" */
  name: string;
  /** "sifted" */
  prep?: string;
  match: IngredientMatch;
  itemId?: ID;
  /** Other pantry items that also do (butter or oil). */
  substituteIds?: ID[];
  /** Never counts as missing. */
  optional?: boolean;
}

export interface Recipe {
  id: ID;
  name: string;
  tags: string[];
  servings?: number;
  ingredients: RecipeIngredient[];
  /** Free text. */
  steps?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
