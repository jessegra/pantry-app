import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface DragState {
  /** Row being dragged. */
  from: number;
  /** It would land before this row (0..count). */
  before: number;
  /** Vertical offset to draw the lifted row at. */
  dy: number;
}

interface Options {
  /** Commit a drop: move row `from` to land before row `before`. */
  onDrop: (from: number, before: number) => void;
  /** Arrow keys on a handle: one step up (-1) or down (+1). */
  onStep: (index: number, dir: -1 | 1) => void;
}

/**
 * Handle-only drag to reorder (SPEC §4.7), built on pointer events so touch works.
 * Rows mark themselves with data-reorder-row inside the element given `listRef`.
 * Arrow keys on a focused handle are the keyboard alternative.
 */
export function useDragReorder({ onDrop, onStep }: Options) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const start = useRef<{ y: number; mids: number[]; pointerId: number } | null>(null);

  const handleProps = (index: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!e.isPrimary || e.button > 0) return;
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-reorder-row]') ?? [];
      const mids = Array.from(rows, (r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      start.current = { y: e.clientY, mids, pointerId: e.pointerId };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ from: index, before: index, dy: 0 });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const before = s.mids.filter((m) => m < e.clientY).length;
      setDrag({ from: index, before, dy: e.clientY - s.y });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      setDrag(null);
      if (!s || s.pointerId !== e.pointerId || Math.abs(e.clientY - s.y) < 4) return;
      onDrop(index, s.mids.filter((m) => m < e.clientY).length);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      onStep(index, e.key === 'ArrowUp' ? -1 : 1);
    },
  });

  return { listRef, drag, handleProps };
}
