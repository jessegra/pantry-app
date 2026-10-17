import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lastListLocation } from '../../app/listMemory';
import { useRecipeEdit, type RecipeEditData } from '../../data/hooks';
import { repo } from '../../data/repo';
import {
  addSubstitute,
  draftIngredients,
  ingredientsText,
  parseServings,
  removeSubstitute,
  setMatch,
  type DraftIngredient,
} from '../../domain/recipeEdit';
import { plural } from '../../domain/text';
import type { Item, RecipeIngredient } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import sheetStyles from '../../ui/Sheet.module.css';
import { useWide } from '../../ui/useMediaQuery';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import styles from './Recipes.module.css';

const newId = () => crypto.randomUUID();

/** Add or edit a recipe, then check how each ingredient matched (docs/RECIPES_PLAN.md). */
export function RecipeEditScreen() {
  const { id } = useParams();
  const data = useRecipeEdit(id);
  if (data === undefined) return <TopBar title={id ? 'Edit recipe' : 'New recipe'} />;
  if (data === null) {
    return (
      <>
        <TopBar title="Edit recipe" />
        <ScreenBody>
          <p className={styles.noResults}>This recipe no longer exists.</p>
        </ScreenBody>
      </>
    );
  }
  // Keyed so switching recipes (tablet) starts a fresh form.
  return <Editor key={id ?? 'new'} data={data} />;
}

