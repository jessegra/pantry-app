import { useRef, type PointerEvent } from 'react';
import { LONG_PRESS_MS, SCROLL_SLOP_PX } from './StatusBar';

/**
 * 500 ms press anywhere on a row opens item detail (SPEC §3). Presses that start
 * on the status bar are left to it; movement cancels so scrolling still works.
 * Returns pointer handlers to spread on the row.
 */
export function useLongPress(onLongPress: () => void) {
  const state = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancel = () => {
    if (state.current) clearTimeout(state.current.timer);
    state.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      cancel();
      if (!e.isPrimary || (e.target as Element).closest('[role="slider"]')) return;
      state.current = { x: e.clientX, y: e.clientY, timer: setTimeout(onLongPress, LONG_PRESS_MS) };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = state.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SCROLL_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
