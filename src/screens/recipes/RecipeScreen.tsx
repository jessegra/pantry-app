import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lastListLocation } from '../../app/listMemory';
import { useRecipe } from '../../data/hooks';
import { repo } from '../../data/repo';
import type { AmountCheck } from '../../domain/recipeAmount';
import type { IngredientStatus } from '../../domain/recipeMatch';
import { formatNumber, formatQuantity } from '../../domain/rules';
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
  short: 'Short',
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
  const short = check.missing.filter((i) => check.status.get(i.id) === 'short').length;
  const meta = [recipe.tags.join(' · '), recipe.servings ? `Serves ${recipe.servings}` : '']
    .filter(Boolean)
    .join(' · ');

  const statusOf = (ing: RecipeIngredient): IngredientStatus | 'optional' => {
    const s = check.status.get(ing.id) ?? 'missing';
    return s === 'missing' && ing.optional ? 'optional' : s;
  };

  return (
    <>
      <TopBar editId={recipe.id} />
      <ScreenBody>
        <div className={styles.head}>
          <h1 className={styles.title}>{recipe.name}</h1>
          {meta && <p className={styles.muted}>{meta}</p>}
        </div>

        <div className={styles.summary} data-readiness={check.readiness}>
          <p className={styles.summaryTitle}>
            {check.readiness === 'ready' ? 'Ready to make' : summaryTitle(missing - short, short)}
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
                    {amountNote(check.amounts.get(ing.id)) && (
                      <span className={styles.amountNote} data-kind={check.amounts.get(ing.id)!.kind}>
                        {amountNote(check.amounts.get(ing.id))}
                      </span>
                    )}
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

/** "Missing 2 ingredients", "Not enough of 1 ingredient", "Missing 1 ingredient, not enough of 1". */
function summaryTitle(missing: number, short: number): string {
  if (!short) return `Missing ${plural(missing, 'ingredient')}`;
  if (!missing) return `Not enough of ${plural(short, 'ingredient')}`;
  return `Missing ${plural(missing, 'ingredient')}, not enough of ${short}`;
}

/** "Have 1 cup of 2", or why the amount wasn't compared. Nothing when there's enough. */
function amountNote(a: AmountCheck | undefined): string | null {
  if (!a || a.kind === 'enough') return null;
  if (a.kind === 'unknown') return `Amount not compared (${a.recipeUnit} vs ${a.itemUnit})`;
  const unit = a.unit === 'each' ? undefined : a.unit;
  return `Have ${unit ? formatQuantity(a.have, unit) : formatNumber(a.have)} of ${formatNumber(a.need)}`;
}

function TopBar({ editId }: { editId?: string }) {
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
      {editId && (
        <Link to={`/recipe/${editId}/edit`} className={styles.edit}>
          Edit
        </Link>
      )}
    </header>
  );
}
