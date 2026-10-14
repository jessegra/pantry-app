import { useState } from 'react';

/**
 * Shows a reordered list immediately, before the write lands and the live query
 * catches up, so quick repeated moves (arrow keys) each build on the last one.
 * While the live data is still at one of the states this hook moved away from,
 * the newest local order is shown. Once the live data reaches it, or changes in
 * some other way (another edit), the live data wins.
 */
export function useOptimisticOrder<T>(live: T[], keyOf: (t: T) => string): [T[], (next: T[]) => void] {
  const key = (rows: T[]) => rows.map(keyOf).join('|');
  const liveKey = key(live);
  const [local, setLocal] = useState<{ passed: string[]; rows: T[] } | null>(null);
  const catchingUp = local !== null && local.passed.includes(liveKey);
  const shown = catchingUp ? local.rows : live;
  const set = (next: T[]) =>
    setLocal({ passed: catchingUp ? [...local.passed, key(local.rows)] : [liveKey], rows: next });
  return [shown, set];
}