function Editor({ data }: { data: RecipeEditData }) {
  const { recipe, items, staples } = data;
  const navigate = useNavigate();
  const [name, setName] = useState(recipe?.name ?? '');
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : '');
  const [lines, setLines] = useState(ingredientsText(recipe?.ingredients ?? []));
  const [steps, setSteps] = useState(recipe?.steps ?? '');
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  // The answers so far: a line typed as before keeps its match.
  const [known, setKnown] = useState<RecipeIngredient[]>(recipe?.ingredients ?? []);
  const [review, setReview] = useState<DraftIngredient[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, submit] = useSubmitOnce();
  const title = recipe ? 'Edit recipe' : 'New recipe';

  const allTags = [...new Set([...data.tags, ...tags])].sort((a, b) => a.localeCompare(b));
  const addTag = () => {
    const t = newTag.trim().toLocaleLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag('');
  };

  const save = (ingredients: RecipeIngredient[]) =>
    submit(async () => {
      const serves = parseServings(servings);
      const result = await repo.saveRecipe(
        { name, tags, ...(typeof serves === 'number' && { servings: serves }), ingredients, steps, notes },
        recipe?.id,
      );
      if ('problem' in result) {
        setReview(null);
        setProblem(result.problem);
        return;
      }
      navigate(`/recipe/${result.id}`, { replace: true });
    });

  /** Save, unless something needs a look first (or the owner asked to check). */
  const next = (alwaysReview: boolean) => {
    setProblem(null);
    if (!name.trim()) return setProblem('Give the recipe a name.');
    if (parseServings(servings) === 'invalid') return setProblem('Serves should be a whole number, like 4.');
    const drafts = draftIngredients(lines, known, items, staples, newId);
    if (alwaysReview || drafts.some((d) => d.needsReview)) {
      setReview(drafts);
      window.scrollTo?.(0, 0);
    } else void save(drafts.map((d) => d.ingredient));
  };

  if (review) {
    const backToForm = () => {
      setKnown(review.map((d) => d.ingredient));
      setReview(null);
    };
    return (
      <>
        <TopBar title="Check ingredients" onBack={backToForm} />
        <ReviewStep
          drafts={review}
          items={items}
          onChange={(i, ing) => setReview(review.map((d, k) => (k === i ? { ...d, ingredient: ing } : d)))}
        />
        <div className={styles.formActions}>
          <Button variant="neutral" onClick={backToForm}>
            Back
          </Button>
          <Button onClick={() => void save(review.map((d) => d.ingredient))} disabled={busy}>
            Save recipe
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={title} />
      <ScreenBody>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            next(false);
          }}
          noValidate
        >
          <h1 className={styles.title}>{title}</h1>
          <label className={sheetStyles.field}>
            <span className={sheetStyles.label}>Name</span>
            <input
              className={sheetStyles.textInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pancakes"
              autoComplete="off"
              enterKeyHint="next"
            />
          </label>

          <fieldset className={styles.fieldset}>
            <legend className={sheetStyles.label}>Tags</legend>
            {allTags.length > 0 && (
              <div className={sheetStyles.chips}>
                {allTags.map((t) => (
                  <Chip
                    key={t}
                    selected={tags.includes(t)}
                    onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
                  >
                    {t}
                  </Chip>
                ))}
              </div>
            )}
            <div className={styles.inlineAdd}>
              <label className={styles.grow}>
                <span className="visually-hidden">New tag</span>
                <input
                  className={sheetStyles.textInput}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="New tag"
                  autoComplete="off"
                />
              </label>
              <Button variant="secondary" onClick={addTag} disabled={!newTag.trim()}>
                Add tag
              </Button>
            </div>
          </fieldset>

          <label className={sheetStyles.field}>
            <span className={sheetStyles.label}>Serves (optional)</span>
            <input
              className={`${sheetStyles.textInput} ${styles.short}`}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          <div className={sheetStyles.field}>
            <label htmlFor="recipe-lines" className={sheetStyles.label}>
              Ingredients, one per line
            </label>
            <textarea
              id="recipe-lines"
              aria-describedby="recipe-lines-hint"
              className={styles.textarea}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              rows={8}
              placeholder={'2 cups flour\n1 tsp salt\n2 eggs'}
              autoComplete="off"
              spellCheck
            />
            <span id="recipe-lines-hint" className={styles.hint}>
              Add “optional” to a line that isn’t needed.
            </span>
          </div>

          <label className={sheetStyles.field}>
            <span className={sheetStyles.label}>Steps (optional)</span>
            <textarea className={styles.textarea} value={steps} onChange={(e) => setSteps(e.target.value)} rows={6} />
          </label>

          <label className={sheetStyles.field}>
            <span className={sheetStyles.label}>Notes (optional)</span>
            <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>

          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}

          <div className={styles.formButtons}>
            <Button type="submit" disabled={busy}>
              Save recipe
            </Button>
            {lines.trim() && (
              <Button variant="secondary" onClick={() => next(true)}>
                Check ingredient matches
              </Button>
            )}
            {recipe && (
              <Button variant="text" className={styles.danger} onClick={() => setDeleting(true)}>
                Delete recipe
              </Button>
            )}
          </div>
        </form>
      </ScreenBody>

      {deleting && recipe && (
        <ConfirmSheet
          title={`Delete ${recipe.name}?`}
          consequence="The recipe goes from this phone and any synced one. Your pantry isn’t touched."
          onConfirm={async () => {
            await repo.deleteRecipe(recipe.id);
            navigate('/recipes', { replace: true });
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}

// ---------- The review ----------

const valueOf = (ing: RecipeIngredient) => (ing.match === 'item' && ing.itemId ? `item:${ing.itemId}` : ing.match);

function ReviewStep({
  drafts,
  items,
  onChange,
}: {
  drafts: DraftIngredient[];
  items: Item[];
  onChange: (index: number, ing: RecipeIngredient) => void;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const asked = drafts.filter((d) => d.needsReview).length;
  return (
    <ScreenBody>
      <div className={styles.head}>
        <h1 className={styles.title}>Check ingredients</h1>
        <p className={styles.muted}>
          {asked
            ? `${plural(asked, 'ingredient')} ${asked === 1 ? 'needs' : 'need'} a look. Link each to a pantry item, call it a staple, or leave it: it then counts as missing.`
            : 'Here’s how each ingredient matched your pantry.'}
        </p>
      </div>
      {drafts.length === 0 && <p className={styles.noResults}>No ingredients yet.</p>}
      <ul className={styles.reviewList}>
        {drafts.map((d, i) => {
          const ing = d.ingredient;
          const suggested = d.suggestedId ? byId.get(d.suggestedId) : undefined;
          const subs = (ing.substituteIds ?? []).map((s) => byId.get(s)).filter((s): s is Item => !!s);
          const subChoices = items.filter((it) => it.id !== ing.itemId && !ing.substituteIds?.includes(it.id));
          const selectId = `match-${ing.id}`;
          if (!d.needsReview && !open.has(ing.id)) {
            const summary =
              ing.match === 'staple'
                ? 'Staple'
                : ing.match === 'item' && ing.itemId
                  ? [byId.get(ing.itemId)?.name, ...subs.map((s) => s.name)].join(' or ')
                  : 'Not stocked';
            return (
              <li key={ing.id} className={styles.reviewCompact}>
                <span className={styles.reviewText}>
                  <span className={styles.reviewLine}>{ing.text}</span>
                  <span className={styles.reviewSummary}>{summary}</span>
                </span>
                <button
                  type="button"
                  className={styles.edit}
                  aria-label={`Change match for ${ing.text}`}
                  onClick={() => setOpen(new Set(open).add(ing.id))}
                >
                  Change
                </button>
              </li>
            );
          }
          return (
            <li key={ing.id} className={styles.reviewRow} data-asked={d.needsReview}>
              <p className={styles.reviewLine} id={`${selectId}-line`}>
                {ing.text}
              </p>
              {d.needsReview && (
                <p className={styles.reviewAsk}>
                  {suggested ? `Not sure. Is this your ${suggested.name}?` : 'Not found in the pantry.'}
                </p>
              )}
              {suggested && ing.match !== 'item' && (
                <Button
                  variant="secondary"
                  size={44}
                  className={styles.reviewQuick}
                  onClick={() => onChange(i, setMatch(ing, 'item', suggested.id))}
                >
                  Link to {suggested.name}
                </Button>
              )}
              <label className={styles.reviewField}>
                <span className={sheetStyles.label}>Matches</span>
                <select
                  className={styles.select}
                  value={valueOf(ing)}
                  aria-describedby={`${selectId}-line`}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange(i, v.startsWith('item:') ? setMatch(ing, 'item', v.slice(5)) : setMatch(ing, v as 'none'));
                  }}
                >
                  <option value="none">Not stocked: counts as missing</option>
                  <option value="staple">Staple: always on hand</option>
                  <optgroup label="Pantry items">
                    {items.map((it) => (
                      <option key={it.id} value={`item:${it.id}`}>
                        {it.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              {ing.match === 'item' && (
                <div className={styles.subs}>
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={styles.subChip}
                      aria-label={`Remove substitute ${s.name}`}
                      onClick={() => onChange(i, removeSubstitute(ing, s.id))}
                    >
                      or {s.name}
                      <Icon name="close" size={14} strokeWidth={2} />
                    </button>
                  ))}
                  {subChoices.length > 0 && (
                    <label className={styles.reviewField}>
                      <span className={sheetStyles.label}>Also does</span>
                      <select
                        className={styles.select}
                        value=""
                        aria-describedby={`${selectId}-line`}
                        onChange={(e) => e.target.value && onChange(i, addSubstitute(ing, e.target.value))}
                      >
                        <option value="">Add a substitute…</option>
                        {subChoices.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </ScreenBody>
  );
}

function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const wide = useWide();
  const { id } = useParams();
  const list = lastListLocation();
  const cancelTo = id ? `/recipe/${id}` : wide ? `${list.pathname}${list.search}` : '/recipes';
  return (
    <header className={styles.topBar}>
      {onBack ? (
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
          Back
        </button>
      ) : (
        <Link to={cancelTo} className={styles.back} replace>
          Cancel
        </Link>
      )}
      <span className="visually-hidden" aria-live="polite">
        {title}
      </span>
    </header>
  );
}
