// Shared pieces of the Settings screens.
import { useState, type ReactNode } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import type { useDragReorder } from '../../ui/useDragReorder';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import styles from './Settings.module.css';

/** Tap the name to rename it in place. Enter or leaving the field saves; Esc cancels. */
export function InlineName({
  value,
  onSave,
  className,
  meta,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  /** A second line ("Preferred for 2 items") inside the same tap target. */
  meta?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        type="button"
        className={[styles.name, meta && styles.nameWithMeta, className].filter(Boolean).join(' ')}
        aria-label={`Rename ${value}`}
        aria-description={meta}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {meta ? (
          <>
            <span>{value}</span>
            <span className={styles.metaLine}>{meta}</span>
          </>
        ) : (
          value
        )}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <input
      className={styles.nameInput}
      aria-label={`New name for ${value}`}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      enterKeyHint="done"
    />
  );
}

/** 44px grip. Drag it, or focus it and use the arrow keys. */
export function DragHandle({
  label,
  props,
}: {
  label: string;
  props: ReturnType<ReturnType<typeof useDragReorder>['handleProps']>;
}) {
  return (
    <button
      type="button"
      className={styles.handle}
      aria-label={`Reorder ${label}`}
      aria-describedby="reorder-hint"
      {...props}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
      </svg>
    </button>
  );
}

export function ReorderHint() {
  return (
    <span id="reorder-hint" className="visually-hidden">
      Drag to reorder, or use the up and down arrow keys.
    </span>
  );
}

export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.delete} aria-label={`Delete ${label}`} onClick={onClick}>
      <Icon name="trash" size={18} strokeWidth={1.8} />
    </button>
  );
}

/** Name a new location, group or store. */
export function NameSheet({
  title,
  placeholder,
  onSave,
  onClose,
  children,
}: {
  title: string;
  placeholder: string;
  onSave: (name: string) => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [name, setName] = useState('');
  const [busy, submit] = useSubmitOnce();
  const save = () =>
    submit(async () => {
      if (!name.trim()) return;
      await onSave(name.trim());
      onClose();
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>
            Add
          </Button>
        </>
      }
    >
      <label className={sheetStyles.field}>
        <span className={sheetStyles.label}>Name</span>
        <input
          className={sheetStyles.textInput}
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          data-autofocus
        />
      </label>
      {children}
    </Sheet>
  );
}
