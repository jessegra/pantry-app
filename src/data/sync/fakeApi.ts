// An in-memory sync server with the same rules as server/api (newest change wins,
// repeats ignored, sequence numbers for pulling). For tests and local development.
// The contract tests run the same cases against this and the real PHP server.
import { SyncError, type Change, type PullResult, type ServerChange, type SyncApi } from './api';
import { SYNCED_TABLES } from './hooks';

export class FakeSyncApi implements SyncApi {
  private records = new Map<string, ServerChange>();
  private seq = 0;
  private tokens = new Set<string>();
  /** Flip to simulate losing the connection. */
  offline = false;
  /** Every call, for assertions. */
  readonly calls: string[] = [];

  constructor(private readonly password = 'test-household-password') {}

  private guard(name: string, token?: string) {
    this.calls.push(name);
    if (this.offline) throw new SyncError('offline', 'Can’t reach the server');
    if (token !== undefined && !this.tokens.has(token)) throw new SyncError('signed-out', 'Not signed in');
  }

  async login(password: string, _device: string) {
    this.guard('login');
    void _device;
    if (password !== this.password) throw new SyncError('wrong-password', 'Wrong password');
    const token = crypto.randomUUID().replace(/-/g, '').padEnd(64, '0');
    this.tokens.add(token);
    const serverEmpty = ![...this.records.values()].some((r) => !r.deleted);
    return { token, serverEmpty };
  }

  async push(token: string, changes: Change[]) {
    this.guard('push', token);
    // Like the PHP server: an unknown table rejects the whole batch.
    if (changes.some((c) => !(SYNCED_TABLES as readonly string[]).includes(c.tbl)))
      throw new SyncError('server', 'Unknown table');
    let accepted = 0;
    for (const c of changes) {
      const key = `${c.tbl}/${c.id}`;
      const current = this.records.get(key);
      if (current && current.updatedAt >= c.updatedAt) continue;
      this.records.set(key, {
        ...c,
        data: c.deleted ? null : structuredClone(c.data),
        seq: ++this.seq,
      });
      accepted++;
    }
    return { accepted, ignored: changes.length - accepted };
  }

  async pull(token: string, since: number, limit = 1000): Promise<PullResult> {
    this.guard('pull', token);
    const after = [...this.records.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const changes = after.slice(0, limit).map((r) => structuredClone(r));
    return { changes, cursor: changes.at(-1)?.seq ?? since, more: after.length > limit };
  }

  async logout(token: string) {
    this.guard('logout', token);
    this.tokens.delete(token);
  }

  async logoutAll(token: string) {
    this.guard('logoutAll', token);
    this.tokens.clear();
  }

  /** Test helper: what the server holds for a record. */
  get(tbl: string, id: string) {
    return this.records.get(`${tbl}/${id}`);
  }
}
