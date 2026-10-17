// Change tracking for sync (docs/SYNC_PLAN.md). Installed on the database itself,
// so every write through the repository is tracked without the repository knowing.
//
// - A created or updated record gets `_dirty: 1` (and an `updatedAt` if the write
//   didn't set one): it needs sending.
// - A deleted record leaves a tombstone, so other devices learn about the delete.
// - Writes that come *from* the server run in a transaction marked remote, and are
//   not tracked (otherwise they'd be sent straight back).
import type Dexie from 'dexie';
import type { Transaction } from 'dexie';

/** Tables that sync. Activity (Quick add's recent taps) and meta stay on the device. */
export const SYNCED_TABLES = [
  'items',
  'locations',
  'groups',
  'stores',
  'listEntries',
  'staples',
  'categories',
  'recipes',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** A delete waiting to be sent. */
export interface Tombstone {
  tbl: SyncedTable;
  id: string;
  updatedAt: number;
}

/** The flag on records with unsent changes. Never part of the synced data. */
export const DIRTY = '_dirty';

const remote = new WeakSet<object>();

/** Marks the current transaction as applying server data: its writes aren't tracked. */
export function markRemote(tx: Transaction | null | undefined) {
  if (tx) remote.add(tx);
}

function isRemote(tx: Transaction | null | undefined): boolean {
  for (let t: Transaction | undefined | null = tx; t; t = (t as { parent?: Transaction }).parent) {
    if (remote.has(t)) return true;
  }
  return false;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called after any tracked local change: the sync scheduler uses it to push soon. */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(tx: Transaction) {
  if (!listeners.size) return;
  tx.on('complete', () => listeners.forEach((l) => l()));
}

export function installSyncHooks(db: Dexie) {
  for (const name of SYNCED_TABLES) {
    const table = db.table(name);

    table.hook('creating', (_key, obj: Record<string, unknown>, tx) => {
      if (isRemote(tx)) return;
      obj[DIRTY] = 1;
      if (typeof obj.updatedAt !== 'number') obj.updatedAt = Date.now();
      notify(tx);
    });

    table.hook('updating', (mods, _key, _obj, tx) => {
      if (isRemote(tx)) return undefined;
      notify(tx);
      return 'updatedAt' in (mods as object) ? { [DIRTY]: 1 } : { [DIRTY]: 1, updatedAt: Date.now() };
    });

    table.hook('deleting', (key, _obj, tx) => {
      if (isRemote(tx)) return;
      const tomb: Tombstone = { tbl: name, id: String(key), updatedAt: Date.now() };
      if (tx.storeNames.includes('tombstones')) {
        // Same transaction: the delete and its tombstone commit together.
        void tx.table('tombstones').put(tomb);
      } else {
        // The repository didn't include tombstones in this transaction: record it
        // right after the delete commits.
        tx.on('complete', () => void db.table('tombstones').put(tomb));
      }
      notify(tx);
    });
  }
}

/** A record as sent to the server: the tracking flag removed. */
export function stripLocal<T extends object>(row: T): T {
  const { [DIRTY]: _dirty, ...data } = row as T & { [DIRTY]?: number };
  void _dirty;
  return data as T;
}
