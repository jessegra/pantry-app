import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const handles = () => screen.getAllByRole('button', { name: /^Reorder / }).map((b) => b.getAttribute('aria-label'));
const layoutIds = async () => (await repo.currentLayout()).map((n) => (n.kind === 'group' ? `[${n.id}: ${n.locationIds.join(' ')}]` : n.id));

describe('settings: locations', () => {
  it('lists locations and groups in order, with counts and a fixed Unassigned row', async () => {
    renderAt('/settings/locations');
    await screen.findByRole('button', { name: 'Reorder Refrigerator' });
    expect(handles()).toEqual([
      'Reorder Refrigerator',
      'Reorder Refrigerator Drawer',
      'Reorder Deep Freeze',
      'Reorder group Pantry',
      'Reorder Shelf 1',
      'Reorder Shelf 2',
      'Reorder Floor bin',
      'Reorder Kitchen Cabinet Left',
    ]);
    expect(screen.getByText('3 items')).toBeInTheDocument(); // Refrigerator
    expect(screen.getByText('Empty')).toBeInTheDocument(); // Floor bin
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Always last')).toBeInTheDocument();
  });

  it('renames in place', async () => {
    renderAt('/settings/locations');
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Deep Freeze' }));
    const input = screen.getByRole('textbox', { name: 'New name for Deep Freeze' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Chest freezer{Enter}');
    expect(await screen.findByRole('button', { name: 'Rename Chest freezer' })).toBeInTheDocument();
  });

  it('deleting a location says what happens, then moves its items to Unassigned', async () => {
    renderAt('/settings/locations');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Kitchen Cabinet Left' }));
    const sheet = screen.getByRole('dialog', { name: 'Delete Kitchen Cabinet Left?' });
    expect(sheet).toHaveTextContent('2 items will move to Unassigned.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    await sheetClosed();
    expect(await screen.findByText('2 items · Always last')).toBeInTheDocument();
    expect((await repo.db.items.get('it-flour'))!.locationId).toBeNull();
  });

  it('deleting a group keeps its locations', async () => {
    renderAt('/settings/locations');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group Pantry' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Its 3 locations will stay, just not grouped.');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await sheetClosed();
    await waitFor(async () => expect((await layoutIds()).includes('shelf1')).toBe(false));
    expect(await layoutIds()).toEqual(['loc-fridge', 'loc-drawer', 'loc-freeze', 'loc-shelf1', 'loc-shelf2', 'loc-floor', 'loc-cab']);
  });

  it('arrow keys on a handle reorder, and Inventory follows', async () => {
    renderAt('/settings/locations');
    const cab = await screen.findByRole('button', { name: 'Reorder Kitchen Cabinet Left' });
    cab.focus();
    await userEvent.keyboard('{ArrowUp}'); // into the Pantry group, after Floor bin
    await waitFor(async () =>
      expect(await layoutIds()).toEqual(['loc-fridge', 'loc-drawer', 'loc-freeze', '[grp-pantry: loc-shelf1 loc-shelf2 loc-floor loc-cab]']),
    );
    expect(await screen.findByText('Moved Kitchen Cabinet Left to position 8 of 8')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Inventory' }));
    const pantry = await screen.findByRole('group', { name: 'Pantry' });
    expect(within(pantry).getByRole('button', { name: /^Kitchen Cabinet Left/ })).toBeInTheDocument();
  });

  it('drags a row by its handle', async () => {
    renderAt('/settings/locations');
    await screen.findByRole('button', { name: 'Reorder Refrigerator' });
    // jsdom has no layout: give each row a 48px slot.
    document.querySelectorAll<HTMLElement>('[data-reorder-row]').forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * 48, height: 48, bottom: i * 48 + 48 }) as DOMRect;
    });
    const handle = screen.getByRole('button', { name: 'Reorder Deep Freeze' }); // row 2, mid 120
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientY: 120 });
    fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientY: 10 });
    fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientY: 10 });
    await waitFor(async () => expect((await layoutIds())[0]).toBe('loc-freeze'));
  });

  it('adds a location into a group, and a new group', async () => {
    renderAt('/settings/locations');
    await userEvent.click(await screen.findByRole('button', { name: 'Add location' }));
    let sheet = screen.getByRole('dialog', { name: 'Add location' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Top shelf');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Pantry' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }));
    await sheetClosed();
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    sheet = screen.getByRole('dialog', { name: 'Add group' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Garage{Enter}');
    await sheetClosed();
    expect(await screen.findByRole('button', { name: 'Reorder group Garage' })).toBeInTheDocument();
    expect(handles().indexOf('Reorder Top shelf')).toBe(handles().indexOf('Reorder Floor bin') + 1);
  });
});

