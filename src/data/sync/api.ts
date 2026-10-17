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

export interface SyncApi {
  login(password: string, device: string): Promise<{ token: string; serverEmpty: boolean }>;
  push(token: string, changes: Change[]): Promise<{ accepted: number; ignored: number }>;
  pull(token: string, since: number, limit?: number): Promise<PullResult>;
  logout(token: string): Promise<void>;
  logoutAll(token: string): Promise<void>;
}

export type SyncErrorKind =
  | 'offline' // no connection, or the server couldn't be reached
  | 'wrong-password'
  | 'signed-out' // the device token is no longer valid (signed out elsewhere, password changed)
  | 'rate-limited'
  | 'not-configured' // the server has no sync configuration yet
  | 'server'; // anything else

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
    if (res.status === 401) throw new SyncError(path === '/login' ? 'wrong-password' : 'signed-out', message);
    if (res.status === 429) throw new SyncError('rate-limited', message);
    if (res.status === 503) throw new SyncError('not-configured', message);
    // A host's HTML error page or a proxy failure: treat like being offline, retry later.
    if (!json || res.status >= 502) throw new SyncError('offline', message);
    throw new SyncError('server', message);
  }

  login(password: string, device: string) {
    return this.call<{ token: string; serverEmpty: boolean }>('POST', '/login', undefined, { password, device });
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
