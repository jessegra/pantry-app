// Adding and editing a recipe (docs/RECIPES_PLAN.md, step 3). Pure.
import { parseIngredientLine } from './recipeParse';
import { autoMatch, suggestItem } from './recipeMatch';
import { nameKey } from './text';
import type { ID, IngredientMatch, Item, Recipe, RecipeIngredient, Staple } from './types';

/** An ingredient being edited: what it matched, and whether the review should ask about it. */
export interface DraftIngredient {
  ingredient: RecipeIngredient;
  /** Unmatched or uncertain: the review asks (link, substitute, staple, or leave it). */
  needsReview: boolean;
  /** A pantry item that might be meant ("Milk" for "coconut milk"): offered, never assumed. */
  suggestedId?: ID;
}

/** The ingredient lines as they'd be typed back: one per line. */
export const ingredientsText = (ingredients: RecipeIngredient[]) => ingredients.map((i) => i.text).join('\n');

/** "Breakfast, quick ,breakfast" -> ["breakfast", "quick"]. Tags are lower case, no repeats. */
export function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags.flatMap((s) => s.split(','))) {
    const k = nameKey(t);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Typed lines to ingredients. A line typed exactly as before keeps how it was matched
 * (the owner's earlier choice); a new or changed line is matched afresh: a clear
 * pantry item or a staple is taken, anything else is left unlinked for the review.
 */
export function draftIngredients(
  text: string,
  previous: RecipeIngredient[],
  items: Item[],
  staples: Staple[],
  newId: () => ID,
): DraftIngredient[] {
  const unused = [...previous];
  const live = new Set(items.filter((i) => i.archivedAt == null).map((i) => i.id));
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const k = unused.findIndex((p) => p.text.trim() === line);
      if (k >= 0) {
        const [kept] = unused.splice(k, 1);
        // A linked item that's since been deleted needs a new answer.
        const lost = kept.match === 'item' && !(kept.itemId && live.has(kept.itemId));
        if (!lost) return { ingredient: kept, needsReview: false };
        const rest = setMatch(kept, 'none');
        return { ...reviewOf(rest, items), ingredient: rest };
      }
      const p = parseIngredientLine(line);
      const m = autoMatch(p.name, items, staples);
      const base: RecipeIngredient = {
        id: newId(),
        text: line,
        ...(p.quantity !== undefined && { quantity: p.quantity }),
        ...(p.unit && { unit: p.unit }),
        name: p.name,
        ...(p.prep && { prep: p.prep }),
        match: 'none',
        ...(p.optional && { optional: true }),
      };
      if (!m.needsReview) {
        return { ingredient: { ...base, match: m.match, ...(m.itemId && { itemId: m.itemId }) }, needsReview: false };
      }
      return { ingredient: base, needsReview: true, ...(m.itemId && { suggestedId: m.itemId }) };
    });
}

function reviewOf(ing: RecipeIngredient, items: Item[]): Omit<DraftIngredient, 'ingredient'> {
  const s = suggestItem(ing.name, items);
  return { needsReview: true, ...(s && { suggestedId: s.itemId }) };
}

/** The review's answer for one ingredient: link to an item, call it a staple, or leave it. */
export function setMatch(ing: RecipeIngredient, match: IngredientMatch, itemId?: ID): RecipeIngredient {
  const rest: RecipeIngredient = { ...ing };
  delete rest.itemId;
  delete rest.substituteIds;
  const { substituteIds } = ing;
  if (match === 'item' && itemId) {
    const subs = (substituteIds ?? []).filter((s) => s !== itemId);
    return { ...rest, match, itemId, ...(subs.length && { substituteIds: subs }) };
  }
  return { ...rest, match: match === 'item' ? 'none' : match };
}

/** Another item that also does (butter or oil). Only for a linked ingredient. */
export function addSubstitute(ing: RecipeIngredient, itemId: ID): RecipeIngredient {
  if (ing.match !== 'item' || ing.itemId === itemId || ing.substituteIds?.includes(itemId)) return ing;
  return { ...ing, substituteIds: [...(ing.substituteIds ?? []), itemId] };
}

export function removeSubstitute(ing: RecipeIngredient, itemId: ID): RecipeIngredient {
  const { substituteIds, ...rest } = ing;
  const left = (substituteIds ?? []).filter((s) => s !== itemId);
  return left.length ? { ...rest, substituteIds: left } : rest;
}

export interface RecipeInput {
  name: string;
  tags: string[];
  servings?: number;
  ingredients: RecipeIngredient[];
  steps?: string;
  notes?: string;
}

/** "Serves" as typed: a whole number from 1, or nothing. */
export function parseServings(s: string): number | undefined | 'invalid' {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 'invalid';
}

/** Why a recipe can't be saved yet, or null. Names are unique (sync merges by record, not name). */
export function recipeProblem(input: Pick<RecipeInput, 'name'>, others: Recipe[], selfId?: ID): string | null {
  const k = nameKey(input.name);
  if (!k) return 'Give the recipe a name.';
  if (others.some((r) => r.id !== selfId && nameKey(r.name) === k))
    return `There’s already a recipe called ${input.name.trim()}.`;
  return null;
}

/** Trimmed, with empty optional text left out. */
export function cleanRecipeInput(input: RecipeInput): RecipeInput {
  const steps = input.steps?.trim();
  const notes = input.notes?.trim();
  return {
    name: input.name.trim().replace(/\s+/g, ' '),
    tags: cleanTags(input.tags),
    ...(input.servings !== undefined && { servings: input.servings }),
    ingredients: input.ingredients,
    ...(steps && { steps }),
    ...(notes && { notes }),
  };
}
