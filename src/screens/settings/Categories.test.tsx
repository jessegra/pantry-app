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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('settings: categories', () => {
  it('lists categories alphabetically with counts, Other last', async () => {
    renderAt('/settings/categories');
    const rows = await screen.findAllByRole('button', { name: /items?$|No items$/ });
    expect(rows[0]).toHaveTextContent('Baking1 item');
    expect(rows.at(-1)).toHaveTextContent(/^Other/);
    expect(screen.getByRole('button', { name: /^Canned goods/ })).toHaveTextContent('2 items');
  });

  it('adds a category with words, and new items pick it up', async () => {
    renderAt('/settings/categories');
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }));
    const sheet = screen.getByRole('dialog', { name: 'New category' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Snacks');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'grains icon' }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Words that pick it' }), 'chips, crackers');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByRole('button', { name: /^Snacks/ })).toHaveTextContent('No items · chips, crackers');

    const { id } = await repo.createItem({ name: 'Rice crackers', locationId: 'loc-shelf1' });
    const snacks = (await repo.db.categories.toArray()).find((c) => c.name === 'Snacks')!;
    expect((await repo.db.items.get(id))!.category).toBe(snacks.id);
  });

  it('renames a built-in; the item screen and its picker follow', async () => {
    renderAt('/settings/categories');
    await userEvent.click(await screen.findByRole('button', { name: /^Canned goods/ }));
    const name = within(screen.getByRole('dialog', { name: 'Edit category' })).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Tins');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByRole('button', { name: /^Tins/ })).toBeInTheDocument();
  });

  it('deleting moves items to Other; Other has no delete', async () => {
    renderAt('/settings/categories');
    await userEvent.click(await screen.findByRole('button', { name: /^Canned goods/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete category' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete Canned goods?' });
    expect(confirm).toHaveTextContent('2 items will move to Other.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await sheetClosed();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Canned goods/ })).toBeNull());
    expect((await repo.db.items.get('it-blackbeans'))!.category).toBe('generic');

    await userEvent.click(screen.getByRole('button', { name: /^Other/ }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Delete category' })).toBeNull();
  });

  it('the item screen picker lists your categories', async () => {
    await repo.addCategory({ name: 'Snacks', icon: 'generic', keywords: [] });
    renderAt('/item/it-rice');
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    const sheet = screen.getByRole('dialog', { name: 'Category' });
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Snacks' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await sheetClosed();
    expect(await screen.findByText('Snacks')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Add or edit categories' })).toBeNull();
  });
});
