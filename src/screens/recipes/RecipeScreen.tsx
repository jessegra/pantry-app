import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lastListLocation } from '../../app/listMemory';
import { useRecipe } from '../../data/hooks';
import { repo } from '../../data/repo';
import type { IngredientStatus } from '../../domain/recipeMatch';
import { plural } from '../../domain/text';
import type { RecipeIngredient } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import { useWide } from '../../ui/useMediaQuery';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import styles from './Recipes.module.css';

const LABEL: Record<IngredientStatus | 'optional', string> = {
  have: 'Have',
  low: 'Low',
  missing: 'Missing',
  staple: 'Staple',
  optional: 'Optional',
};

/** A recipe against the pantry (docs/RECIPES_PLAN.md). */
export function RecipeScreen() {
  const { id } = useParams();
  const data = useRecipe(id);
  const [added, setAdded] = useState<string[] | null>(null);
  const [busy, submit] = useSubmitOnce();

  if (data === undefined) return <TopBar />;
  if (data === null) {
    return (
      <>
        <TopBar />
        <ScreenBody>
          <p className={styles.noResults}>This recipe no longer exists.</p>
        </ScreenBody>
      </>
    );
  }

  const { recipe, check, itemsById, toAdd } = data;
  const missing = check.missing.length;
  const meta = [recipe.tags.join(' · '), recipe.servings ? `Serves ${recipe.servings}` : '']
    .filter(Boolean)
    .join(' · ');

  const statusOf = (ing: RecipeIngredient): IngredientStatus | 'optional' => {
    const s = check.status.get(ing.id) ?? 'missing';
    return s === 'missing' && ing.optional ? 'optional' : s;
  };

  return (
    <>
      <TopBar />
      <ScreenBody>
        <div className={styles.head}>
          <h1 className={styles.title}>{recipe.name}</h1>
          {meta && <p className={styles.muted}>{meta}</p>}
        </div>

        <div className={styles.summary} data-readiness={check.readiness}>
          <p className={styles.summaryTitle}>
            {check.readiness === 'ready' ? 'Ready to make' : `Missing ${plural(missing, 'ingredient')}`}
          </p>
          {check.low.length > 0 && (
            <p className={styles.summaryText}>Running low: {check.low.map((i) => i.name).join(', ')}</p>
          )}
          {toAdd.length > 0 && (
            <Button
              className={styles.summaryAction}
              size={44}
              disabled={busy}
              onClick={() =>
                void submit(async () => {
                  setAdded((await repo.addRecipeMissingToList(recipe.id)).added);
                })
              }
            >
              Add missing to list
            </Button>
          )}
          {missing > 0 && toAdd.length === 0 && !added && (
            <p className={styles.summaryText}>Everything missing is already on the shopping list.</p>
          )}
          {added && (
            <p className={styles.summaryText} role="status">
              {added.length ? `Added ${added.join(', ')} to the list. ` : 'Nothing new to add. '}
              <Link to="/list">View list</Link>
            </p>
          )}
        </div>

        <section aria-labelledby="ri-h">
          <h2 id="ri-h" className={styles.sectionLabel}>
            Ingredients
          </h2>
          <ul className={styles.ingredients}>
            {recipe.ingredients.map((ing) => {
              const status = statusOf(ing);
              const item = ing.match === 'item' && ing.itemId ? itemsById.get(ing.itemId) : undefined;
              const subs = (ing.substituteIds ?? []).map((sid) => itemsById.get(sid)).filter((s) => !!s);
              return (
                <li key={ing.id} className={styles.ingredient}>
                  <span className={styles.mark} data-status={status}>
                    {LABEL[status]}
                  </span>
                  <span className={styles.ingText}>
                    <span>{ing.text}</span>
                    {(item || subs.length > 0) && (
                      <span className={styles.ingLink}>
                        {item && (
                          <Link to={`/item/${item.id}`} className={styles.inlineLink}>
                            {item.name}
                          </Link>
                        )}
                        {subs.map((s) => (
                          <span key={s.id}>
                            {' or '}
                            <Link to={`/item/${s.id}`} className={styles.inlineLink}>
                              {s.name}
                            </Link>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {recipe.steps && (
          <section aria-labelledby="rs-steps">
            <h2 id="rs-steps" className={styles.sectionLabel}>
              Steps
            </h2>
            <p className={styles.prose}>{recipe.steps}</p>
          </section>
        )}
        {recipe.notes && (
          <section aria-labelledby="rs-notes">
            <h2 id="rs-notes" className={styles.sectionLabel}>
              Notes
            </h2>
            <p className={styles.prose}>{recipe.notes}</p>
          </section>
        )}
      </ScreenBody>
    </>
  );
}

function TopBar() {
  const wide = useWide();
  const list = lastListLocation();
  return (
    <header className={styles.topBar}>
      {wide ? (
        <Link to={`${list.pathname}${list.search}`} className={styles.back}>
          Close
        </Link>
      ) : (
        <Link to="/recipes" className={styles.back}>
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
          Recipes
        </Link>
      )}
    </header>
  );
}
