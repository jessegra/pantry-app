import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, type ReactNode } from 'react';
import { repo } from '../data/repo';
import { sortCategories } from '../domain/categories';
import { CategoriesContext } from './categories';

/** One live query for every icon on screen, instead of one per row. */
export function CategoriesProvider({ children }: { children: ReactNode }) {
  const categories = useLiveQuery(() => repo.db.categories.toArray(), []);
  const value = useMemo(() => {
    const list = sortCategories(categories ?? []);
    return { list, byId: new Map(list.map((c) => [c.id, c])) };
  }, [categories]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}
