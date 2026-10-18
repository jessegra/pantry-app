// Text size (Settings → More). A per-device preference: each person's eyes, so it
// isn't synced. Scales every --text-* token through --text-scale (tokens.css).
import { useSyncExternalStore } from 'react';

export const TEXT_SIZES = [
  { key: 'standard', label: 'Standard', scale: 1 },
  { key: 'large', label: 'Large', scale: 1.15 },
  { key: 'largest', label: 'Largest', scale: 1.3 },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]['key'];

const KEY = 'pantry.textSize';
const listeners = new Set<() => void>();

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return TEXT_SIZES.some((s) => s.key === v) ? (v as TextSize) : 'standard';
  } catch {
    return 'standard'; // storage blocked: the default still works
  }
}

/** Applies the saved size to the page. Call once at startup. */
export function applyTextSize(size: TextSize = getTextSize()) {
  const scale = TEXT_SIZES.find((s) => s.key === size)!.scale;
  document.documentElement.style.setProperty('--text-scale', String(scale));
}

export function setTextSize(size: TextSize) {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // Not saved, but still applied for now.
  }
  applyTextSize(size);
  listeners.forEach((l) => l());
}

export function useTextSize(): TextSize {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getTextSize);
}
