// Recipes against the pantry (docs/RECIPES_PLAN.md, phase 1: "do I have it"). Pure.
import { getStatus, isSetUp } from './rules';
import { nameKey } from './text';
import type { ID, IngredientMatch, Item, ListEntry, Recipe, RecipeIngredient, Staple } from './types';

/** "Almost makeable" = up to this many missing (brief / SPEC §7). */
export const ALMOST_MAX_MISSING = 3;

// Words that describe an ingredient rather than name it.
const DESCRIPTORS = new Set([
  'large',
  'small',
  'medium',
  'fresh',
  'dried',
  'dry',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'melted',
  'softened',
  'cold',
  'warm',
  'hot',
  'room',
  'temperature',
  'whole',
  'all-purpose',
  'all',
  'purpose',
  'unsalted',
  'salted',
  'extra',
  'virgin',
  'boneless',
  'skinless',
  'canned',
  'frozen',
  'plain',
  'finely',
  'roughly',
  'packed',
  'cooked',
  'uncooked',
  'raw',
  'ripe',
  'organic',
  'opened',
  'of',
]);

function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:ch|sh|x|s|o)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** "2 Large Eggs" -> ["egg"]; "all-purpose flour" -> ["flour"]; "Black beans, opened" -> ["black", "bean"]. */
export function ingredientWords(name: string): string[] {
  return nameKey(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w))
    .map(singular);
}

const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);
const containsAll = (haystack: string[], needles: string[]) =>
  needles.length > 0 && needles.every((w) => haystack.includes(w));

export type MatchConfidence = 'exact' | 'unsure';

/**
 * The pantry item an ingredient name most likely means.
 * exact: the same words once descriptions are dropped ("2 large eggs" / "Eggs",
 * "all-purpose flour" / "Flour", "shredded mozzarella" / "Mozzarella").
 * unsure: one name's words are all in the other ("beans" / "Black beans",
 * "coconut milk" / "Milk"), or two items fit equally well. Those are asked, never assumed.
 * Leftovers and archived items aren't candidates (a recipe links the parent).
 */
