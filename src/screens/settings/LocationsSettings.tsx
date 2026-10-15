import { useState } from 'react';
import { useLocationSettings, type LocationSettingsRow } from '../../data/hooks';
import { repo } from '../../data/repo';
import { moveRow, moveRowBy, toLayout, type Row } from '../../domain/layout';
import type { ID } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import sheetStyles from '../../ui/Sheet.module.css';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { useDragReorder } from '../../ui/useDragReorder';
import { useOptimisticOrder } from '../../ui/useOptimisticOrder';
import { DeleteButton, DragHandle, InlineName, NameSheet, ReorderHint } from './parts';
import { plural } from '../../domain/text';
import styles from './Settings.module.css';

type Sheet = { kind: 'addLocation' } | { kind: 'addGroup' } | { kind: 'delete'; target: LocationSettingsRow } | null;

/** SettingsLocations.dc.html */
export function LocationsSettings() {
  const data = useLocationSettings();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [announce, setAnnounce] = useState('');
  const [rows, showOrder] = useOptimisticOrder(data?.rows ?? [], (r) =>
    r.row.kind === 'location' ? `:` : r.row.id,
  );

  const save = async (next: Row[], movedId: ID) => {
    const byId = new Map(rows.map((r) => [r.row.id, r]));
    showOrder(next.map((row) => ({ ...byId.get(row.id)!, row })));
    await repo.reorderLocations(toLayout(next));
    const at = next.findIndex((r) => r.id === movedId);
    const name = rows.find((r) => r.row.id === movedId)?.name;
    setAnnounce(`Moved ${name} to position ${at + 1} of ${next.length}`);
  };
  const plain = rows.map((r) => r.row);
  const { listRef, drag, handleProps } = useDragReorder({
    onDrop: (from, before) => void save(moveRow(plain, from, before), plain[from].id),
    onStep: (i, dir) => void save(moveRowBy(plain, i, dir), plain[i].id),
  });

  const groups = rows.filter((r) => r.row.kind === 'group');

  return (
    <>
      <ReorderHint />
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      <div ref={listRef} className={styles.list}>
        {rows.map((r, i) => {
          const isGroup = r.row.kind === 'group';
          const inGroup = r.row.kind === 'location' && r.row.groupId !== null;
          const lifted = drag?.from === i;
          return (
            <div key={r.row.id} className={styles.rowWrap}>
              {drag && drag.before === i && drag.before !== drag.from && drag.before !== drag.from + 1 && (
                <span className={styles.dropLine} aria-hidden="true" />
              )}
              <div
                data-reorder-row
                className={isGroup ? styles.groupRow : styles.row}
                data-in-group={inGroup}
                data-lifted={lifted}
                style={lifted ? { transform: `translateY(${drag.dy}px)` } : undefined}
              >
                <DragHandle label={isGroup ? `group ${r.name}` : r.name} props={handleProps(i)} />
                <InlineName
                  value={r.name}
                  className={isGroup ? styles.groupName : undefined}
                  onSave={(name) => void (isGroup ? repo.renameGroup(r.row.id, name) : repo.renameLocation(r.row.id, name))}
                />
                {isGroup ? (
                  <span className={styles.meta}>group</span>
                ) : (
                  <span className={styles.meta}>{r.itemCount ? plural(r.itemCount, 'item') : 'Empty'}</span>
                )}
                <DeleteButton label={isGroup ? `group ${r.name}` : r.name} onClick={() => setSheet({ kind: 'delete', target: r })} />
              </div>
            </div>
          );
        })}
        {drag && drag.before >= rows.length && drag.from !== rows.length - 1 && (
          <span className={styles.dropLine} aria-hidden="true" />
        )}
        <div className={styles.fixedRow}>
          <span className={styles.fixedName}>Unassigned</span>
          <span className={styles.meta}>
            {data?.unassignedCount ? `${plural(data.unassignedCount, 'item')} · ` : ''}Always last
          </span>
        </div>
      </div>

      <div className={styles.addButtons}>
        <Button onClick={() => setSheet({ kind: 'addLocation' })}>Add location</Button>
        <Button variant="secondary" onClick={() => setSheet({ kind: 'addGroup' })}>
          Add group
        </Button>
      </div>
      <p className={styles.footnote}>
        Drag to reorder. Tap a name to rename. Deleting a location moves its items to Unassigned.
      </p>

      {sheet?.kind === 'addLocation' && (
        <AddLocationSheet groups={groups} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'addGroup' && (
        <NameSheet
          title="Add group"
          placeholder="Pantry"
          onSave={(name) => repo.addGroup(name)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'delete' && (
        <ConfirmSheet
          title={sheet.target.row.kind === 'group' ? `Delete the ${sheet.target.name} group?` : `Delete ${sheet.target.name}?`}
          consequence={
            sheet.target.row.kind === 'group'
              ? sheet.target.childCount
                ? `Its ${plural(sheet.target.childCount, 'location')} will stay, just not grouped.`
                : 'It has no locations.'
              : sheet.target.itemCount
                ? `${plural(sheet.target.itemCount, 'item')} will move to Unassigned.`
                : 'Nothing is stored here.'
          }
          onConfirm={async () => {
            const t = sheet.target.row;
            if (t.kind === 'group') await repo.deleteGroup(t.id);
            else await repo.deleteLocation(t.id);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function AddLocationSheet({ groups, onClose }: { groups: LocationSettingsRow[]; onClose: () => void }) {
  const [groupId, setGroupId] = useState<ID | null>(null);
  return (
    <NameSheet
      title="Add location"
      placeholder="Refrigerator door"
      onSave={(name) => repo.addLocation(name, groupId)}
      onClose={onClose}
    >
      {groups.length > 0 && (
        <div className={sheetStyles.field}>
          <span id="add-loc-group" className={sheetStyles.label}>
            Group
          </span>
          <div role="radiogroup" aria-labelledby="add-loc-group" className={sheetStyles.chips}>
            <Chip kind="radio" selected={groupId === null} onClick={() => setGroupId(null)}>
              None
            </Chip>
            {groups.map((g) => (
              <Chip key={g.row.id} kind="radio" selected={groupId === g.row.id} onClick={() => setGroupId(g.row.id)}>
                {g.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </NameSheet>
  );
}
