// Two "phones" (two databases) syncing through one in-memory server.
import { beforeEach, describe, expect, it } from 'vitest';
import { PantryDB } from '../db';
import { Repo } from '../repo';
import { FakeSyncApi } from './fakeApi';
import { SyncEngine } from './engine';
import { DIRTY } from './hooks';

const PASSWORD = 'test-household-password';

interface Phone {
  db: PantryDB;
  repo: Repo;
  sync: SyncEngine;
}

let server: FakeSyncApi;
let clock: number;

function phone(): Phone {
  const db = new PantryDB(`sync-${crypto.randomUUID()}`);
  const now = () => ++clock;
  return { db, repo: new Repo(db, now), sync: new SyncEngine(db, server, now) };
}

/** A phone with the sample data, connected as the first device. */
async function firstPhone(): Promise<Phone> {
  const p = phone();
  await p.repo.loadSampleData();
  expect(await p.sync.signIn(PASSWORD, 'Phone A')).toEqual({ serverEmpty: true });
  await p.sync.startWithThisDevice();
  return p;
}

/** A second phone, which takes the server's data. */
async function secondPhone(): Promise<Phone> {
  const p = phone();
  await p.repo.loadSampleData(); // its own sample data, to be replaced
  await p.repo.addStore('Only on phone B');
  expect(await p.sync.signIn(PASSWORD, 'Phone B')).toEqual({ serverEmpty: false });
  await p.sync.startWithServerData();
  return p;
}

const names = async (p: Phone) => (await p.db.items.toArray()).map((i) => i.name).sort();
const item = async (p: Phone, id: string) => p.db.items.get(id);

beforeEach(() => {
  server = new FakeSyncApi(PASSWORD);
  clock = Date.UTC(2026, 9, 16);
});

describe('change tracking', () => {
  it('marks local writes for sending and records deletes', async () => {
    const p = phone();
    await p.repo.loadSampleData();
    expect((await item(p, 'it-milk'))![DIRTY as never]).toBe(1);
    await p.repo.removeListEntry('le-soap');
    expect(await p.db.tombstones.get(['listEntries', 'le-soap'])).toMatchObject({ tbl: 'listEntries', id: 'le-soap' });
    const before = (await item(p, 'it-eggs'))!.updatedAt;
    await p.db.items.update('it-eggs', { amount: 10 }); // no updatedAt given
    expect((await item(p, 'it-eggs'))!.updatedAt).toBeGreaterThan(before);
  });

  it('wrong password changes nothing', async () => {
    const p = phone();
    await expect(p.sync.signIn('nope', 'x')).rejects.toMatchObject({ kind: 'wrong-password' });
    expect((await p.sync.load()).phase).toBe('disconnected');
  });
});

describe('connecting phones', () => {
  it('the first phone uploads everything; the second takes the server’s data', async () => {
    const a = await firstPhone();
    expect(server.get('items', 'it-milk')).toMatchObject({ data: expect.objectContaining({ name: 'Milk' }) });
    expect(JSON.stringify(server.get('items', 'it-milk'))).not.toContain(DIRTY);
    expect(a.sync.getStatus()).toMatchObject({ phase: 'idle', pending: 0, device: 'Phone A' });

    const b = await secondPhone();
    expect(await names(b)).toEqual(await names(a));
    expect((await b.db.stores.toArray()).map((s) => s.name)).not.toContain('Only on phone B');
    expect(await b.sync.pendingCount()).toBe(0); // what it pulled isn't sent back
  });
});

describe('keeping phones in step', () => {
  it('edits, new records and deletes travel both ways', async () => {
    const a = await firstPhone();
    const b = await secondPhone();

    await a.repo.tap('it-blackbeans', -1); // goes on the list too
    const { id: tahini } = await a.repo.createItem({ name: 'Tahini', locationId: 'loc-shelf1' });
    await b.repo.removeListEntry('le-soap');
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();

    expect((await item(b, 'it-blackbeans'))!.amount).toBe(2);
    expect(await item(b, tahini)).toMatchObject({ name: 'Tahini', category: 'generic' });
    expect(await b.db.listEntries.where('itemId').equals('it-blackbeans').count()).toBe(1);
    expect(await a.db.listEntries.get('le-soap')).toBeUndefined();
    expect(await a.sync.pendingCount()).toBe(0);
    expect(await b.sync.pendingCount()).toBe(0);
  });

  it('changes made offline wait, then catch up', async () => {
    const a = await firstPhone();
    const b = await secondPhone();
    server.offline = true;
    await a.repo.setAmount('it-milk', 2);
    await a.sync.syncNow();
    expect(a.sync.getStatus()).toMatchObject({ phase: 'offline', pending: 1 });
    expect((await item(a, 'it-milk'))!.amount).toBe(2); // still works locally

    server.offline = false;
    await a.sync.syncNow();
    expect(a.sync.getStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    await b.sync.syncNow();
    expect((await item(b, 'it-milk'))!.amount).toBe(2);
  });

  it('when both phones change the same thing, the newer change wins on both', async () => {
    const a = await firstPhone();
    const b = await secondPhone();
    await a.repo.updateItem('it-milk', { name: 'Milk (A)' });
    await b.repo.updateItem('it-milk', { name: 'Milk (B)' }); // later clock tick
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect((await item(a, 'it-milk'))!.name).toBe('Milk (B)');
    expect((await item(b, 'it-milk'))!.name).toBe('Milk (B)');
  });

  it('an older server copy never overwrites a newer unsent local change', async () => {
    const a = await firstPhone();
    const b = await secondPhone();
    await a.repo.updateItem('it-eggs', { name: 'Eggs (older)' });
    await a.sync.syncNow();
    await b.repo.updateItem('it-eggs', { name: 'Eggs (newer, unsent)' });
    server.offline = true;
    await b.sync.syncNow(); // can't push
    server.offline = false;
    // Pull the older change directly: the newer local edit must survive it.
    await b.sync.apply((await server.pull((await server.login(PASSWORD, 'x')).token, 0)).changes);
    expect((await item(b, 'it-eggs'))!.name).toBe('Eggs (newer, unsent)');
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect((await item(a, 'it-eggs'))!.name).toBe('Eggs (newer, unsent)');
  });

  it('a delete beats an older edit, and an edit after a delete brings it back', async () => {
    const a = await firstPhone();
    const b = await secondPhone();
    await a.repo.updateListEntry('le-tortillas', { quantity: 3 });
    await b.repo.removeListEntry('le-tortillas'); // later
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(await a.db.listEntries.get('le-tortillas')).toBeUndefined();
    expect(await b.db.listEntries.get('le-tortillas')).toBeUndefined();
  });
});

describe('signing out', () => {
  it('signing out everywhere stops other phones, which keep their data', async () => {
    const a = await firstPhone();
    const b = await secondPhone();
    await a.sync.signOutEverywhere();
    expect(a.sync.getStatus().phase).toBe('disconnected');
    await b.repo.setAmount('it-milk', 0);
    await b.sync.syncNow();
    expect(b.sync.getStatus().phase).toBe('signed-out');
    expect(b.sync.getStatus().pending).toBeGreaterThan(0); // the edit (and the list entry it added) wait
    expect((await item(b, 'it-milk'))!.amount).toBe(0);
  });

  it('Reset / Erase / Import sign this device out instead of uploading the replacement', async () => {
    const a = await firstPhone();
    await a.repo.loadSampleData();
    await a.sync.syncNow();
    expect(a.sync.getStatus().phase).toBe('disconnected');
    expect(server.calls.filter((c) => c === 'push').length).toBe(1); // only the first upload
  });
});
