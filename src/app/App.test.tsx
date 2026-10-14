import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('app shell', () => {
  it('shows the four tabs with Inventory current on /', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(links).toEqual(['Inventory', 'List', 'Add', 'Settings']);
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates between tabs', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('link', { name: 'List' }));
    expect(screen.getByRole('heading', { name: 'Shopping list' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
  });

  it('settings defaults to locations; the Settings tab stays current on stores', () => {
    renderAt('/settings');
    expect(screen.getByRole('link', { name: 'Locations' })).toHaveAttribute('aria-current', 'page');
    renderAt('/settings/stores');
    expect(screen.getAllByRole('link', { name: 'Settings' }).at(-1)).toHaveAttribute('aria-current', 'page');
  });

  it('hides the tab bar on pushed screens', () => {
    renderAt('/item/it-blackbeans');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/');
  });
});
