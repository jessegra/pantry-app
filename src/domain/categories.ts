// Categories (icon only). Pure.
import { builtInGuess, CATEGORY_ICONS } from '../ui/icons';
import { FALLBACK_CATEGORY, type Category, type CategoryKey, type ID } from './types';
import { CATEGORY_LABELS } from './units';

/** The starting set, seeded on first run, on reset, and into v2 databases by the v3 migration. */
export function defaultCategories(now = 0): Category[] {
  return (Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => ({
    id: key,
    name: CATEGORY_LABELS[key],
    icon: key,
    keywords: [],
    updatedAt: now,
  }));
}

/** "tortilla, Wrap ,, wraps" -> ['tortilla', 'wrap', 'wraps'] */
export function parseKeywords(text: string): string[] {
  return [...new Set(text.split(',').map((w) => w.trim().toLocaleLowerCase()).filter(Boolean))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Picks a category for a new or renamed item. Words people added in Settings win,
 * then the built-in guesses (only for built-ins that still exist), then Other.
 */
export function guessCategory(name: string, categories: Category[]): ID {
  for (const c of categories) {
    if (c.keywords.some((w) => new RegExp(`\\b${escape(w)}`, 'i').test(name))) return c.id;
  }
  const builtIn = builtInGuess(name);
  return categories.some((c) => c.id === builtIn) ? builtIn : FALLBACK_CATEGORY;
}

/** Icon path for a category id; anything unknown shows the generic box. */
export function categoryIcon(id: ID, byId: Map<ID, Category>): string {
  return CATEGORY_ICONS[byId.get(id)?.icon ?? 'generic'];
}

/** Settings and pickers: alphabetical, Other last. */
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort(
    (a, b) =>
      Number(a.id === FALLBACK_CATEGORY) - Number(b.id === FALLBACK_CATEGORY) || a.name.localeCompare(b.name),
  );
}
