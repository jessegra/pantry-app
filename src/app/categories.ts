import { createContext, useContext } from 'react';
import { categoryIcon } from '../domain/categories';
import type { Category, ID } from '../domain/types';

export interface CategoriesApi {
  /** Alphabetical, Other last. */
  list: Category[];
  byId: Map<ID, Category>;
}

export const CategoriesContext = createContext<CategoriesApi>({ list: [], byId: new Map() });

export const useCategories = () => useContext(CategoriesContext);

/** Icon path and display name for an item's category. */
export function useCategory(id: ID): { icon: string; name: string } {
  const { byId } = useCategories();
  return { icon: categoryIcon(id, byId), name: categoryName(id, byId) };
}

/** Empty until categories have loaded, so "Other" never flashes up first. */
export function categoryName(id: ID, byId: Map<ID, Category>): string {
  if (byId.size === 0) return '';
  return byId.get(id)?.name ?? byId.get('generic')?.name ?? 'Other';
}
