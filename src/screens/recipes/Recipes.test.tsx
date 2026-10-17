import { render, screen, waitFor, within } from '@testing-library/react';
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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const section = (name: RegExp) => screen.getByRole('region', { name });
const rowNames = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((l) => l.querySelector('span span')?.textContent);

describe('Recipes tab', () => {
  it('groups recipes by what can be made, with what is missing on each row', async () => {
    renderAt('/recipes');
    await screen.findByRole('heading', { level: 2, name: /Ready to make/ });
    expect(rowNames(section(/Ready to make/))).toEqual(['Skillet flatbread']);
    expect(rowNames(section(/Almost/))).toEqual(['Chicken tacos', 'Pizza', 'Waffles']);
    expect(rowNames(section(/Need more/))).toEqual(['Vegetable curry']);
    expect(within(section(/Almost/)).getByRole('link', { name: /Waffles/ })).toHaveTextContent(
      'Missing: baking powder',
    );
    expect(within(section(/Almost/)).getByRole('link', { name: /Chicken tacos/ })).toHaveTextContent(
      'Missing: small tortillas, shredded cheese, onion',
    );
    expect(within(section(/Ready/)).getByRole('link', { name: /Skillet flatbread/ })).toHaveTextContent(
      'Everything’s here',
    );
  });

  it('filters by tag and searches names and ingredients', async () => {
    renderAt('/recipes');
    await userEvent.click(await screen.findByRole('button', { name: 'breakfast' }));
    expect(screen.getAllByRole('link', { name: /Missing|Everything/ }).map((l) => l.textContent)).toEqual([
      expect.stringContaining('Waffles'),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'chickpeas');
    expect(screen.getAllByRole('link', { name: /Missing|Everything/ }).map((l) => l.textContent)).toEqual([
      expect.stringContaining('Vegetable curry'),
    ]);
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search recipes' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'zzz');
    expect(screen.getByText('No recipes match.')).toBeInTheDocument();
  });

  it('moves a recipe as the pantry changes', async () => {
    renderAt('/recipes');
    await screen.findByRole('heading', { level: 2, name: /Ready to make/ });
    await repo.setAmount('it-flour', 0);
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: /Ready to make/ })).toBeNull());
    expect(within(section(/Almost/)).getByRole('link', { name: /Skillet flatbread/ })).toHaveTextContent(
      'Missing: flour',
    );
  });

  it('an empty library offers the sample recipes', async () => {
    await repo.db.recipes.clear();
    renderAt('/recipes');
    await userEvent.click(await screen.findByRole('button', { name: 'Add sample recipes' }));
    expect(await screen.findByRole('link', { name: /Waffles/ })).toBeInTheDocument();
    expect(await repo.db.recipes.count()).toBe(5);
  });
});

describe('recipe screen', () => {
  it('shows each ingredient against the pantry, in words', async () => {
    renderAt('/recipe/rc-tacos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Chicken tacos' })).toBeInTheDocument();
    expect(screen.getByText('dinner · quick · Serves 4')).toBeInTheDocument();
    expect(screen.getByText('Missing 3 ingredients')).toBeInTheDocument();
    expect(screen.getByText('Running low: chicken thighs')).toBeInTheDocument();
    const rows = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual([
      'Low1 lb chicken thighsChicken thighs',
      'Missing8 small tortillas',
      'Have1 (15 oz) can black beans, drainedBlack beans',
      'Missing1 cup shredded cheese',
      'Missing1 onion, diced',
      'Optionalsalsa (optional)',
      'Optionallime wedges, optional',
    ]);
    expect(screen.getByRole('link', { name: 'Black beans' })).toHaveAttribute('href', '/item/it-blackbeans');
    expect(screen.getByText(/Season and sear the chicken/)).toBeInTheDocument();
  });

  it('adds what is missing to the list, skipping what is already there', async () => {
    renderAt('/recipe/rc-tacos');
    await userEvent.click(await screen.findByRole('button', { name: 'Add missing to list' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Added Shredded cheese, Onion to the list.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add missing to list' })).toBeNull());
    const names = (await repo.db.listEntries.toArray()).map((e) => e.name);
    expect(names.filter((n) => n === 'Onion')).toHaveLength(1);
    expect(names.filter((n) => /tortilla/i.test(n))).toEqual(['Tortillas']);
  });

  it('a ready recipe has nothing to add', async () => {
    renderAt('/recipe/rc-flatbread');
    expect(await screen.findByText('Ready to make')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add missing to list' })).toBeNull();
  });

  it('back goes to Recipes, and the tab is there', async () => {
    renderAt('/recipe/rc-pizza');
    expect(await screen.findByRole('link', { name: 'Recipes' })).toHaveAttribute('href', '/recipes');
  });
});
