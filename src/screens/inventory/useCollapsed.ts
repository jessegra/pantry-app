import { useCallback, useState } from 'react';
import type { ID } from '../../domain/types';

const KEY = 'pantry.collapsedLocations';
const UNASSIGNED = '__unassigned';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Which location headers are collapsed. Remembered per device (SPEC §4.1). */
export function useCollapsed(): [(id: ID | null) => boolean, (id: ID | null) => void] {
  const [collapsed, setCollapsed] = useState(load);
  const isCollapsed = useCallback((id: ID | null) => collapsed.has(id ?? UNASSIGNED), [collapsed]);
  const toggle = useCallback((id: ID | null) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const key = id ?? UNASSIGNED;
      if (!next.delete(key)) next.add(key);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Private mode or storage full: collapse still works for this session.
      }
      return next;
    });
  }, []);
  return [isCollapsed, toggle];
}
