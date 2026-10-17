// The app's one sync engine, talking to the PHP API on this site's /api.
// Tests swap in an engine backed by FakeSyncApi with setSync().
import { useSyncExternalStore } from 'react';
import { repo } from '../repo';
import { HttpSyncApi } from './api';
import { whoDid } from '../../domain/people';
import { SyncEngine, type SyncStatus } from './engine';

let current = new SyncEngine(repo.db, new HttpSyncApi());

export const getSync = () => current;

/** Test hook. */
export function setSync(engine: SyncEngine) {
  current = engine;
}

export function useSyncStatus(): SyncStatus {
  const engine = getSync();
  return useSyncExternalStore(engine.subscribe, engine.getStatus);
}

/** A friendly default name for this device, shown in the server's device list. */
export function guessDeviceName(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}

/** "you", "Kim", or null (see whoDid): for "Added by Kim". */
export function useWhoDid(): (by: string | undefined) => string | null {
  const { people, user } = useSyncStatus();
  return (by) => whoDid(by, people, user?.id);
}
