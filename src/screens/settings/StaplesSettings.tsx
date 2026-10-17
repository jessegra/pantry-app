import { useState } from 'react';
import { useStaples } from '../../data/hooks';
import { repo } from '../../data/repo';
import type { Staple } from '../../domain/types';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { DeleteButton, InlineName, NameSheet } from './parts';
import styles from './Settings.module.css';

/** Always on hand: never missing from a recipe (docs/RECIPES_PLAN.md). No mockup. */
export function StaplesSettings() {
  const staples = useStaples() ?? [];
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Staple | null>(null);

  return (
    <>
      <p className={styles.intro}>Things that are always in the kitchen. A recipe never counts them as missing.</p>
      <div className={styles.list}>
        {staples.map((s) => (
          <div key={s.id} className={styles.row} data-plain="true">
            <InlineName value={s.name} onSave={(name) => void repo.renameStaple(s.id, name)} />
            <DeleteButton label={s.name} onClick={() => setDeleting(s)} />
          </div>
        ))}
        {staples.length === 0 && <p className={styles.empty}>No staples yet.</p>}
      </div>

      <div className={styles.addOne}>
        <Button onClick={() => setAdding(true)}>Add staple</Button>
      </div>
      <p className={styles.footnote}>
        “Salt” also covers “kosher salt” and “salt and pepper”. If a staple is also a pantry item (flour, butter), a
        recipe linked to that item follows how much you have.
      </p>

      {adding && (
        <NameSheet
          title="Add staple"
          placeholder="Baking soda"
          onSave={(n) => repo.addStaple(n)}
          onClose={() => setAdding(false)}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title={`Delete ${deleting.name}?`}
          consequence="Recipes that use it will count it as missing unless it’s linked to a pantry item."
          onConfirm={() => repo.deleteStaple(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
