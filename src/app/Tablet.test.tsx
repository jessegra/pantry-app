import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { repo } from '../data/repo';
import { App } from './App';
import { forgetListLocation } from './listMemory';
import { resetNagSession } from './nag';

// jsdom has no matchMedia: pretend every query matches, i.e. a tablet.
beforeEach(async () => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  resetNagSession();
  forgetListLocation();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
});
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const details = () => screen.getByRole('region', { name: 'Item details' });
const detailsLoaded = () => screen.findByRole('region', { name: 'Item details' });

describe('tablet (two panes)', () => {
  it('shows the list on the left and "Select an item" on the right', async () => {
    renderAt('/');
    expect(await screen.findByRole('searchbox', { name: 'Search pantry' })).toBeInTheDocument();
    expect(within(details()).getByText('Select an item to see its details.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('opening an item keeps Inventory on the left, with the rail on Inventory', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Milk' }));
    expect(await within(details()).findByRole('heading', { level: 1, name: 'Milk' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search pantry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page');
    // On a tablet the detail pane closes instead of going 'back'.
    await userEvent.click(within(details()).getByRole('link', { name: 'Close' }));
    expect(await within(details()).findByText('Select an item to see its details.')).toBeInTheDocument();
  });

  it('an item opened from the List keeps the List on the left', async () => {
    renderAt('/list');
    await userEvent.click(await screen.findByRole('button', { name: /^Chicken thighs/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Open Chicken thighs in inventory' }),
    );
    expect(await within(details()).findByRole('heading', { level: 1, name: 'Chicken thighs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Shopping list' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^List/ })).toHaveAttribute('aria-current', 'page');
  });

  it('a recipe opens beside the Recipes list', async () => {
    renderAt('/recipes');
    await userEvent.click(await screen.findByRole('link', { name: /Waffles/ }));
    expect(await within(details()).findByRole('heading', { level: 1, name: 'Waffles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page');
    expect(within(details()).getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/recipes');
  });

  it('a new recipe is written in the right pane, beside the Recipes list', async () => {
    renderAt('/recipes');
    await userEvent.click(await screen.findByRole('link', { name: 'New recipe' }));
    expect(await within(details()).findByRole('heading', { level: 1, name: 'New recipe' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
    expect(within(details()).getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/recipes');
  });

  it('a direct link to an item shows Inventory beside it', async () => {
    renderAt('/item/it-eggs');
    expect(await within(await detailsLoaded()).findByRole('heading', { level: 1, name: 'Eggs' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search pantry' })).toBeInTheDocument();
  });

  it('just shopped takes the whole screen', async () => {
    renderAt('/shopped');
    expect(await screen.findByRole('heading', { level: 1, name: 'Chicken thighs' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Item details' })).toBeNull();
  });
});
