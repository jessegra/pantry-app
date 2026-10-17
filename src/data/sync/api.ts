// The sync server's API (server/api/index.php), and its errors.
import type { SyncedTable } from './hooks';

export interface Change {
  tbl: SyncedTable;
  id: string;
  /** The record (without local fields), or null for a delete. */
  data: Record<string, unknown> | null;
  deleted: boolean;
  updatedAt: number;
}

export interface ServerChange extends Change {
  seq: number;
}

export interface PullResult {
  changes: ServerChange[];
  /** Pass back as `since` next time. */
  cursor: number;
  more: boolean;
}

/** Someone who can sign in (docs/USERS_PLAN.md). Ids are the server's, as strings. */
export interface Person {
  id: string;
  name: string;
}

export interface PersonWithDevices extends Person {
  devices: Array<{ name: string; lastSeen: number }>;
}

export interface SignedIn {
  token: string;
  serverEmpty: boolean;
  user: Person;
}

/** A one-time code: to join (someone new), or to set a new password. Shown as ABCD-EFGH. */
export interface Code {
  name: string;
  code: string;
  expiresAt: number;
}

export interface SyncApi {
  /** A name that matches no one falls back to the password alone. */
  login(name: string, password: string, device: string): Promise<SignedIn>;
  /** Uses an invite or new-password code, setting this person's password. */
  join(code: string, password: string, device: string): Promise<SignedIn>;
  me(token: string): Promise<{ user: Person; people: PersonWithDevices[] }>;
  invite(token: string, name: string): Promise<Code>;
  newCode(token: string, userId: string): Promise<Code>;
  rename(token: string, userId: string, name: string): Promise<Person>;
  /** Every device of one person. */
  signOutPerson(token: string, userId: string): Promise<void>;
  /** Someone else, never yourself. */
  removePerson(token: string, userId: string): Promise<void>;
  push(token: string, changes: Change[]): Promise<{ accepted: number; ignored: number }>;
  pull(token: string, since: number, limit?: number): Promise<PullResult>;
  logout(token: string): Promise<void>;
  logoutAll(token: string): Promise<void>;
}

export type SyncErrorKind =
  | 'offline' // no connection, or the server couldn't be reached
  | 'wrong-password'
  | 'wrong-code' // an invite or new-password code that's wrong, used or expired
  | 'signed-out' // the device token is no longer valid (signed out elsewhere, password changed)
  | 'rate-limited'
  | 'not-configured' // the server has no sync configuration yet
  | 'server'; // anything else (the message says what: "Someone is already called Kim")

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Talks to the PHP API over HTTPS (same origin: /api). */
export class HttpSyncApi implements SyncApi {
  constructor(private readonly base = `${import.meta.env.BASE_URL}api`) {}

  private async call<T>(method: 'GET' | 'POST', path: string, token?: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(token && { 'X-Pantry-Token': token }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new SyncError('offline', 'Can’t reach the server');
    }
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (res.ok && json) return json;
    const message = json?.error ?? `Server error (${res.status})`;
    if (res.status === 401) {
      const kind = path === '/login' ? 'wrong-password' : path === '/join' ? 'wrong-code' : 'signed-out';
      throw new SyncError(kind, message);
    }
    if (res.status === 429) throw new SyncError('rate-limited', message);
    if (res.status === 503) throw new SyncError('not-configured', message);
    // A host's HTML error page or a proxy failure: treat like being offline, retry later.
    if (!json || res.status >= 502) throw new SyncError('offline', message);
    throw new SyncError('server', message);
  }

  login(name: string, password: string, device: string) {
    return this.call<SignedIn>('POST', '/login', undefined, { name, password, device });
  }

  join(code: string, password: string, device: string) {
    return this.call<SignedIn>('POST', '/join', undefined, { code, password, device });
  }

  me(token: string) {
    return this.call<{ user: Person; people: PersonWithDevices[] }>('GET', '/me', token);
  }

  invite(token: string, name: string) {
    return this.call<Code>('POST', '/invite', token, { name });
  }

  newCode(token: string, userId: string) {
    return this.call<Code>('POST', '/people/code', token, { userId });
  }

  rename(token: string, userId: string, name: string) {
    return this.call<Person>('POST', '/people/rename', token, { userId, name });
  }

  async signOutPerson(token: string, userId: string) {
    await this.call('POST', '/people/sign-out', token, { userId });
  }

  async removePerson(token: string, userId: string) {
    await this.call('POST', '/people/remove', token, { userId });
  }

  push(token: string, changes: Change[]) {
    return this.call<{ accepted: number; ignored: number }>('POST', '/push', token, { changes });
  }

  pull(token: string, since: number, limit = 1000) {
    return this.call<PullResult>('GET', `/pull?since=${since}&limit=${limit}`, token);
  }

  async logout(token: string) {
    await this.call('POST', '/logout', token, {});
  }

  async logoutAll(token: string) {
    await this.call('POST', '/logout-all', token, {});
  }
}
