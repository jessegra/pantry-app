import { useRef, useState } from 'react';

/**
 * Runs a save at most once at a time. Repeat taps, or Enter followed by a tap on
 * Add, while it's still running are ignored, so one intent makes one record.
 * `busy` is for disabling the button; the ref is what actually blocks, since a
 * second tap can land before React has re-rendered the button as disabled.
 */
export function useSubmitOnce(): [busy: boolean, run: (work: () => Promise<unknown>) => Promise<void>] {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return [busy, run];
}
