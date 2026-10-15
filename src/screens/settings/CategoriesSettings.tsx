import { useState } from 'react';
import { useCategories } from '../../app/categories';
import { useCategoryCounts } from '../../data/hooks';
import { repo } from '../../data/repo';
import { parseKeywords } from '../../domain/categories';
import { plural } from '../../domain/text';
import { FALLBACK_CATEGORY, type Category, type CategoryKey } from '../../domain/types';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Icon } from '../../ui/Icon';
import { CATEGORY_ICONS } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import styles from './Settings.module.css';

const ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryKey[];

type Editing = { kind: 'new' } | { kind: 'edit'; category: Category } | null;

/** Not in the mockups (owner request): categories only pick an icon, and suggest one from the name. */
export function CategoriesSettings() {
  const { list } = useCategories();
  const counts = useCategoryCounts();
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <>
      <div className={styles.list}>
        {list.map((c) => {
          const n = counts?.get(c.id) ?? 0;
          return (
            <button key={c.id} type="button" className={styles.categoryRow} onClick={() => setEditing({ kind: 'edit', category: c })}>
              <span className={styles.iconTile}>
                <Icon path={CATEGORY_ICONS[c.icon]} size={18} strokeWidth={1.6} />
              </span>
              <span className={styles.stack}>
                <span className={styles.categoryName}>{c.name}</span>
                <span className={styles.metaLine}>
                  {n ? plural(n, 'item') : 'No items'}
                  {c.keywords.length > 0 && ` · ${c.keywords.join(', ')}`}
                </span>
              </span>
              <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.chevron} />
            </button>
          );
        })}
      </div>
      <div className={styles.addOne}>
        <Button onClick={() => setEditing({ kind: 'new' })}>Add category</Button>
      </div>
      <p className={styles.footnote}>
        Categories pick an item's icon. New items get one from their name; add words to a category to steer that.
        Deleting a category moves its items to Other.
      </p>

      {editing && (
        <CategorySheet
          category={editing.kind === 'edit' ? editing.category : undefined}
          itemCount={editing.kind === 'edit' ? (counts?.get(editing.category.id) ?? 0) : 0}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CategorySheet({ category, itemCount, onClose }: { category?: Category; itemCount: number; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<CategoryKey>(category?.icon ?? 'generic');
  const [words, setWords] = useState(category?.keywords.join(', ') ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = category && category.id !== FALLBACK_CATEGORY;

  const save = async () => {
    const input = { name, icon, keywords: parseKeywords(words) };
    if (category) await repo.updateCategory(category.id, input);
    else await repo.addCategory(input);
    onClose();
  };

  if (confirmDelete && category) {
    return (
      <ConfirmSheet
        title={`Delete ${category.name}?`}
        consequence={itemCount ? `${plural(itemCount, 'item')} will move to Other.` : 'No items use it.'}
        onConfirm={async () => {
          await repo.deleteCategory(category.id);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <label className={sheetStyles.field}>
        <span className={sheetStyles.label}>Name</span>
        <input className={sheetStyles.textInput} value={name} onChange={(e) => setName(e.target.value)} data-autofocus={!category || undefined} />
      </label>
      <div className={sheetStyles.field}>
        <span id="cat-icon" className={sheetStyles.label}>
          Icon
        </span>
        <div role="radiogroup" aria-labelledby="cat-icon" className={styles.iconGrid}>
          {ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={icon === k}
              aria-label={`${k} icon`}
              className={styles.iconChoice}
              onClick={() => setIcon(k)}
            >
              <Icon path={CATEGORY_ICONS[k]} size={24} strokeWidth={1.6} />
            </button>
          ))}
        </div>
      </div>
      <div className={sheetStyles.field}>
        <label htmlFor="cat-words" className={sheetStyles.label}>
          Words that pick it
        </label>
        <input
          id="cat-words"
          className={sheetStyles.textInput}
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="chips, crackers, pretzels"
          autoCapitalize="none"
          aria-describedby="cat-words-hint"
        />
        <span id="cat-words-hint" className={styles.hintText}>
          Separate with commas. A new item with one of these words in its name gets this category.
        </span>
      </div>
      {canDelete && (
        <Button variant="text" size={44} className={styles.dangerText} onClick={() => setConfirmDelete(true)}>
          Delete category
        </Button>
      )}
    </Sheet>
  );
}
