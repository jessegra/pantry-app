import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  applyTap,
  ariaValueText,
  dragToAmount,
  fillFraction,
  getStatus,
  tickPositions,
} from '../domain/rules';
import type { Item } from '../domain/types';
import styles from './StatusBar.module.css';

export const DRAG_SLOP_PX = 8;
export const SCROLL_SLOP_PX = 10;
export const LONG_PRESS_MS = 500;

type BarItem = Pick<Item, 'name' | 'par' | 'unit' | 'lowThreshold'>;

interface StatusBarProps {
  item: BarItem;
  /** Current (possibly optimistic) amount. */
  amount: number;
  onChange: (amount: number) => void;
  /** Long-press: open item detail. */
  onLongPress?: () => void;
  size?: 'row' | 'large';
}

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  mode: 'pending' | 'drag' | 'cancelled' | 'longpress';
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * The status bar (SPEC §3, DESIGN.md). Tap the left half for −1 step, the right
 * half for +1; drag horizontally to set a value; long-press for detail.
 * A vertical move first cancels so the list can scroll. Exposed as a slider.
 */
export function StatusBar({ item, amount, onChange, onLongPress, size = 'row' }: StatusBarProps) {
  const zone = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const current = { ...item, amount };
  const status = getStatus(current);
  const ticks = tickPositions(item);
  const par = item.par ?? 0;

  const fractionAt = (clientX: number) => {
    const rect = zone.current!.getBoundingClientRect();
    return rect.width ? (clientX - rect.left) / rect.width : 0;
  };

  const end = () => {
    clearTimeout(gesture.current?.timer);
    gesture.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button > 0) return;
    end();
    const g: Gesture = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, mode: 'pending' };
    if (onLongPress) {
      g.timer = setTimeout(() => {
        if (gesture.current === g && g.mode === 'pending') {
          g.mode = 'longpress';
          onLongPress();
        }
      }, LONG_PRESS_MS);
    }
    gesture.current = g;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.mode === 'pending') {
      const dx = Math.abs(e.clientX - g.x);
      const dy = Math.abs(e.clientY - g.y);
      if (dy > SCROLL_SLOP_PX && dy > dx) {
        g.mode = 'cancelled'; // let the list scroll
        clearTimeout(g.timer);
      } else if (dx > DRAG_SLOP_PX) {
        g.mode = 'drag';
        clearTimeout(g.timer);
        zone.current?.setPointerCapture?.(e.pointerId);
      }
    }
    if (g.mode === 'drag') {
      const next = dragToAmount(item, fractionAt(e.clientX));
      if (next !== amount) onChange(next);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.mode === 'pending') {
      const dir = fractionAt(e.clientX) < 0.5 ? -1 : 1;
      onChange(applyTap(current, dir));
    }
    end();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = applyTap(current, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = applyTap(current, -1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = par;
    if (next === undefined) return;
    e.preventDefault();
    if (next !== amount) onChange(next);
  };

  return (
    <div
      ref={zone}
      className={styles.zone}
      data-size={size}
      role="slider"
      tabIndex={0}
      aria-label={item.name}
      aria-valuemin={0}
      aria-valuemax={par}
      aria-valuenow={amount}
      aria-valuetext={ariaValueText(current)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.track}>
        <div className={styles.fill} data-status={status} style={{ width: `${fillFraction(current) * 100}%` }} />
        {ticks.map((t) => (
          <span key={t} className={styles.tick} style={{ left: `${t * 100}%` }} />
        ))}
      </div>
    </div>
  );
}
