import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item } from '../domain/types';
import { repo, type ItemChange } from './repo';

export const COMMIT_DELAY_MS = 300;

/**
 * A bar's amount, updated within the frame on every tap or drag, and written to
 * IndexedDB once the taps pause (SPEC §5: debounce ~300 ms into one write per item).
 * Pending changes flush on unmount, so leaving the screen never drops a tap.
 */
export function useOptimisticAmount(
  item: Pick<Item, 'id' | 'amount'>,
  onCommitted?: (change: ItemChange) => void,
): [number, (amount: number) => void] {
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<number | null>(null);
  const onCommittedRef = useRef(onCommitted);
  useEffect(() => {
    onCommittedRef.current = onCommitted;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const value = latest.current;
    if (value == null) return;
    latest.current = null;
    void repo.setAmount(item.id, value).then((change) => {
      // Drop the local value only if no newer tap arrived while writing.
      if (latest.current == null) setPending(null);
      onCommittedRef.current?.(change);
    });
  }, [item.id]);

  const set = useCallback(
    (amount: number) => {
      latest.current = amount;
      setPending(amount);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, COMMIT_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => flush, [flush]);

  return [pending ?? item.amount, set];
}