describe('settings: stores', () => {
  it('shows how each store is used', async () => {
    renderAt('/settings/stores');
    expect(await screen.findByText('Preferred for 3 items')).toBeInTheDocument(); // Costco
    expect(screen.getByText('Preferred for 2 items · backup for 2')).toBeInTheDocument(); // Fred Meyer
    expect(screen.getByText('Preferred for 4 items · backup for 1')).toBeInTheDocument(); // Trader Joe's
  });

  it('reordering stores reorders the shopping list', async () => {
    renderAt('/settings/stores');
    const costco = await screen.findByRole('button', { name: 'Reorder Costco' });
    costco.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(handles()).toEqual(['Reorder Fred Meyer', "Reorder Trader Joe's", 'Reorder Costco']));
    await userEvent.click(screen.getByRole('link', { name: /^List/ }));
    await screen.findByRole('heading', { level: 2, name: 'Costco' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fred Meyer',
      "Trader Joe's",
      'Costco',
      'Unassigned',
    ]);
  });

  it('adds and deletes a store, saying what happens', async () => {
    renderAt('/settings/stores');
    await userEvent.click(await screen.findByRole('button', { name: 'Add store' }));
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Name' }), 'Safeway{Enter}');
    await sheetClosed();
    expect(await screen.findByText('Not used by any item yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Costco' }));
    expect(screen.getByRole('dialog', { name: 'Delete Costco?' })).toHaveTextContent(
      '3 items will forget this store. 1 list entry will move to Unassigned.',
    );
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await sheetClosed();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reorder Costco' })).toBeNull());
  });
});

describe('settings: more', () => {
  it('lists archived items and restores them', async () => {
    await repo.archiveItem('it-peas');
    renderAt('/settings/more');
    expect(await screen.findByRole('link', { name: 'Frozen peas' })).toHaveAttribute('href', '/item/it-peas');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('Nothing archived.')).toBeInTheDocument();
    expect((await repo.db.items.get('it-peas'))!.archivedAt).toBeUndefined();
  });

  it('exports a JSON backup file', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = (b: Blob) => (created.push(b), 'blob:x');
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAt('/settings/more');
    await userEvent.click(await screen.findByRole('button', { name: 'Export data' }));
    expect(await screen.findByText(/^Saved pantry-backup-\d{4}-\d{2}-\d{2}\.json\.$/)).toBeInTheDocument();
    const backup = JSON.parse(await created[0].text());
    expect(backup).toMatchObject({ app: 'pantry', schemaVersion: 2 });
    expect(backup.tables.items).toHaveLength(11);
    click.mockRestore();
  });

  it('imports a backup after confirming, and rejects other files', async () => {
    const backup = await repo.exportData();
    backup.tables.items = backup.tables.items.filter((i) => i.id !== 'it-milk');
    renderAt('/settings/more');
    const input = await screen.findByLabelText('Backup file to import');

    await userEvent.upload(input, new File(['{"nope":true}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a Pantry backup');

    await userEvent.upload(input, new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }));
    const sheet = await screen.findByRole('dialog', { name: 'Replace everything with this backup?' });
    expect(sheet).toHaveTextContent('10 items, 7 locations, 3 stores');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Replace' }));
    await sheetClosed();
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument();
    expect(await repo.db.items.get('it-milk')).toBeUndefined();
  });
});
