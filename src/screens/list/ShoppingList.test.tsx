import { render, screen, waitFor, within } from '@testing-library/react';
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

const renderList = async () => {
  render(
    <MemoryRouter initialEntries={['/list']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: 'Costco' });
};

const group = (name: string) => screen.getByRole('region', { name });
const rowNames = (name: string) =>
  within(group(name))
    .getAllByRole('checkbox')
    .map((c) => c.getAttribute('aria-label')!.replace(/^(Check off|Uncheck) /, ''));

describe('shopping list', () => {
  it('groups by store in order, Unassigned last, with counts and auto styling', async () => {
    await renderList();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Costco',
      'Fred Meyer',
      "Trader Joe's",
      'Unassigned',
    ]);
    expect(within(group('Costco')).getByText('1 to get')).toBeInTheDocument();
    expect(within(group('Fred Meyer')).getByText('0 to get')).toBeInTheDocument();
    expect(within(group('Costco')).getByText(/Auto · low, back to 4 lb/)).toBeInTheDocument();
    expect(within(group('Costco')).getByText('3 lb')).toBeInTheDocument();
    expect(within(group("Trader Joe's")).queryAllByText(/^Auto/)).toHaveLength(1); // Tortillas is manual
    expect(screen.getByRole('checkbox', { name: 'Uncheck Lemons' })).toHaveAttribute('aria-checked', 'true');
  });

  it('checking an item greys it out and drops it to the bottom of its store', async () => {
    await renderList();
    expect(rowNames("Trader Joe's")).toEqual(['Coffee beans', 'Tortillas']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Check off Coffee beans' }));
    expect(await screen.findByRole('checkbox', { name: 'Uncheck Coffee beans' })).toBeInTheDocument();
    expect(rowNames("Trader Joe's")).toEqual(['Tortillas', 'Coffee beans']);
    expect(await screen.findByRole('link', { name: 'List, 3 to get' })).toBeInTheDocument();
  });

  it('moves an item to its secondary store', async () => {
    await renderList();
    await userEvent.click(within(group('Costco')).getByRole('button', { name: 'Move to Fred Meyer' }));
    expect(await within(group('Fred Meyer')).findByText('Chicken thighs')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Costco' })).toBeNull(); // empty groups disappear
    expect(within(group('Fred Meyer')).getByRole('button', { name: 'Move to Costco' })).toBeInTheDocument();
  });

  it('adds a manual entry, reading the quantity', async () => {
    await renderList();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to list' }), '2 lb ground beef{Enter}');
    expect(await within(group('Unassigned')).findByText('Ground beef')).toBeInTheDocument();
    expect(within(group('Unassigned')).getByText('2 lb')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add to list' })).toHaveValue('');
  });

  it('offers a matching pantry item; a not-set-up one asks for unit, par and store', async () => {
    await renderList();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to list' }), 'ric');
    await userEvent.click(screen.getByRole('button', { name: 'Add Rice' }));
    const nag = await screen.findByRole('dialog', { name: 'Set up Rice' });
    expect(within(nag).getByRole('radiogroup', { name: 'Unit' })).toBeInTheDocument();
    expect(within(nag).getByRole('textbox', { name: 'Par (a full stock)' })).toBeInTheDocument();
    expect(within(nag).getByRole('radiogroup', { name: 'Preferred store' })).toBeInTheDocument();
    await userEvent.click(within(nag).getByRole('radio', { name: 'bag' }));
    await userEvent.type(within(nag).getByRole('textbox', { name: 'Par (a full stock)' }), '2');
    await userEvent.click(within(nag).getByRole('radio', { name: 'Costco' }));
    await userEvent.click(within(nag).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    // Picking the store moved the entry out of Unassigned.
    expect(await within(group('Costco')).findByText('Rice')).toBeInTheDocument();
    expect(await repo.db.items.get('it-rice')).toMatchObject({ unit: 'bag', par: 2, preferredStoreId: 'st-costco' });
  });

  it('Enter on an exact pantry name links it instead of making a stray entry', async () => {
    await renderList();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to list' }), 'milk{Enter}');
    const [entry] = await repo.db.listEntries.where('itemId').equals('it-milk').toArray();
    expect(entry).toMatchObject({ name: 'Milk', quantity: 1, storeId: 'st-fredmeyer', source: 'manual' });
  });

  it('the entry sheet edits quantity and store, and removes manual entries', async () => {
    await renderList();
    await userEvent.click(within(group('Unassigned')).getByRole('button', { name: 'Dish soap' }));
    let sheet = screen.getByRole('dialog', { name: 'Dish soap' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'More how many to buy' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Costco' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await within(group('Costco')).findByText('Dish soap')).toBeInTheDocument();
    expect(within(group('Costco')).getByText('2')).toBeInTheDocument();
    await userEvent.click(within(group('Costco')).getByRole('button', { name: 'Dish soap' }));
    sheet = screen.getByRole('dialog', { name: 'Dish soap' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove' }));
    await sheetClosed();
    await waitFor(() => expect(screen.queryByText('Dish soap')).toBeNull()); // the list redraws after the sheet closes
  });

  it('an auto entry for a still-low item explains why it stays', async () => {
    await renderList();
    await userEvent.click(within(group('Costco')).getByRole('button', { name: /^Chicken thighs/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still low');
  });

  it('Export is a placeholder', async () => {
    await renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Export list' }));
    expect(screen.getByText("Export isn't built yet.")).toBeInTheDocument();
  });
});
