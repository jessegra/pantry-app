// Owner bug: an added location appeared several times with the same name.
// Cause: Add stayed enabled while saving, and Enter and Add both saved.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const named = async (name: string) => (await repo.db.locations.toArray()).filter((l) => l.name === name);

describe('adding never makes duplicates', () => {
  it('Enter then a quick tap on Add (and a double-tap) in Settings makes one location', async () => {
    renderAt('/settings/locations');
    fireEvent.click(await screen.findByRole('button', { name: 'Add location' }));
    const sheet = screen.getByRole('dialog', { name: 'Add location' });
    const input = within(sheet).getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Garage' } });
    const add = within(sheet).getByRole('button', { name: 'Add' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await named('Garage')).toHaveLength(1);
  });

  it('the inline "New location" in the new-item sheet makes one, and reuses an existing name', async () => {
    renderAt('/add');
    const box = await screen.findByRole('searchbox', { name: 'Find or create an item' });
    fireEvent.change(box, { target: { value: 'tahini' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const sheet = await screen.findByRole('dialog', { name: 'New item' });
    const input = within(sheet).getByRole('textbox', { name: 'New location name' });
    fireEvent.change(input, { target: { value: 'Garage' } });
    const add = within(sheet).getAllByRole('button', { name: 'Add' })[0];
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(await within(sheet).findByRole('radio', { name: 'Garage' })).toHaveAttribute('aria-checked', 'true');
    expect(await named('Garage')).toHaveLength(1);
    // Typing an existing name (any case) selects it rather than making a copy.
    fireEvent.change(input, { target: { value: '  refrigerator ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(within(sheet).getByRole('radio', { name: 'Refrigerator' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(await repo.db.locations.count()).toBe(8);
  });

  it('a quick double Add on the shopping list adds one entry', async () => {
    renderAt('/list');
    const input = await screen.findByRole('textbox', { name: 'Add to list' });
    fireEvent.change(input, { target: { value: 'paper towels' } });
    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(input).toHaveValue(''));
    expect((await repo.db.listEntries.toArray()).filter((e) => e.name === 'Paper towels')).toHaveLength(1);
  });
});
