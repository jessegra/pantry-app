// @vitest-environment node
// The sync server contract. Runs against the in-memory FakeSyncApi always, and
// against the real PHP server too when PANTRY_API_URL is set (CI's server job:
// PHP 8.4 + MySQL 5.7). Same cases, so the fake the engine tests use behaves
// like the real thing. Ids are unique per run because the real server's data persists.
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSyncApi, SyncError, type Change, type SyncApi } from './api';
import { FakeSyncApi } from './fakeApi';

declare const process: { env: Record<string, string | undefined> };

const PASSWORD = process.env.PANTRY_API_PASSWORD ?? 'test-household-password';
const apis: Array<[string, () => SyncApi]> = [['fake server', () => new FakeSyncApi(PASSWORD)]];
if (process.env.PANTRY_API_URL) apis.push(['PHP server', () => new HttpSyncApi(process.env.PANTRY_API_URL)]);

const uid = () => `t-${crypto.randomUUID()}`;
/** The first person, from the household password. The tests never rename them. */
const OWNER = 'Owner';
const somebody = () => `Kim ${crypto.randomUUID().slice(0, 6)}`;
const change = (
  id: string,
  updatedAt: number,
  data: Record<string, unknown> | null = { id, name: 'Milk' },
): Change => ({
  tbl: 'items',
  id,
  data,
  deleted: data === null,
  updatedAt,
});

async function errorKind(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'none';
  } catch (e) {
    return e instanceof SyncError ? e.kind : `unexpected: ${String(e)}`;
  }
}

/** The current end of the change stream, so a test only looks at its own changes. */
async function latestCursor(api: SyncApi, token: string): Promise<number> {
  let cursor = 0;
  for (;;) {
    const r = await api.pull(token, cursor);
    cursor = r.cursor;
    if (!r.more) return cursor;
  }
}

