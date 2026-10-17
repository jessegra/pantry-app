// The sync engine (docs/SYNC_PLAN.md): push this device's changes, pull everyone
// else's, newest change wins. Screens never call it directly for data; they keep
// using the repository, and this runs underneath.
import Dexie from 'dexie';
import type { PantryDB } from '../db';
import {
  SyncError,
  type Change,
  type Code,
  type Person,
  type PersonWithDevices,
  type ServerChange,
  type SignedIn,
  type SyncApi,
} from './api';
import { DIRTY, SYNCED_TABLES, markRemote, onLocalChange, setCurrentUser, stripLocal, type SyncedTable } from './hooks';

const STATE_KEY = 'sync';
const PUSH_BATCH = 200;
const PULL_BATCH = 1000;
const SYNC_DEBOUNCE_MS = 2000;
const SYNC_INTERVAL_MS = 60_000;
const SIGNED_OUT_MESSAGE = 'This device was signed out. Sign in again to keep syncing; nothing on it is lost.';

/** Persisted in the meta table (cleared by Reset / Erase / Import, which signs the device out). */
interface SyncState {
  token: string;
  /** Server sequence number pulled up to. */
  cursor: number;
  device: string;
  connectedAt: number;
  lastSyncAt?: number;
  /** Who's signed in here (docs/USERS_PLAN.md). Missing on devices connected before people existed, until the next sync. */
  user?: Person;
  /** Everyone, as of the last sync: names for "Added by Kim", and the People list. */
  people?: PersonWithDevices[];
}

export type SyncPhase =
  | 'disconnected' // never connected, or signed out on this device
  | 'idle' // connected, nothing happening
  | 'syncing'
  | 'offline' // connected, but the server can't be reached; changes wait
  | 'signed-out' // the server no longer accepts this device (password changed, signed out elsewhere)
  | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** Changes on this device not yet on the server. */
  pending: number;
  lastSyncAt?: number;
  device?: string;
  message?: string;
  user?: Person;
  people?: PersonWithDevices[];
}

type Row = Record<string, unknown> & { id: string; updatedAt: number };

export class SyncEngine {
  private status: SyncStatus = { phase: 'disconnected', pending: 0 };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  /** Between signing in and choosing what to start with. */
  private pending: { token: string; device: string; serverEmpty: boolean; user: Person } | null = null;

