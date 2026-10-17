// An in-memory sync server with the same rules as server/api (newest change wins,
// repeats ignored, sequence numbers for pulling; people, invites and codes).
// For tests and local development. The contract tests run the same cases against
// this and the real PHP server.
import {
  SyncError,
  type Change,
  type Code,
  type Person,
  type PullResult,
  type ServerChange,
  type SignedIn,
  type SyncApi,
} from './api';
import { SYNCED_TABLES } from './hooks';

const DAY = 24 * 3600 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const codeKey = (s: string) => s.replace(/[^0-9a-z]/gi, '').toUpperCase();

interface User extends Person {
  password: string;
}
interface Device {
  userId: string;
  name: string;
  lastSeen: number;
}
interface Invite {
  name?: string;
  userId?: string;
  expiresAt: number;
}

export class FakeSyncApi implements SyncApi {
  private records = new Map<string, ServerChange>();
  private seq = 0;
  private devices = new Map<string, Device>();
  private users: User[];
  private invites = new Map<string, Invite>();
  private nextUserId = 2;
  /** Flip to simulate losing the connection. */
  offline = false;
  /** Every call, for assertions. */
  readonly calls: string[] = [];

  constructor(
    password = 'test-household-password',
    private readonly now: () => number = Date.now,
  ) {
    // The first person, from the household password (like the server's config).
    this.users = [{ id: '1', name: 'Owner', password }];
  }

  private guard(name: string, token?: string): Device | undefined {
    this.calls.push(name);
    if (this.offline) throw new SyncError('offline', 'Can’t reach the server');
    if (token === undefined) return undefined;
    const d = this.devices.get(token);
    if (!d || !this.users.some((u) => u.id === d.userId)) throw new SyncError('signed-out', 'Not signed in');
    return d;
  }

  private issue(user: User, device: string): SignedIn {
    const token = crypto.randomUUID().replace(/-/g, '').padEnd(64, '0');
    this.devices.set(token, { userId: user.id, name: device.trim() || 'Device', lastSeen: this.now() });
    const serverEmpty = ![...this.records.values()].some((r) => !r.deleted);
    return { token, serverEmpty, user: { id: user.id, name: user.name } };
  }

  private person(id: string): User {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new SyncError('server', 'No such person');
    return u;
  }

  private nameTaken(name: string, except?: string) {
    const k = nameKey(name);
    if (this.users.some((u) => u.id !== except && nameKey(u.name) === k)) return true;
    return [...this.invites.values()].some((i) => i.name && i.expiresAt > this.now() && nameKey(i.name) === k);
  }

  private cleanName(name: string) {
    const n = name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!n) throw new SyncError('server', 'A name is needed');
    return n;
  }

  private storeCode(invite: Invite): Code & { key: string } {
    let raw = '';
    for (let i = 0; i < 8; i++) raw += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (invite.userId) for (const [k, i] of this.invites) if (i.userId === invite.userId) this.invites.delete(k);
    this.invites.set(raw, invite);
    const name = invite.name ?? this.person(invite.userId!).name;
    return { name, code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: invite.expiresAt, key: raw };
  }

  async login(name: string, password: string, device: string) {
    this.guard('login');
    const named = this.users.filter((u) => nameKey(u.name) === nameKey(name));
    const user = (named.length ? named : this.users).find((u) => u.password === password);
    if (!password || !user) throw new SyncError('wrong-password', 'Wrong name or password');
    return this.issue(user, device);
  }

  async join(code: string, password: string, device: string) {
    this.guard('join');
    if (password.length < 8) throw new SyncError('server', 'Choose a password of at least 8 characters');
    const key = codeKey(code);
    const invite = this.invites.get(key);
    if (!invite || invite.expiresAt <= this.now())
      throw new SyncError('wrong-code', 'That code isn’t right, or it has expired');
    this.invites.delete(key);
    if (invite.userId) {
      const user = this.person(invite.userId);
      user.password = password;
      for (const [t, d] of this.devices) if (d.userId === user.id) this.devices.delete(t);
      return this.issue(user, device);
    }
    let name = invite.name!;
    if (this.nameTaken(name)) name += ' 2';
    const user: User = { id: String(this.nextUserId++), name, password };
    this.users.push(user);
    return this.issue(user, device);
  }

  async me(token: string) {
    const d = this.guard('me', token)!;
    const devices = [...this.devices.values()].sort((a, b) => b.lastSeen - a.lastSeen);
    const { id, name } = this.person(d.userId);
    return {
      user: { id, name },
      people: this.users.map((u) => ({
        id: u.id,
        name: u.name,
        devices: devices.filter((x) => x.userId === u.id).map((x) => ({ name: x.name, lastSeen: x.lastSeen })),
      })),
    };
  }

  async invite(token: string, name: string) {
    this.guard('invite', token);
    const n = this.cleanName(name);
    if (this.nameTaken(n)) throw new SyncError('server', `Someone is already called ${n}`);
    const { key: _key, ...code } = this.storeCode({ name: n, expiresAt: this.now() + DAY });
    void _key;
    return code;
  }

  async newCode(token: string, userId: string) {
    this.guard('newCode', token);
    this.person(userId);
    const { key: _key, ...code } = this.storeCode({ userId, expiresAt: this.now() + DAY });
    void _key;
    return code;
  }

  async rename(token: string, userId: string, name: string) {
    this.guard('rename', token);
    const user = this.person(userId);
    const n = this.cleanName(name);
    if (this.nameTaken(n, userId)) throw new SyncError('server', `Someone is already called ${n}`);
    user.name = n;
    return { id: user.id, name: n };
  }

  async signOutPerson(token: string, userId: string) {
    this.guard('signOutPerson', token);
    this.person(userId);
    for (const [t, d] of this.devices) if (d.userId === userId) this.devices.delete(t);
    for (const [k, i] of this.invites) if (i.userId === userId) this.invites.delete(k);
  }

  async removePerson(token: string, userId: string) {
    const me = this.guard('removePerson', token)!;
    this.person(userId);
    if (userId === me.userId) throw new SyncError('server', 'You can’t remove yourself. Someone else can.');
    for (const [t, d] of this.devices) if (d.userId === userId) this.devices.delete(t);
    for (const [k, i] of this.invites) if (i.userId === userId) this.invites.delete(k);
    this.users = this.users.filter((u) => u.id !== userId);
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
    this.devices.delete(token);
  }

  async logoutAll(token: string) {
    this.guard('logoutAll', token);
    this.devices.clear();
  }

  /** Test helper: what the server holds for a record. */
  get(tbl: string, id: string) {
    return this.records.get(`${tbl}/${id}`);
  }
}
