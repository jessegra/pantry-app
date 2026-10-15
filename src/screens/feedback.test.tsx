// Owner feedback after M8: no dead ends on a blank pantry, details at creation,
// permanent delete of archived items, reset data, build info.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { resetNagSession } from '../app/nag';
import { repo } from '../data/repo';
import { sheetClosed } from '../test/helpers';

beforeEach(async () => {
  localStorage.clear();
  resetNagSession();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const newItemSheet = async (name: string) => {
  const box = await screen.findByRole('searchbox', { name: 'Find or create an item' });
  await userEvent.type(box, `${name}{Enter}`);
  return screen.findByRole('dialog', { name: 'New item' });
};

describe('creating items from a blank pantry', () => {
  beforeEach(() => repo.startEmpty());

  it('defaults to Unassigned when there are no locations, and the item shows up', async () => {
    renderAt('/add');
    const sheet = await newItemSheet('rice');
    expect(within(sheet).getByRole('radio', { name: 'Unassigned' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add & done' }));
    expect(await screen.findByRole('button', { name: 'Unassigned, 1 item' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rice' })).toBeInTheDocument();
  });

  it('can create a new location right in the sheet', async () => {
    renderAt('/add');
    const sheet = await newItemSheet('milk');
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'New location name' }), 'Fridge{Enter}');
    expect(await within(sheet).findByRole('radio', { name: 'Fridge' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('dialog', { name: 'New item' })).toBeInTheDocument(); // Enter didn't submit the item
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add & done' }));
    expect(await screen.findByRole('button', { name: 'Fridge, 1 item' })).toBeInTheDocument();
  });
});

describe('creating an item with all its details', () => {
  it('sets unit, par, on hand and store in one go', async () => {
    renderAt('/add');
    const sheet = await newItemSheet('oat milk');
    await userEvent.click(within(sheet).getByRole('button', { name: /Add unit, par and store now/ }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'carton' }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Par (a full stock)' }), '4');
    const onHand = within(sheet).getByRole('textbox', { name: 'On hand now' });
    await userEvent.clear(onHand);
    await userEvent.type(onHand, '1');
    await userEvent.click(within(sheet).getByRole('radio', { name: "Trader Joe's" }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add & done' }));
    await sheetClosed();
    const item = (await repo.db.items.toArray()).find((i) => i.name === 'Oat milk')!;
    expect(item).toMatchObject({ unit: 'carton', par: 4, amount: 1, preferredStoreId: 'st-tj' });
    // 1 of 4 is low, so it went straight on the list at Trader Joe's: no nag needed.
    const [entry] = await repo.db.listEntries.where('itemId').equals(item.id).toArray();
    expect(entry).toMatchObject({ storeId: 'st-tj', quantity: 3, source: 'auto' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('deleting archived items', () => {
  it('from the item screen', async () => {
    await repo.archiveItem('it-peas');
    renderAt('/item/it-peas');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    const sheet = screen.getByRole('dialog', { name: 'Delete Frozen peas for good?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('searchbox', { name: 'Search pantry' })).toBeInTheDocument();
    expect(await repo.db.items.get('it-peas')).toBeUndefined();
  });

  it('from Settings → More', async () => {
    await repo.archiveItem('it-peas');
    renderAt('/settings/more');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Frozen peas permanently' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Nothing archived.')).toBeInTheDocument();
  });
});

describe('reset data and build info', () => {
  it('erases everything, then resets to the sample data', async () => {
    renderAt('/settings/more');
    await userEvent.click(await screen.findByRole('button', { name: 'Erase everything' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Erase everything?' })).getByRole('button', { name: 'Erase' }));
    await sheetClosed();
    await waitFor(async () => expect(await repo.db.items.count()).toBe(0));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to sample data' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset' }));
    await sheetClosed();
    await waitFor(async () => expect(await repo.db.items.count()).toBe(11));
  });

  it('shows the build so a phone can tell which version it has', async () => {
    renderAt('/settings/more');
    expect(await screen.findByText(/^Version \d+\.\d+\.\d+ · build \w+ · /)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('Updates aren’t available in this browser.')).toBeInTheDocument();
  });
});