export function suggestItem(name: string, items: Item[]): { itemId: ID; confidence: MatchConfidence } | null {
  const ing = ingredientWords(name);
  if (!ing.length) return null;
  const scored = items
    .filter((i) => !i.isLeftover && i.archivedAt == null)
    .map((i) => {
      const words = ingredientWords(i.name);
      const score = sameWords(words, ing) ? 2 : containsAll(ing, words) || containsAll(words, ing) ? 1 : 0;
      return { item: i, score, size: words.length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.size - a.size);
  if (!scored.length) return null;
  const [best, second] = scored;
  const tie = second && second.score === best.score && second.size === best.size;
  return { itemId: best.item.id, confidence: best.score === 2 && !tie ? 'exact' : 'unsure' };
}

/** "salt", "kosher salt", "black pepper", "salt and pepper", "warm water" are staples. */
export function isStapleName(name: string, staples: Staple[]): boolean {
  const stapleWords = staples.map((s) => ingredientWords(s.name)).filter((w) => w.length);
  const parts = nameKey(name).split(/\s+(?:and|&|or)\s+|\s*,\s*/);
  return parts.every((part) => {
    const words = ingredientWords(part);
    // The staple ends the name: "kosher salt", "black pepper", "brown sugar".
    return words.length > 0 && stapleWords.some((s) => sameWords(words.slice(-s.length), s));
  });
}

export interface AutoMatch {
  match: IngredientMatch;
  itemId?: ID;
  /** Unmatched or uncertain: the editor asks (link, substitute, staple, or leave it). */
  needsReview: boolean;
}

/** First guess for a typed ingredient: a pantry item if it's clear, else a staple, else ask. */
export function autoMatch(name: string, items: Item[], staples: Staple[]): AutoMatch {
  const s = suggestItem(name, items);
  if (s && s.confidence === 'exact') return { match: 'item', itemId: s.itemId, needsReview: false };
  if (isStapleName(name, staples)) return { match: 'staple', needsReview: false };
  if (s) return { match: 'item', itemId: s.itemId, needsReview: true };
  return { match: 'none', needsReview: true };
}

// ---------- Do I have it? ----------

export type IngredientStatus = 'have' | 'low' | 'missing' | 'staple';

export interface PantryContext {
  itemsById: Map<ID, Item>;
  /** Leftovers by parent id: an opened can counts toward its item. */
  leftoversByParent: Map<ID, Item[]>;
  staples: Staple[];
}

export function pantryContext(items: Item[], staples: Staple[]): PantryContext {
  const live = items.filter((i) => i.archivedAt == null);
  const leftoversByParent = new Map<ID, Item[]>();
  for (const i of live) {
    if (i.isLeftover && i.parentId)
      leftoversByParent.set(i.parentId, [...(leftoversByParent.get(i.parentId) ?? []), i]);
  }
  return { itemsById: new Map(live.map((i) => [i.id, i])), leftoversByParent, staples };
}

function itemStatus(item: Item, ctx: PantryContext): 'have' | 'low' | 'missing' {
  if (!isSetUp(item)) return 'have'; // no amount tracked: assume it's there
  const leftovers = (ctx.leftoversByParent.get(item.id) ?? []).some((l) => l.amount > 0);
  const status = getStatus(item);
  if (status === 'out') return leftovers ? 'low' : 'missing';
  return status === 'low' ? 'low' : 'have';
}

const RANK = { have: 2, low: 1, missing: 0 } as const;

export function ingredientStatus(ing: RecipeIngredient, ctx: PantryContext): IngredientStatus {
  if (ing.match === 'staple') return 'staple';
  if (ing.match === 'item') {
    const items = [ing.itemId, ...(ing.substituteIds ?? [])]
      .map((id) => (id ? ctx.itemsById.get(id) : undefined))
      .filter((i): i is Item => !!i);
    if (items.length) {
      // The best of the item and its substitutes.
      return items.map((i) => itemStatus(i, ctx)).sort((a, b) => RANK[b] - RANK[a])[0];
    }
    // The linked item was deleted: fall back to the name.
  }
  return isStapleName(ing.name, ctx.staples) ? 'staple' : 'missing';
}

export type Readiness = 'ready' | 'almost' | 'more';

export interface RecipeCheck {
  readiness: Readiness;
  /** Missing, not counting optional ingredients. */
  missing: RecipeIngredient[];
  low: RecipeIngredient[];
  optionalMissing: RecipeIngredient[];
  status: Map<ID, IngredientStatus>;
}

export function checkRecipe(recipe: Recipe, ctx: PantryContext): RecipeCheck {
  const status = new Map(recipe.ingredients.map((i) => [i.id, ingredientStatus(i, ctx)]));
  const missing = recipe.ingredients.filter((i) => status.get(i.id) === 'missing' && !i.optional);
  const optionalMissing = recipe.ingredients.filter((i) => status.get(i.id) === 'missing' && i.optional);
  const low = recipe.ingredients.filter((i) => status.get(i.id) === 'low');
  const readiness: Readiness =
    missing.length === 0 ? 'ready' : missing.length <= ALMOST_MAX_MISSING ? 'almost' : 'more';
  return { readiness, missing, low, optionalMissing, status };
}

/**
 * What "Add missing to list" adds: each missing ingredient once, skipping anything
 * already on the list (by item, or by name for unlinked ones). Linked ingredients
 * name their pantry item, so the list puts them under its store.
 */
export function missingForShopping(
  recipe: Recipe,
  ctx: PantryContext,
  entries: ListEntry[],
): Array<{ itemId?: ID; name: string }> {
  // Compared like ingredient matching: "Small tortillas" is already "Tortillas".
  const same = (a: string, b: string) => sameWords(ingredientWords(a), ingredientWords(b));
  const open = entries.filter((e) => !e.checked);
  const onList = (itemId: ID | undefined, name: string) =>
    open.some((e) => (itemId && e.itemId === itemId) || same(e.name, name));
  const out: Array<{ itemId?: ID; name: string }> = [];
  for (const ing of checkRecipe(recipe, ctx).missing) {
    const item = ing.match === 'item' && ing.itemId ? ctx.itemsById.get(ing.itemId) : undefined;
    const name = item?.name ?? ing.name.charAt(0).toLocaleUpperCase() + ing.name.slice(1);
    if (onList(item?.id, name) || out.some((o) => same(o.name, name))) continue;
    out.push(item ? { itemId: item.id, name } : { name });
  }
  return out;
}
