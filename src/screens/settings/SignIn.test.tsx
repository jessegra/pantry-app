// The sign-in form: seeing what you typed, and what to do about a forgotten password.
import { act, render, screen, within } from '@testing-library/react';
import { getSync } from '../../data/sync';
import type { SignInStep } from '../../data/sync/engine';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { repo } from '../../data/repo';
import { setSync } from '../../data/sync';
import { SyncEngine } from '../../data/sync/engine';
import { FakeSyncApi } from '../../data/sync/fakeApi';

beforeEach(async () => {
  localStorage.clear();
  resetNagSession();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
  const engine = new SyncEngine(repo.db, new FakeSyncApi('test-household-password'));
  setSync(engine);
  await engine.load();
});

const syncRegion = async () => {
  render(
    <MemoryRouter initialEntries={['/settings/more']}>
      <App />
    </MemoryRouter>,
  );
  return screen.findByRole('region', { name: 'Sync' });
};

describe('sign-in form', () => {
  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    const region = await syncRegion();
    const field = within(region).getByLabelText('Password');
    await user.type(field, 'secret words');
    expect(field).toHaveAttribute('type', 'password');
    const toggle = within(region).getByRole('button', { name: 'Show password' });
    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'password');
    // The code form's new password has one too.
    await user.click(within(region).getByRole('button', { name: 'I have a code' }));
    expect(within(region).getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('explains a forgotten password', async () => {
    const user = userEvent.setup();
    const region = await syncRegion();
    const forgot = within(region).getByRole('button', { name: 'Forgot your password?' });
    expect(forgot).toHaveAttribute('aria-expanded', 'false');
    await user.click(forgot);
    expect(within(region).getByText(/Still signed in on another device\?/)).toBeInTheDocument();
    expect(within(region).getByText(/tap Get a sign-in code/)).toBeInTheDocument();
  });

  it('shows each step, and says where it got stuck instead of spinning for ever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // The server answers, then saving on this phone never finishes.
      getSync().signIn = (_n: string, _p: string, _d: string, onStep?: (s: SignInStep) => void) => {
        onStep?.('server');
        onStep?.('saving');
        return new Promise(() => {});
      };
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const region = await syncRegion();
      await user.type(within(region).getByLabelText('Your name'), 'Owner');
      await user.type(within(region).getByLabelText('Password'), 'whatever');
      await user.click(within(region).getByRole('button', { name: 'Connect' }));
      expect(await within(region).findByRole('button', { name: 'Saving on this phone…' })).toBeDisabled();
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(await within(region).findByRole('alert')).toHaveTextContent('saving on this phone is stuck');
      expect(within(region).getByRole('button', { name: 'Connect' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
