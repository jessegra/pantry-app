import { useState } from 'react';
import { useStoreSettings, type StoreSettingsRow } from '../../data/hooks';
import { repo } from '../../data/repo';
import { moveItem } from '../../domain/layout';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { useDragReorder } from '../../ui/useDragReorder';
import { useOptimisticOrder } from '../../ui/useOptimisticOrder';
import { DeleteButton, DragHandle, InlineName, NameSheet, ReorderHint } from './parts';
import { plural } from '../../domain/text';
import styles from './Settings.module.css';

/** SettingsStores.dc.html */
export function StoresSettings() {
  const [rows, showOrder] = useOptimisticOrder(useStoreSettings() ?? [], (r) => r.store.id);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<StoreSettingsRow | null>(null);
  const [announce, setAnnounce] = useState('');

  const ids = rows.map((r) => r.store.id);
  const save = async (next: string[], movedIndex: number) => {
    const byId = new Map(rows.map((r) => [r.store.id, r]));
    showOrder(next.map((id) => byId.get(id)!));
    await repo.reorderStores(next);
    const id = ids[movedIndex];
    setAnnounce(`Moved ${rows[movedIndex].store.name} to position ${next.indexOf(id) + 1} of ${next.length}`);
  };
  const { listRef, drag, handleProps } = useDragReorder({
    onDrop: (from, before) => void save(moveItem(ids, from, before), from),
    onStep: (i, dir) => void save(moveItem(ids, i, dir === -1 ? i - 1 : i + 2), i),
  });

  return (
    <>
      <ReorderHint />
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      <div ref={listRef} className={styles.list}>
        {rows.map((r, i) => {
          const lifted = drag?.from === i;
          return (
            <div key={r.store.id} className={styles.rowWrap}>
              {drag && drag.before === i && drag.before !== drag.from && drag.before !== drag.from + 1 && (
                <span className={styles.dropLine} aria-hidden="true" />
              )}
              <div
                data-reorder-row
                className={styles.row}
                data-tall="true"
                data-lifted={lifted}
                style={lifted ? { transform: `translateY(${drag.dy}px)` } : undefined}
              >
                <DragHandle label={r.store.name} props={handleProps(i)} />
                <InlineName
                  value={r.store.name}
                  meta={storeMeta(r)}
                  onSave={(name) => void repo.renameStore(r.store.id, name)}
                />
                <DeleteButton label={r.store.name} onClick={() => setDeleting(r)} />
              </div>
            </div>
          );
        })}
        {drag && drag.before >= rows.length && drag.from !== rows.length - 1 && (
          <span className={styles.dropLine} aria-hidden="true" />
        )}
        {rows.length === 0 && <p className={styles.empty}>No stores yet.</p>}
      </div>

      <div className={styles.addOne}>
        <Button onClick={() => setAdding(true)}>Add store</Button>
      </div>
      <p className={styles.footnote}>
        The order here is the order of store groups on your shopping list. Deleting a store sends its items to
        Unassigned.
      </p>

      {adding && (
        <NameSheet
          title="Add store"
          placeholder="Safeway"
          onSave={(n) => repo.addStore(n)}
          onClose={() => setAdding(false)}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title={`Delete ${deleting.store.name}?`}
          consequence={deleteConsequence(deleting)}
          onConfirm={async () => {
            await repo.deleteStore(deleting.store.id);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function storeMeta(r: StoreSettingsRow): string {
  if (!r.preferredFor && !r.backupFor) return 'Not used by any item yet';
  const parts = [`Preferred for ${plural(r.preferredFor, 'item')}`];
  if (r.backupFor) parts.push(`backup for ${r.backupFor}`);
  return parts.join(' · ');
}

function deleteConsequence(r: StoreSettingsRow): string {
  const out: string[] = [];
  const items = r.preferredFor + r.backupFor;
  if (items) out.push(`${plural(items, 'item')} will forget this store.`);
  if (r.entries) out.push(`${plural(r.entries, 'list entry', 'list entries')} will move to Unassigned.`);
  return out.length ? out.join(' ') : 'Nothing uses this store.';
}
