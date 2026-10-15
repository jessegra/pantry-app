import type { ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

/** "Delete Shelf 1? 2 items will move to Unassigned." In-app, never window.confirm (SPEC §4.7). */
export function ConfirmSheet({
  title,
  consequence,
  onConfirm,
  onClose,
  confirmLabel = 'Delete',
}: {
  title: string;
  consequence: ReactNode;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  confirmLabel?: string;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      description={consequence}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
