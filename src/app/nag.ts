import { createContext, useContext } from 'react';
import type { ItemChange } from '../data/repo';
import type { missingForList } from '../domain/rules';
import type { ID } from '../domain/types';

export type Missing = ReturnType<typeof missingForList>;

export interface NagApi {
  /** Pass every ItemChange from the repo; shows the store prompt when needed. */
  report: (itemId: ID, change: ItemChange) => void;
  /** A not-set-up item was added to the list: ask for what's missing. */
  askForMissing: (itemId: ID, missing: Missing) => void;
}

export const NagContext = createContext<NagApi>({ report: () => {}, askForMissing: () => {} });

/** Once per item per session (SPEC §3). Module-level so it survives remounts. */
export const askedThisSession = new Set<ID>();

/** Test hook. */
export function resetNagSession() {
  askedThisSession.clear();
}

export const useNag = () => useContext(NagContext);
