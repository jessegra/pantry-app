import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { repo } from '../../data/repo';
import { sheetClosed } from '../../test/helpers';

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

const fieldRow = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const dialog = () => screen.getByRole('dialog');

function tapAt(el: HTMLElement, fraction: number) {
  el.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
  const opts = { pointerId: 1, isPrimary: true, clientX: 200 * fraction, clientY: 20 };
  fireEvent.pointerDown(el, opts);
  fireEvent.pointerUp(el, opts);
}

describe('item detail', () => {
  it('shows a configured item like DetailFull', async () => {
    renderAt('/item/it-blackbeans');
    expect(await screen.findByRole('heading', { level: 1, name: 'Black beans' })).toBeInTheDocument();
    expect(screen.getByText('Canned goods')).toBeInTheDocument();
    expect(screen.getByText('3 cans')).toBeInTheDocument();
    expect(screen.getByText('of 8 cans')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Black beans' })).toHaveAttribute('aria-valuetext', '3 cans of 8');
    expect(fieldRow('Unit')).toHaveTextContent('can');
    expect(fieldRow('Package size')).toHaveTextContent('1 can = 8 oz');
    expect(fieldRow('Par')).toHaveTextContent('8 cans');
    expect(fieldRow('Low threshold')).toHaveTextContent('2 cansdefault');
    expect(fieldRow('Location')).toHaveTextContent('Pantry · Shelf 1');
    expect(fieldRow('Preferred store')).toHaveTextContent('Costco');
    expect(fieldRow('Secondary store')).toHaveTextContent("Trader Joe's");
    const leftover = screen.getByRole('link', { name: /Black beans, opened/ });
    expect(leftover).toHaveAttribute('href', '/item/it-blackbeans-open');
    expect(leftover).toHaveTextContent('4 oz');
    expect(screen.getByRole('button', { name: 'Open one' })).toBeInTheDocument();
  });

  it('a half-configured item offers set-up, then gets a bar', async () => {
    renderAt('/item/it-rice');
    expect(await screen.findByText('Not tracked yet')).toBeInTheDocument();
    expect(fieldRow('Par')).toHaveTextContent('Add');
    expect(screen.queryByRole('button', { name: 'Open one' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set unit & par' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'bag' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More par (a full stock)' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'More par (a full stock)' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByText('of 2 bags')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Rice' })).toHaveAttribute('aria-valuetext', '2 bags of 2'); // starts full, so not listed yet
    expect(await repo.db.listEntries.where('itemId').equals('it-rice').count()).toBe(0);
  });

  it('edits a field through its sheet', async () => {
    renderAt('/item/it-blackbeans');
    await userEvent.click(await screen.findByRole('button', { name: /^Par/ }));
    const par = within(dialog()).getByRole('textbox', { name: 'Par' });
    await userEvent.clear(par);
    await userEvent.type(par, '10');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByText('of 10 cans')).toBeInTheDocument();
  });

  it('changing the category confirms it', async () => {
    renderAt('/item/it-blackbeans');
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Produce' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByText('Produce')).toBeInTheDocument();
    expect((await repo.db.items.get('it-blackbeans'))!.categoryConfirmed).toBe(true);
  });

  it('open one creates a leftover and opens it', async () => {
    renderAt('/item/it-blackbeans');
    await userEvent.click(await screen.findByRole('button', { name: 'Open one' }));
    expect(within(dialog()).getByText('Black beans goes from 3 cans to 2 cans')).toBeInTheDocument();
    expect(within(dialog()).getByRole('radio', { name: 'oz' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog()).getByRole('radio', { name: 'Refrigerator' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Create leftover' }));
    await sheetClosed();
    expect(await screen.findByText('Opened from')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Black beans, opened');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '8 oz of 8');
    expect(screen.queryByRole('button', { name: 'Open one' })).toBeNull(); // not on leftovers
    expect(screen.queryByRole('button', { name: /^Preferred store/ })).toBeNull();
    expect((await repo.db.items.get('it-blackbeans'))!.amount).toBe(2);
  });

  it('archives and restores', async () => {
    renderAt('/item/it-chicken');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive item' }));
    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(await repo.db.listEntries.where('itemId').equals('it-chicken').count()).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('button', { name: 'Archive item' })).toBeInTheDocument();
    expect(await repo.db.listEntries.where('itemId').equals('it-chicken').count()).toBe(1);
  });
});

describe('the nag', () => {
  it('asks where to buy an item that hits the list with no store; picking one moves it', async () => {
    await repo.updateItem('it-butter', { preferredStoreId: undefined });
    renderAt('/');
    tapAt(await screen.findByRole('slider', { name: 'Butter' }), 0.1);
    expect(await screen.findByRole('dialog', { name: 'Where do you buy Butter?' })).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Costco' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    const [entry] = await repo.db.listEntries.where('itemId').equals('it-butter').toArray();
    expect(entry.storeId).toBe('st-costco');
    expect((await repo.db.items.get('it-butter'))!.preferredStoreId).toBe('st-costco');
  });

  it('asks once per item per session, and Skip leaves it Unassigned', async () => {
    await repo.updateItem('it-butter', { preferredStoreId: undefined });
    renderAt('/');
    const bar = await screen.findByRole('slider', { name: 'Butter' });
    tapAt(bar, 0.1);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    tapAt(bar, 0.9);
    tapAt(bar, 0.9);
    await new Promise((r) => setTimeout(r, 400)); // let the debounced writes land
    tapAt(bar, 0.1);
    tapAt(bar, 0.1);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('dialog')).toBeNull();
    const [entry] = await repo.db.listEntries.where('itemId').equals('it-butter').toArray();
    expect(entry.storeId).toBeNull();
  });
});
