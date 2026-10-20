// Settings → More → Sync → People, and "who did it" (docs/USERS_PLAN.md), against the fake server.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { PantryDB } from '../../data/db';
import { repo, Repo } from '../../data/repo';
import { getSync, setSync } from '../../data/sync';
import { SyncEngine } from '../../data/sync/engine';
import { FakeSyncApi } from '../../data/sync/fakeApi';
import { sheetClosed } from '../../test/helpers';

const PASSWORD = 'test-household-password';
let server: FakeSyncApi;
let engine: SyncEngine;

// A sign-in's catch-up sync runs on after the test; let it finish before the next test clears the database.
afterEach(() => getSync().idle());

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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const syncRegion = () => screen.findByRole('region', { name: 'Sync' });
const people = () => screen.getByRole('region', { name: 'People' });

/** This phone is the owner's, already connected. */
async function ownerConnected() {
  await engine.signIn('Owner', PASSWORD, 'Owner’s phone');
  await engine.startWithThisDevice();
}

/** Another phone, joined with an invite. */
async function kimJoins(code: string) {
  const db = new PantryDB(`kim-${crypto.randomUUID()}`);
  const kim = { repo: new Repo(db), sync: new SyncEngine(db, server) };
  await kim.repo.startEmpty();
  await kim.sync.join(code, 'kims-password', 'Kim’s phone');
  await kim.sync.startWithServerData();
  return kim;
}

describe('people', () => {
  it('invites someone with a one-time code, and they show up once joined', async () => {
    const user = userEvent.setup();
    await ownerConnected();
    renderAt('/settings/more');
    await syncRegion();
    expect(within(people()).getByRole('button', { name: 'Owner (you), manage' })).toBeInTheDocument();
    expect(within(people()).getByText(/You’re listed as “Owner”/)).toBeInTheDocument();

    await user.click(within(people()).getByRole('button', { name: 'Invite someone' }));
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Their name' }), 'Kim');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Get a code' }));
    const sheet = await screen.findByRole('dialog', { name: 'Invite code for Kim' });
    const code = within(sheet).getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).textContent!;
    expect(sheet).toHaveTextContent(`tap “I have a code”, enter ${code}`);
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await sheetClosed();

    await kimJoins(code);
    await user.click(within(await syncRegion()).getByRole('button', { name: 'Sync now' }));
    expect(await within(people()).findByRole('button', { name: 'Kim, manage' })).toHaveAccessibleDescription(
      /^Kim’s phone · seen just now$/,
    );
  });

  it('joins this phone with an invite code', async () => {
    const ownerDb = new PantryDB(`owner-${crypto.randomUUID()}`);
    await new Repo(ownerDb).loadSampleData();
    const owner = new SyncEngine(ownerDb, server);
    await owner.signIn('Owner', PASSWORD, 'Owner’s phone');
    await owner.startWithThisDevice();
    const { code } = await owner.invite('Kim');

    const user = userEvent.setup();
    renderAt('/settings/more');
    const region = await syncRegion();
    await user.click(within(region).getByRole('button', { name: 'I have a code' }));
    await user.type(within(region).getByRole('textbox', { name: 'Invite or sign-in code' }), code.toLowerCase());
    await user.type(within(region).getByLabelText('Choose a password'), 'short');
    expect(within(region).getByRole('button', { name: 'Join' })).toBeDisabled();
    await user.type(within(region).getByLabelText('Choose a password'), '-but-longer');
    await user.click(within(region).getByRole('button', { name: 'Join' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Use the pantry on the server?' })).getByRole('button', {
        name: 'Use the server’s',
      }),
    );
    expect(await within(region).findByText(/signed in as Kim$/)).toBeInTheDocument();
    // And Kim can sign in elsewhere with name and password.
    expect((await server.login('kim', 'short-but-longer', 'Tablet')).user.name).toBe('Kim');
  });

  it('a wrong or used code says so', async () => {
    const user = userEvent.setup();
    renderAt('/settings/more');
    const region = await syncRegion();
    await user.click(within(region).getByRole('button', { name: 'I have a code' }));
    await user.type(within(region).getByRole('textbox', { name: 'Invite or sign-in code' }), 'AAAA-BBBB');
    await user.type(within(region).getByLabelText('Choose a password'), 'a-good-password');
    await user.click(within(region).getByRole('button', { name: 'Join' }));
    expect(await within(region).findByRole('alert')).toHaveTextContent('That code isn’t right, or it has expired.');
  });

  it('renames, gives a new code, and removes someone', async () => {
    const user = userEvent.setup();
    await ownerConnected();
    await kimJoins((await engine.invite('Kim')).code);
    await engine.refreshPeople();
    renderAt('/settings/more');
    await syncRegion();

    await user.click(within(people()).getByRole('button', { name: 'Kim, manage' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Kim' })).getByRole('button', { name: 'Rename' }));
    const rename = screen.getByRole('dialog', { name: 'Rename Kim' });
    await user.clear(within(rename).getByRole('textbox', { name: 'Name' }));
    await user.type(within(rename).getByRole('textbox', { name: 'Name' }), 'Owner');
    await user.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await within(rename).findByRole('alert')).toHaveTextContent('Someone is already called Owner');
    await user.clear(within(rename).getByRole('textbox', { name: 'Name' }));
    await user.type(within(rename).getByRole('textbox', { name: 'Name' }), 'Kimberly');
    await user.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await within(people()).findByRole('button', { name: 'Kimberly, manage' })).toBeInTheDocument();

    await user.click(within(people()).getByRole('button', { name: 'Kimberly, manage' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Kimberly' })).getByRole('button', { name: 'New sign-in code' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Sign-in code for Kimberly' })).toHaveTextContent(
      'For a forgotten password.',
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await sheetClosed();

    await user.click(within(people()).getByRole('button', { name: 'Kimberly, manage' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Kimberly' })).getByRole('button', { name: 'Remove Kimberly' }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove Kimberly?' })).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() => expect(within(people()).queryByRole('button', { name: /Kimberly/ })).toBeNull());
  });

  it('you can’t remove yourself', async () => {
    const user = userEvent.setup();
    await ownerConnected();
    renderAt('/settings/more');
    await syncRegion();
    await user.click(within(people()).getByRole('button', { name: 'Owner (you), manage' }));
    const sheet = screen.getByRole('dialog', { name: 'Owner (you)' });
    expect(within(sheet).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Sign out all my devices' })).toBeInTheDocument();
  });

  it('gets a sign-in code for yourself, for another device', async () => {
    const user = userEvent.setup();
    await ownerConnected();
    renderAt('/settings/more');
    await syncRegion();
    await user.click(within(people()).getByRole('button', { name: 'Owner (you), manage' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Owner (you)' })).getByRole('button', { name: 'Get a sign-in code' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Your sign-in code' });
    expect(sheet).toHaveTextContent('This device stays signed in.');
    const code = within(sheet).getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).textContent!;
    // Used on another device: a new password, and this one is still signed in.
    const other = new SyncEngine(new PantryDB(`other-${crypto.randomUUID()}`), server);
    await other.join(code, 'a-brand-new-password', 'Phone app');
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('idle');
  });
});