  constructor(
    private readonly db: PantryDB,
    private readonly api: SyncApi,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------- Status (for the Settings screen) ----------

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SyncStatus>) {
    if ('user' in patch) setCurrentUser(this.db, patch.user?.id);
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l());
  }

  private async readState(): Promise<SyncState | undefined> {
    return (await this.db.meta.get(STATE_KEY))?.value as SyncState | undefined;
  }

  private async writeState(state: SyncState | undefined) {
    if (state) await this.db.meta.put({ key: STATE_KEY, value: state });
    else await this.db.meta.delete(STATE_KEY);
  }

  /** Changes waiting to be sent: unsent records plus deletes. */
  async pendingCount(): Promise<number> {
    let n = await this.db.tombstones.count();
    for (const t of SYNCED_TABLES)
      n += await this.db
        .table(t)
        .filter((r) => r[DIRTY] === 1)
        .count();
    return n;
  }

  /** Reads the saved state; call once at startup. */
  async load(): Promise<SyncStatus> {
    const state = await this.readState();
    this.set({
      phase: !state ? 'disconnected' : state.token ? 'idle' : 'signed-out',
      lastSyncAt: state?.lastSyncAt,
      device: state?.device,
      pending: state ? await this.pendingCount() : 0,
      message: state && !state.token ? SIGNED_OUT_MESSAGE : undefined,
      user: state?.user,
      people: state?.people,
    });
    return this.status;
  }

  // ---------- Connecting a device ----------

  /**
   * Step 1: check the household password. Nothing changes on this device yet; the
   * caller then picks startWithThisDevice (server empty) or startWithServerData.
   */
  async signIn(name: string, password: string, device: string): Promise<{ serverEmpty: boolean; resumed: boolean }> {
    return this.signedIn(await this.api.login(name, password, device), device);
  }

  /** Step 1, with an invite (someone new) or a new-password code instead of a password. */
  async join(code: string, password: string, device: string): Promise<{ serverEmpty: boolean; resumed: boolean }> {
    return this.signedIn(await this.api.join(code, password, device), device);
  }

  private async signedIn({ token, serverEmpty, user }: SignedIn, device: string) {
    const previous = await this.readState();
    if (previous) {
      // Signed out (password changed, or "sign out everywhere"): pick up where it
      // left off. Its place in the change stream and its unsent changes are kept.
      // (Whoever signs in now is who this device's changes come from.)
      await this.writeState({ ...previous, token, user });
      this.set({ phase: 'idle', message: undefined, user });
      await this.syncNow();
      return { serverEmpty, resumed: true };
    }
    this.pending = { token, device, serverEmpty, user };
    return { serverEmpty, resumed: false };
  }

  /** First device: everything here goes up to the (empty) server. */
  async startWithThisDevice(): Promise<void> {
    const p = this.takePending();
    const { db } = this;
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async () => {
      markRemote(Dexie.currentTransaction);
      const t = this.now();
      for (const name of SYNCED_TABLES) {
        await db
          .table(name)
          .toCollection()
          .modify((r: Row) => {
            r[DIRTY] = 1;
            if (typeof r.updatedAt !== 'number') r.updatedAt = t;
          });
      }
      await db.tombstones.clear(); // deletes from before connecting mean nothing to the server
    });
    await this.connect(p);
  }

  /** Another device: this device's data is replaced by the server's. */
  async startWithServerData(): Promise<void> {
    const p = this.takePending();
    const { db } = this;
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async () => {
      markRemote(Dexie.currentTransaction);
      for (const name of SYNCED_TABLES) await db.table(name).clear();
      await db.tombstones.clear();
    });
    await this.connect(p);
  }

  /** Changed their mind before choosing: forget the sign-in. */
  async cancelSignIn(): Promise<void> {
    const p = this.pending;
    this.pending = null;
    if (p) await this.api.logout(p.token).catch(() => {});
  }

  private takePending() {
    if (!this.pending) throw new Error('Sign in first');
    const p = this.pending;
    this.pending = null;
    return p;
  }

  private async connect(p: { token: string; device: string; user: Person }) {
    await this.writeState({ token: p.token, cursor: 0, device: p.device, connectedAt: this.now(), user: p.user });
    this.set({ phase: 'idle', device: p.device, message: undefined, user: p.user });
    await this.syncNow();
  }

  /** This device only. Its data stays; it just stops syncing. */
  async signOut(): Promise<void> {
    const state = await this.readState();
    if (state?.token) await this.api.logout(state.token).catch(() => {});
    await this.forget();
  }

  private async forget() {
    await this.writeState(undefined);
    this.set({
      phase: 'disconnected',
      pending: 0,
      lastSyncAt: undefined,
      device: undefined,
      message: undefined,
      user: undefined,
      people: undefined,
    });
  }

  /** Every device of everyone (a lost phone). This one signs out too. */
  async signOutEverywhere(): Promise<void> {
    const state = await this.readState();
    if (state?.token) await this.api.logoutAll(state.token);
    await this.forget();
  }

  // ---------- People (docs/USERS_PLAN.md) ----------

  private async token(): Promise<string> {
    const state = await this.readState();
    if (!state?.token) throw new SyncError('signed-out', 'Not signed in');
    return state.token;
  }

  /** Asks the server who's who; keeps it for names and the People list. */
  async refreshPeople(): Promise<void> {
    const state = await this.readState();
    if (!state?.token) return;
    const { user, people } = await this.api.me(state.token);
    const latest = await this.readState();
    if (latest?.token !== state.token) return; // signed out meanwhile
    await this.writeState({ ...latest, user, people });
    this.set({ user, people });
  }

  /** A one-time code for someone new to join this pantry. */
  async invite(name: string): Promise<Code> {
    const code = await this.api.invite(await this.token(), name);
    return code;
  }

  /** A one-time code for someone who forgot their password. */
  async newCode(userId: string): Promise<Code> {
    return this.api.newCode(await this.token(), userId);
  }

  async renamePerson(userId: string, name: string): Promise<void> {
    await this.api.rename(await this.token(), userId, name);
    await this.refreshPeople();
  }

  /** Every device of one person. If it's you, this device is signed out too. */
  async signOutPerson(userId: string): Promise<void> {
    await this.api.signOutPerson(await this.token(), userId);
    if (userId === this.status.user?.id) {
      const state = await this.readState();
      if (state) await this.writeState({ ...state, token: '' });
      this.set({ phase: 'signed-out', message: SIGNED_OUT_MESSAGE });
      return;
    }
    await this.refreshPeople();
  }

  async removePerson(userId: string): Promise<void> {
    await this.api.removePerson(await this.token(), userId);
    await this.refreshPeople();
  }

  // ---------- Syncing ----------

  /** Push then pull. Safe to call often: one run at a time, with one follow-up if asked again. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    const state = await this.readState();
    if (!state) {
      // Signed out, or a Reset/Erase/Import cleared the state.
      if (this.status.phase !== 'disconnected' && this.status.phase !== 'signed-out')
        this.set({ phase: 'disconnected' });
      return;
    }
    if (!state.token) {
      this.set({ phase: 'signed-out', pending: await this.pendingCount(), message: SIGNED_OUT_MESSAGE });
      return;
    }
    this.set({ phase: 'syncing', message: undefined });
    try {
      await this.push(state.token);
      await this.pull(state);
      await this.refreshPeople();
      const lastSyncAt = this.now();
      await this.writeState({ ...(await this.readState())!, cursor: state.cursor, lastSyncAt });
      this.set({ phase: 'idle', lastSyncAt, pending: await this.pendingCount() });
    } catch (e) {
      const pending = await this.pendingCount();
      if (e instanceof SyncError && e.kind === 'offline') {
        this.set({ phase: 'offline', pending, message: undefined });
      } else if (e instanceof SyncError && e.kind === 'signed-out') {
        // Keep the cursor and unsent changes; only the token is gone.
        await this.writeState({ ...state, token: '' });
        this.set({ phase: 'signed-out', pending, message: SIGNED_OUT_MESSAGE });
      } else {
        this.set({ phase: 'error', pending, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  private async collectChanges(): Promise<Change[]> {
    const changes: Change[] = [];
    for (const tbl of SYNCED_TABLES) {
      const rows = (await this.db
        .table(tbl)
        .filter((r) => r[DIRTY] === 1)
        .toArray()) as Row[];
      for (const r of rows) {
        changes.push({ tbl, id: r.id, data: stripLocal(r), deleted: false, updatedAt: r.updatedAt });
      }
    }
    for (const t of await this.db.tombstones.toArray()) {
      changes.push({ tbl: t.tbl, id: t.id, data: null, deleted: true, updatedAt: t.updatedAt });
    }
    return changes;
  }

  private async push(token: string) {
    const changes = await this.collectChanges();
    for (let i = 0; i < changes.length; i += PUSH_BATCH) {
      const batch = changes.slice(i, i + PUSH_BATCH);
      await this.api.push(token, batch);
      await this.markSent(batch);
    }
  }

  /** Clears the "needs sending" mark, unless the record changed again meanwhile. */
  private async markSent(batch: Change[]) {
    const { db } = this;
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async () => {
      markRemote(Dexie.currentTransaction);
      for (const c of batch) {
        if (c.deleted) {
          const tomb = await db.tombstones.get([c.tbl, c.id]);
          if (tomb && tomb.updatedAt === c.updatedAt) await db.tombstones.delete([c.tbl, c.id]);
          continue;
        }
        const table = db.table(c.tbl);
        const row = (await table.get(c.id)) as Row | undefined;
        if (row && row[DIRTY] === 1 && row.updatedAt === c.updatedAt) await table.update(c.id, { [DIRTY]: 0 });
      }
    });
  }

  private async pull(state: SyncState) {
    let more = true;
    while (more) {
      const res = await this.api.pull(state.token, state.cursor, PULL_BATCH);
      await this.apply(res.changes);
      state.cursor = res.cursor;
      await this.writeState(state);
      more = res.more;
    }
  }

  /** Applies server changes, newest wins; a newer unsent local change is kept (and pushed next). */
  async apply(changes: ServerChange[]) {
    if (!changes.length) return;
    const { db } = this;
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async () => {
      markRemote(Dexie.currentTransaction);
      for (const c of changes) {
        if (!(SYNCED_TABLES as readonly string[]).includes(c.tbl)) continue; // from a newer app version
        const table = db.table(c.tbl as SyncedTable);
        const local = (await table.get(c.id)) as Row | undefined;
        if (local && local[DIRTY] === 1 && local.updatedAt > c.updatedAt) continue;
        const tomb = await db.tombstones.get([c.tbl, c.id]);
        if (tomb && tomb.updatedAt > c.updatedAt) continue;
        if (tomb) await db.tombstones.delete([c.tbl, c.id]);
        if (c.deleted) {
          if (local) await table.delete(c.id);
        } else {
          await table.put({ ...c.data, id: c.id, updatedAt: c.updatedAt, [DIRTY]: 0 });
        }
      }
    });
  }

  // ---------- When to sync ----------

  /**
   * Syncs on start, a moment after local changes, when the connection comes back,
   * when the app returns to the foreground, and every minute while visible.
   * Returns a stop function.
   */
  start(): () => void {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void this.syncNow(), SYNC_DEBOUNCE_MS);
    };
    const now = () => void this.syncNow();
    const visible = () => {
      if (document.visibilityState === 'visible') now();
    };
    const offLocal = onLocalChange(() => {
      // Keep the pending count fresh even before the push.
      void this.pendingCount().then((pending) => this.status.phase !== 'disconnected' && this.set({ pending }));
      soon();
    });
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', visible);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') now();
    }, SYNC_INTERVAL_MS);
    void this.load().then(now);
    return () => {
      offLocal();
      clearTimeout(debounce);
      clearInterval(interval);
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', visible);
    };
  }
}
