import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom (Cancel / Save etc.). */
  actions?: ReactNode;
}

/**
 * Bottom sheet (DESIGN.md): radius 16 top, grabber, scrim. Built on <dialog> with
 * showModal(), so focus is trapped and Esc closes. Tapping the scrim closes too.
 * Becomes a centred dialog on tablet (SPEC §4.8, via CSS).
 */
export function Sheet({ open, onClose, title, description, children, actions }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    // Whatever opened the sheet gets focus back when it closes or unmounts. Most
    // sheets unmount rather than close, and the browser only restores on close().
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    // showModal() focuses the first field, which pops the phone keyboard over the
    // sheet. Focus the title instead, unless a field opts in with data-autofocus.
    (d.querySelector<HTMLElement>('[data-autofocus]') ?? d.querySelector<HTMLElement>('h2'))?.focus();
    return () => {
      if (d.open) d.close();
      // The opener may be gone (a deleted row); then focus falls back to the page.
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // we own `open`
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // scrim (outside the panel)
      }}
    >
      {open && (
        <div className={styles.panel}>
          <span className={styles.grabber} aria-hidden="true" />
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title} tabIndex={-1}>
              {title}
            </h2>
            {description && (
              <p id={descId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          {children}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

/** A labelled block inside a sheet: "Unit", "Location"… */
export function SheetField({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div className={styles.field} role="group" aria-labelledby={id}>
      <span id={id} className={styles.label}>
        {label}
      </span>
      {children}
    </div>
  );
}
