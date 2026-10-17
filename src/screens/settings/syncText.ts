import type { SyncStatus } from '../../data/sync/engine';
import { plural, relativeTime } from '../../domain/text';

/** "Synced 2 minutes ago", "Offline: 3 changes waiting"… */
export function syncStatusText(s: SyncStatus, now: number): string {
  const waiting = s.pending ? ` · ${plural(s.pending, 'change')} waiting` : '';
  switch (s.phase) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return `Offline${waiting || ' · will sync when the connection is back'}`;
    case 'error':
      return `Couldn’t sync: ${s.message ?? 'server error'}${waiting}`;
    case 'signed-out':
      return s.message ?? 'Signed out';
    default:
      return s.lastSyncAt ? `Synced ${relativeTime(s.lastSyncAt, now)}${waiting}` : `Connected${waiting}`;
  }
}
