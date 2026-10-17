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
    ({ token } = await api.login(PASSWORD, 'Contract test'));
  });

  it('rejects a wrong password and an unknown token', async () => {
    expect(await errorKind(api.login('not the password', 'x'))).toBe('wrong-password');
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
    expect((await api.login(PASSWORD, 'x')).serverEmpty).toBe(false);
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
    const other = (await api.login(PASSWORD, 'Other')).token;
    await api.logout(token);
    expect(await errorKind(api.pull(token, 0))).toBe('signed-out');
    expect(await errorKind(api.pull(other, 0))).toBe('none');
    const third = (await api.login(PASSWORD, 'Third')).token;
    await api.logoutAll(third);
    expect(await errorKind(api.pull(other, 0))).toBe('signed-out');
    expect(await errorKind(api.pull(third, 0))).toBe('signed-out');
  });
});
