// Settings → More → Sync, against the in-memory fake server.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { PantryDB } from '../../data/db';
import { repo, Repo } from '../../data/repo';
import { setSync } from '../../data/sync';
import { SyncEngine } from '../../data/sync/engine';
import { FakeSyncApi } from '../../data/sync/fakeApi';
import { sheetClosed } from '../../test/helpers';

const PASSWORD = 'test-household-password';
let server: FakeSyncApi;
let engine: SyncEngine;

beforeEach(async () => {
  localStorage.clear();
  resetNagSession();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
  server = new FakeSyncApi(PASSWORD);
  engine = new SyncEngine(repo.db, server);
  setSync(engine);
  await engine.load();
});

const renderMore = async () => {
  render(
    <MemoryRouter initialEntries={['/settings/more']}>
      <App />
    </MemoryRouter>,
  );
  return screen.findByRole('region', { name: 'Sync' });
};

async function connect(password = PASSWORD) {
  const region = await renderMore();
  await userEvent.type(within(region).getByLabelText('Your name'), 'Owner');
  await userEvent.type(within(region).getByLabelText('Password'), password);
  const name = within(region).getByLabelText('Name for this device');
  await userEvent.clear(name);
  await userEvent.type(name, 'Test phone');
  await userEvent.click(within(region).getByRole('button', { name: 'Connect' }));
  return region;
}

/** Another phone already put a pantry on the server. */
async function otherPhoneUploads() {
  const db = new PantryDB(`other-${crypto.randomUUID()}`);
  const other = new Repo(db);
  await other.startEmpty();
  await other.createItem({ name: 'Saffron', locationId: null });
  const e = new SyncEngine(db, server);
  await e.signIn('Owner', PASSWORD, 'Other phone');
  await e.startWithThisDevice();
}

describe('sync settings', () => {
  it('connects the first phone: uploads this pantry after confirming', async () => {
    const region = await connect();
    const sheet = await screen.findByRole('dialog', { name: 'Upload this pantry?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Upload' }));
    await sheetClosed();
    expect(await within(region).findByText('Synced just now')).toBeInTheDocument();
    expect(within(region).getByText('This device: Test phone · signed in as Owner')).toBeInTheDocument();
    expect(server.get('items', 'it-milk')).toBeDefined();
  });

  it('says plainly when the password is wrong', async () => {
    const region = await connect('nope');
    expect(await within(region).findByRole('alert')).toHaveTextContent('That name and password don’t match.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a later phone takes the server’s pantry, offering a backup first', async () => {
    await otherPhoneUploads();
    await connect();
    const sheet = await screen.findByRole('dialog', { name: 'Use the pantry on the server?' });
    expect(within(sheet).getByRole('button', { name: 'Export a backup first' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Use the server’s' }));
    await sheetClosed();
    await waitFor(async () => expect((await repo.db.items.toArray()).map((i) => i.name)).toEqual(['Saffron']));
  });

  it('cancelling the choice leaves this phone as it was', async () => {
    await otherPhoneUploads();
    const region = await connect();
    const sheet = await screen.findByRole('dialog', { name: 'Use the pantry on the server?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    await sheetClosed();
    expect(within(region).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(await repo.db.items.count()).toBe(11);
  });

  it('shows waiting changes while offline', async () => {
    const region = await connect();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Upload' }));
    await within(region).findByText('Synced just now');
    server.offline = true;
    await repo.setAmount('it-milk', 2);
    await userEvent.click(within(region).getByRole('button', { name: 'Sync now' }));
    expect(await within(region).findByText('Offline · 1 change waiting')).toBeInTheDocument();
  });

  it('signs out after confirming; the data stays', async () => {
    const region = await connect();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Upload' }));
    await within(region).findByText('Synced just now');
    await userEvent.click(within(region).getByRole('button', { name: 'Sign out' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Sign out of sync?' })).getByRole('button', { name: 'Sign out' }),
    );
    expect(await within(region).findByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(await repo.db.items.count()).toBe(11);
  });

  it('signed out elsewhere: a dot on Settings, then Sign in again resumes', async () => {
    const region = await connect();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Upload' }));
    await within(region).findByText('Synced just now');
    await server.logoutAll((await server.login('Owner', PASSWORD, 'x')).token);
    await repo.setAmount('it-milk', 0);
    await engine.syncNow();
    expect(await screen.findByRole('link', { name: 'Settings, sync needs attention' })).toBeInTheDocument();
    expect(within(region).getByText(/This device was signed out/)).toBeInTheDocument();
    expect(within(region).queryByLabelText('Name for this device')).toBeNull();
    await userEvent.type(within(region).getByLabelText('Password'), PASSWORD);
    await userEvent.click(within(region).getByRole('button', { name: 'Sign in again' }));
    expect(await within(region).findByText('Synced just now')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull(); // resumed, no "which pantry?" question
    expect(server.get('items', 'it-milk')!.data).toMatchObject({ amount: 0 });
  });

  it('Reset while connected signs this phone out instead of replacing the shared copy', async () => {
    const region = await connect();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Upload' }));
    await within(region).findByText('Synced just now');
    await repo.updateItem('it-milk', { name: 'Oat milk' });
    await engine.syncNow();
    await userEvent.click(screen.getByRole('button', { name: 'Reset to sample data' }));
    const sheet = screen.getByRole('dialog', { name: 'Reset to sample data?' });
    expect(sheet).toHaveTextContent('This device will also stop syncing');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Reset' }));
    expect(await within(region).findByRole('button', { name: 'Connect' })).toBeInTheDocument();
    await engine.syncNow();
    expect(server.get('items', 'it-milk')!.data).toMatchObject({ name: 'Oat milk' }); // untouched
  });
});
