import { useSyncExternalStore } from 'react';

/** Tablet breakpoint (SPEC §4.8). Keep in step with the @media (min-width: 768px) rules. */
export const WIDE_QUERY = '(min-width: 768px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {};
      const mql = matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    () => false,
  );
}

export const useWide = () => useMediaQuery(WIDE_QUERY);