describe.each(apis)('sync contract: %s', (_name, make) => {
  let api: SyncApi;
  let token: string;

  beforeEach(async () => {
    api = make();
    ({ token } = await api.login(OWNER, PASSWORD, 'Contract test'));
  });

  it('rejects a wrong password and an unknown token', async () => {
    expect(await errorKind(api.login(OWNER, 'not the password', 'x'))).toBe('wrong-password');
    expect(await errorKind(api.pull('f'.repeat(64), 0))).toBe('signed-out');
  });

  it('push then pull returns the change with a new cursor; the server is no longer empty', async () => {
    const since = await latestCursor(api, token);
    const id = uid();
    expect(await api.push(token, [change(id, 1000, { id, name: 'Milk', amount: 1.5, nested: { a: [1, 2] } })])).toEqual(
      {
        accepted: 1,
        ignored: 0,
      },
    );
    const r = await api.pull(token, since);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      tbl: 'items',
      id,
      deleted: false,
      updatedAt: 1000,
      data: { id, name: 'Milk', amount: 1.5, nested: { a: [1, 2] } },
    });
    expect(r.cursor).toBeGreaterThan(since);
    expect(r.more).toBe(false);
    expect((await api.login(OWNER, PASSWORD, 'x')).serverEmpty).toBe(false);
  });

  it('newest change wins: older and repeated changes are ignored', async () => {
    const id = uid();
    await api.push(token, [change(id, 2000, { id, name: 'v2' })]);
    const since = await latestCursor(api, token);
    expect(await api.push(token, [change(id, 1000, { id, name: 'older' })])).toEqual({ accepted: 0, ignored: 1 });
    expect(await api.push(token, [change(id, 2000, { id, name: 'same time' })])).toEqual({ accepted: 0, ignored: 1 });
    expect((await api.pull(token, since)).changes).toEqual([]);
    expect(await api.push(token, [change(id, 3000, { id, name: 'v3' })])).toEqual({ accepted: 1, ignored: 0 });
    const r = await api.pull(token, since);
    expect(r.changes.map((c) => c.data)).toEqual([{ id, name: 'v3' }]);
  });

  it('deletes travel as tombstones', async () => {
    const id = uid();
    await api.push(token, [change(id, 1000)]);
    const since = await latestCursor(api, token);
    await api.push(token, [change(id, 2000, null)]);
    const r = await api.pull(token, since);
    expect(r.changes).toEqual([expect.objectContaining({ id, deleted: true, data: null, updatedAt: 2000 })]);
  });

  it('accepts recipes; refuses tables it does not sync', async () => {
    const id = uid();
    const recipe: Change = {
      tbl: 'recipes',
      id,
      data: { id, name: 'Waffles', ingredients: [{ id: 'i1', name: 'flour', match: 'item' }] },
      deleted: false,
      updatedAt: 1000,
    };
    expect(await api.push(token, [recipe])).toEqual({ accepted: 1, ignored: 0 });
    const bad = { ...recipe, tbl: 'activity' } as unknown as Change;
    expect(await errorKind(api.push(token, [bad]))).toBe('server');
  });

  it('pages through changes with limit and more', async () => {
    const since = await latestCursor(api, token);
    const ids = [uid(), uid(), uid(), uid(), uid()];
    await api.push(
      token,
      ids.map((id, i) => change(id, 1000 + i)),
    );
    const seen: string[] = [];
    let cursor = since;
    let pages = 0;
    for (;;) {
      const r = await api.pull(token, cursor, 2);
      seen.push(...r.changes.map((c) => c.id));
      cursor = r.cursor;
      pages++;
      if (!r.more) break;
    }
    expect(seen).toEqual(ids);
    expect(pages).toBe(3);
  });

  it('signing out ends that token only; signing out everywhere ends them all', async () => {
    const other = (await api.login(OWNER, PASSWORD, 'Other')).token;
    await api.logout(token);
    expect(await errorKind(api.pull(token, 0))).toBe('signed-out');
    expect(await errorKind(api.pull(other, 0))).toBe('none');
    const third = (await api.login(OWNER, PASSWORD, 'Third')).token;
    await api.logoutAll(third);
    expect(await errorKind(api.pull(other, 0))).toBe('signed-out');
    expect(await errorKind(api.pull(third, 0))).toBe('signed-out');
  });

  it('signing in says who you are; a name that matches no one falls back to the password', async () => {
    const a = await api.login(OWNER, PASSWORD, 'Named');
    expect(a.user).toEqual({ id: expect.any(String), name: OWNER });
    expect((await api.login('', PASSWORD, 'Unnamed')).user).toEqual(a.user);
    expect((await api.login('nobody by this name', PASSWORD, 'Old app')).user).toEqual(a.user);
    expect((await api.me(a.token)).user).toEqual(a.user);
  });

  it('an invite code makes a new person, once', async () => {
    const name = somebody();
    const invite = await api.invite(token, `  ${name} `);
    expect(invite).toMatchObject({ name, code: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/) });
    expect(invite.expiresAt).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    // The same name can't be invited twice, nor match someone who's already here.
    expect(await errorKind(api.invite(token, name.toUpperCase()))).toBe('server');
    expect(await errorKind(api.invite(token, OWNER))).toBe('server');
    // Too short a password is refused before the code is used.
    expect(await errorKind(api.join(invite.code, 'short', 'Phone'))).toBe('server');
    const joined = await api.join(invite.code.toLowerCase().replace('-', ' '), 'a-good-password', 'Kim’s phone');
    expect(joined.user.name).toBe(name);
    expect(await errorKind(api.join(invite.code, 'a-good-password', 'Again'))).toBe('wrong-code');
    // The new person shares the pantry and signs in with their own name and password.
    expect(await errorKind(api.pull(joined.token, 0))).toBe('none');
    expect((await api.login(name, 'a-good-password', 'Tablet')).user).toEqual(joined.user);
    expect(await errorKind(api.login(name, PASSWORD, 'Tablet'))).toBe('wrong-password');
    const { people } = await api.me(token);
    const kim = people.find((p) => p.id === joined.user.id)!;
    expect(kim.devices.map((d) => d.name).sort()).toEqual(['Kim’s phone', 'Tablet']);
    expect(people.find((p) => p.name === OWNER)).toBeTruthy();
  });

  it('anyone can rename, reset, sign out or remove someone else', async () => {
    const invite = await api.invite(token, somebody());
    const kim = await api.join(invite.code, 'first-password', 'Phone');
    const id = kim.user.id;
    const renamed = `${invite.name} R`;
    expect(await api.rename(kim.token, id, renamed)).toEqual({ id, name: renamed });
    expect(await errorKind(api.rename(kim.token, id, OWNER))).toBe('server');

    // A forgotten password: a new code from someone else; the old devices sign in again.
    const reset = await api.newCode(token, id);
    expect(reset.name).toBe(renamed);
    const again = await api.join(reset.code, 'second-password', 'Phone');
    expect(again.user).toEqual({ id, name: renamed });
    expect(await errorKind(api.pull(kim.token, 0))).toBe('signed-out');
    expect((await api.login(renamed, 'second-password', 'x')).user.id).toBe(id);

    await api.signOutPerson(token, id);
    expect(await errorKind(api.pull(again.token, 0))).toBe('signed-out');
    expect(await errorKind(api.pull(token, 0))).toBe('none');

    const back = await api.login(renamed, 'second-password', 'Phone');
    expect(await errorKind(api.removePerson(back.token, id))).toBe('server'); // not yourself
    await api.removePerson(token, id);
    expect(await errorKind(api.pull(back.token, 0))).toBe('signed-out');
    expect((await api.me(token)).people.some((p) => p.id === id)).toBe(false);
  });

  it('a sign-in code you make for yourself keeps your other devices signed in', async () => {
    const invite = await api.invite(token, somebody());
    const kim = await api.join(invite.code, 'first-password', 'Phone');
    const own = await api.newCode(kim.token, kim.user.id);
    const tablet = await api.join(own.code, 'second-password', 'Tablet');
    expect(tablet.user).toEqual(kim.user);
    expect(await errorKind(api.pull(kim.token, 0))).toBe('none'); // still signed in
    expect((await api.login(kim.user.name, 'second-password', 'x')).user.id).toBe(kim.user.id);
    await api.removePerson(token, kim.user.id);
  });
});
