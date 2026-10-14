import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { repo } from '../../data/repo';

beforeEach(async () => {
  localStorage.clear();
  resetNagSession();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
});

const renderAt = async (path = '/add') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return screen.findByRole('searchbox', { name: 'Find or create an item' });
};

const amountOf = async (id: string) => (await repo.db.items.get(id))!.amount;

describe('quick add', () => {
  it('autofocuses search and shows a recent grid of up to 9', async () => {
    const box = await renderAt();
    expect(box).toHaveFocus();
    const grid = screen.getByRole('region', { name: 'Recent & frequent' });
    expect(await within(grid).findAllByRole('button')).toHaveLength(9);
  });

  it('a tile tap adds one step and shows "+n added" without leaving', async () => {
    await renderAt();
    const grid = screen.getByRole('region', { name: 'Recent & frequent' });
    const peas = await within(grid).findByRole('button', { name: /^Add one to Frozen peas/ });
    await userEvent.click(peas);
    await userEvent.click(peas);
    expect(peas).toHaveTextContent('+2 added');
    expect(await amountOf('it-peas')).toBe(4);
    expect(screen.getByRole('searchbox')).toBeInTheDocument(); // still here
  });

  it('typing matches existing items first, with +1 and a Create row last', async () => {
    const box = await renderAt();
    await userEvent.type(box, 'be');
    const results = screen.getAllByRole('button', { name: /^Add one to|^Create/ }).map((b) => b.textContent);
    expect(results.slice(0, 3)).toEqual(['+1', '+1', '+1']);
    expect(screen.getByRole('button', { name: 'Create “Be”' })).toBeInTheDocument();
    expect(screen.getByText('Pantry · Shelf 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add one to Black beans' }));
    expect(await amountOf('it-blackbeans')).toBe(4);
    await userEvent.clear(box);
    await userEvent.type(box, 'ric');
    expect(screen.getByRole('link', { name: 'Set up' })).toHaveAttribute('href', '/item/it-rice');
  });

  it('adds five new items in a row with Enter and "Add another"', async () => {
    const box = await renderAt();
    for (const name of ['tortillas', 'lemons', 'soy sauce', 'paper towels', 'oats']) {
      await userEvent.type(box, `${name}{Enter}`);
      const sheet = await screen.findByRole('dialog', { name: 'New item' });
      await userEvent.click(within(sheet).getByRole('button', { name: 'Add another' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(box).toHaveValue('');
      expect(box).toHaveFocus();
    }
    const created = (await repo.db.items.toArray())
      .filter((i) => !i.id.startsWith('it-'))
      .sort((a, b) => a.createdAt - b.createdAt);
    expect(created.map((i) => [i.name, i.category])).toEqual([
      ['Tortillas', 'grains'],
      ['Lemons', 'produce'],
      ['Soy sauce', 'generic'],
      ['Paper towels', 'household'],
      ['Oats', 'grains'],
    ]);
    // First location by default, then the last one used.
    expect(new Set(created.map((i) => i.locationId))).toEqual(new Set(['loc-fridge']));
  });

  it('Enter on an exact match does not create a duplicate', async () => {
    const box = await renderAt();
    await userEvent.type(box, 'milk{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the create sheet groups locations, remembers the last one, and Add & done goes home', async () => {
    const box = await renderAt();
    await userEvent.type(box, 'tahini');
    await userEvent.click(screen.getByRole('button', { name: 'Create “Tahini”' }));
    const sheet = screen.getByRole('dialog', { name: 'New item' });
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('Tahini');
    expect(within(sheet).getByText('Pantry')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Shelf 2' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add & done' }));
    expect(await screen.findByRole('searchbox', { name: 'Search pantry' })).toBeInTheDocument();
    expect(localStorage.getItem('pantry.lastLocation')).toBe('loc-shelf2');
    expect(await screen.findByRole('link', { name: 'Tahini' })).toBeInTheDocument();
  });

  it('the empty-location link preselects that location', async () => {
    const box = await renderAt('/add?location=loc-floor');
    await userEvent.type(box, 'rice flour{Enter}');
    const sheet = await screen.findByRole('dialog', { name: 'New item' });
    expect(within(sheet).getByRole('radio', { name: 'Floor bin' })).toHaveAttribute('aria-checked', 'true');
  });
});
