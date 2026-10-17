import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecipes, type RecipeView } from '../../data/hooks';
import { repo } from '../../data/repo';
import { ingredientWords, type Readiness } from '../../domain/recipeMatch';
import { nameKey } from '../../domain/text';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { ScreenBody, ScreenHeader, ScreenTitle } from '../../ui/Screen';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import styles from './Recipes.module.css';

const SECTIONS: Array<{ key: Readiness; title: string }> = [
  { key: 'ready', title: 'Ready to make' },
  { key: 'almost', title: 'Almost: 1–3 missing' },
  { key: 'more', title: 'Need more' },
];

/** "Missing: eggs, milk" / "Everything's here · low: chicken thighs" */
function recipeSummary({ check }: RecipeView): string {
  const low = check.low.length ? ` · low: ${check.low.map((i) => i.name).join(', ')}` : '';
  if (check.readiness === 'ready') return `Everything’s here${low}`;
  return `Missing: ${check.missing.map((i) => i.name).join(', ')}`;
}

function matches(v: RecipeView, query: string, tag: string | null): boolean {
  if (tag && !v.recipe.tags.includes(tag)) return false;
  const q = nameKey(query);
  if (!q) return true;
  if (nameKey(v.recipe.name).includes(q)) return true;
  // Also by ingredient: "eggs" finds Waffles.
  const words = ingredientWords(q);
  return v.recipe.ingredients.some((i) => {
    const iw = ingredientWords(i.name);
    return nameKey(i.name).includes(q) || (words.length > 0 && words.every((w) => iw.includes(w)));
  });
}

/** Recipes tab (docs/RECIPES_PLAN.md): what can we make, what are we close to. */
export function RecipesScreen() {
  const data = useRecipes();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [busy, submit] = useSubmitOnce();

  const all = data?.recipes ?? [];
  const shown = all.filter((v) => matches(v, query, tag));

  return (
    <>
      <ScreenHeader>
        <ScreenTitle>Recipes</ScreenTitle>
        {all.length > 0 && (
          <>
            <label className={styles.search}>
              <Icon name="search" size={18} />
              <span className="visually-hidden">Search recipes</span>
              <input
                type="search"
                placeholder="Search recipes or ingredients"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                enterKeyHint="search"
                autoComplete="off"
              />
            </label>
            {data!.tags.length > 0 && (
              <div className={styles.chips} role="group" aria-label="Tags">
                <Chip selected={tag === null} onClick={() => setTag(null)}>
                  All
                </Chip>
                {data!.tags.map((t) => (
                  <Chip key={t} selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
      </ScreenHeader>
      <ScreenBody>
        {data && all.length === 0 && (
          <div className={styles.blank}>
            <p className={styles.blankTitle}>No recipes yet</p>
            <p className={styles.muted}>
              Recipes show what you can make from what's on hand, and put what's missing on the list.
            </p>
            <Button onClick={() => void submit(() => repo.addSampleRecipes())} disabled={busy}>
              Add sample recipes
            </Button>
          </div>
        )}
        {all.length > 0 && shown.length === 0 && <p className={styles.noResults}>No recipes match.</p>}
        {SECTIONS.map(({ key, title }) => {
          const rows = shown.filter((v) => v.check.readiness === key);
          if (!rows.length) return null;
          return (
            <section key={key} aria-labelledby={`rs-${key}`}>
              <h2 id={`rs-${key}`} className={styles.sectionHeader}>
                <span>{title}</span>
                <span className={styles.count}>{rows.length}</span>
              </h2>
              {rows.map((v) => (
                <Link key={v.recipe.id} to={`/recipe/${v.recipe.id}`} className={styles.row} data-readiness={key}>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{v.recipe.name}</span>
                    <span className={styles.rowMeta}>{recipeSummary(v)}</span>
                    {v.recipe.tags.length > 0 && <span className={styles.rowTags}>{v.recipe.tags.join(' · ')}</span>}
                  </span>
                  <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.chevron} />
                </Link>
              ))}
            </section>
          );
        })}
      </ScreenBody>
    </>
  );
}
