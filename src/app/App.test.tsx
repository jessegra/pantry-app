import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { repo } from '../data/repo';
import { App } from './App';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const clearDb = () => Promise.all(repo.db.tables.map((t) => t.clear()));

describe('first run', () => {
  beforeEach(clearDb);

  it('offers start empty or sample data, then shows the app', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Load sample data' }));
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('start empty skips sample data', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Start empty' }));
    await screen.findByRole('navigation', { name: 'Main' });
    expect(await repo.db.items.count()).toBe(0);
  });
});

describe('app shell', () => {
  beforeEach(async () => {
    await clearDb();
    await repo.loadSampleData();
  });

  it('shows the four tabs with Inventory current on /', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => a.firstChild?.nextSibling?.textContent);
    expect(links).toEqual(['Inventory', 'List', 'Add', 'Settings']);
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page');
  });

  it('badges the List tab with unchecked entries, live', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'List, 4 to get' })).toBeInTheDocument();
    await repo.tap('it-blackbeans', -1);
    expect(await screen.findByRole('link', { name: 'List, 5 to get' })).toBeInTheDocument();
  });

  it('navigates between tabs', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('link', { name: /^List/ }));
    expect(screen.getByRole('heading', { name: 'Shopping list' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^List/ })).toHaveAttribute('aria-current', 'page');
  });

  it('settings defaults to locations; the Settings tab stays current on stores', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('link', { name: 'Locations' })).toHaveAttribute('aria-current', 'page');
    renderAt('/settings/stores');
    expect((await screen.findAllByRole('link', { name: 'Settings' })).at(-1)).toHaveAttribute('aria-current', 'page');
  });

  it('hides the tab bar on pushed screens', async () => {
    renderAt('/item/it-blackbeans');
    expect(await screen.findByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
