// The HTTP client's time limit: a request that never answers becomes "offline".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSyncApi, SyncError } from './api';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HttpSyncApi', () => {
  it('gives up on a request that hangs, as offline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const api = new HttpSyncApi('/api', 20_000);
    const login = api.login('Owner', 'pw', 'Phone').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const e = await login;
    expect(e).toBeInstanceOf(SyncError);
    expect(e).toMatchObject({ kind: 'offline', message: 'The server took too long to answer' });
  });

  it('a quick answer is unaffected', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(new HttpSyncApi('/api', 50).me('t')).resolves.toEqual({ ok: true });
  });
});