describe('devices', () => {
  it('removes a stray device from the list; this device can’t be removed there', async () => {
    const user = userEvent.setup();
    await ownerConnected();
    await server.login('Owner', PASSWORD, 'Android phone');
    await engine.refreshPeople();
    renderAt('/settings/more');
    await syncRegion();
    await user.click(within(people()).getByRole('button', { name: 'Owner (you), manage' }));
    const sheet = screen.getByRole('dialog', { name: 'Owner (you)' });
    const devices = within(sheet).getByRole('list', { name: 'Devices' });
    expect(within(devices).getByText('Owner’s phone (this device)')).toBeInTheDocument();
    expect(within(devices).getAllByRole('button')).toHaveLength(1);
    await user.click(within(devices).getByRole('button', { name: /^Remove device Android phone/ }));
    await waitFor(() => expect(within(sheet).queryByText('Android phone')).toBeNull());
    expect(engine.getStatus().phase).toBe('idle');
  });
});

describe('who did it', () => {
  it('says who added a list entry and who last changed an item', async () => {
    await ownerConnected();
    const kim = await kimJoins((await engine.invite('Kim')).code);
    await kim.repo.addListEntry({ name: 'Paper towels' });
    await kim.repo.setAmount('it-eggs', 4);
    await kim.sync.syncNow();
    await engine.syncNow();

    renderAt('/list');
    expect(await screen.findByText('Added by Kim')).toBeInTheDocument();
    // Nothing for the owner's own entries.
    expect(screen.getAllByText(/^Added by/)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /^Paper towels/ }));
    expect(screen.getByRole('dialog', { name: 'Paper towels' })).toHaveAccessibleDescription('Added by Kim.');
  });

  it('item detail: changed by whom, and by you', async () => {
    await ownerConnected();
    const kim = await kimJoins((await engine.invite('Kim')).code);
    await kim.repo.setAmount('it-eggs', 4);
    await kim.sync.syncNow();
    await engine.syncNow();
    renderAt('/item/it-eggs');
    expect(await screen.findByText('Changed just now by Kim')).toBeInTheDocument();
    await repo.setAmount('it-eggs', 5);
    expect(await screen.findByText('Changed just now by you')).toBeInTheDocument();
  });

  it('says nothing while only one person syncs', async () => {
    await ownerConnected();
    await repo.addListEntry({ name: 'Paper towels' });
    renderAt('/item/it-milk');
    await screen.findByRole('heading', { level: 1, name: 'Milk' });
    expect(screen.queryByText(/^Changed/)).toBeNull();
  });
});
