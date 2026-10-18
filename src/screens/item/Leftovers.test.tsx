// Owner requests (Oct 2026): items that never become leftovers, and clearing used-up leftovers.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { repo } from '../../data/repo';
import { setTextSize } from '../../app/textSize';

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

describe('leftovers on or off', () => {
  it('unticking "Can be opened as a leftover" hides Open one, and it stays that way', async () => {
    const user = userEvent.setup();
    renderAt('/item/it-eggs');
    const box = await screen.findByRole('checkbox', { name: 'Can be opened as a leftover' });
    expect(box).toBeChecked();
    expect(screen.getByRole('button', { name: 'Open one' })).toBeInTheDocument();
    await user.click(box);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open one' })).toBeNull());
    expect((await repo.db.items.get('it-eggs'))!.noLeftovers).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Can be opened as a leftover' }));
    expect(await screen.findByRole('button', { name: 'Open one' })).toBeInTheDocument();
  });

  it('a leftover has no checkbox of its own', async () => {
    renderAt('/item/it-blackbeans-open');
    await screen.findByRole('heading', { level: 1, name: 'Black beans, opened' });
    expect(screen.queryByRole('checkbox', { name: 'Can be opened as a leftover' })).toBeNull();
  });
});

describe('removing a leftover', () => {
  it('from its own screen, back to the item it came from', async () => {
    const user = userEvent.setup();
    renderAt('/item/it-blackbeans-open');
    await user.click(await screen.findByRole('button', { name: 'Remove leftover' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Black beans' })).toBeInTheDocument();
    expect(await repo.db.items.get('it-blackbeans-open')).toBeUndefined();
    expect(screen.queryByText('Linked leftover')).toBeNull();
  });

  it('a used-up leftover shows a trash can in Inventory instead of its amount', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('slider', { name: 'Black beans, opened' });
    expect(screen.queryByRole('button', { name: 'Remove Black beans, opened' })).toBeNull();
    await repo.setAmount('it-blackbeans-open', 0);
    await user.click(await screen.findByRole('button', { name: 'Remove Black beans, opened' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('slider', { name: 'Black beans, opened' })).toBeNull());
    // Only leftovers: an ordinary item at 0 keeps its amount.
    await repo.setAmount('it-milk', 0);
    expect(await screen.findByText('0 gal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Milk' })).toBeNull();
  });

  it('only leftovers can be removed this way', async () => {
    await expect(repo.deleteLeftover('it-milk')).rejects.toThrow('Only a leftover');
    await repo.deleteLeftover('it-blackbeans-open');
    expect(await repo.db.items.get('it-blackbeans')).toBeTruthy();
  });
});

describe('text size', () => {
  afterEach(() => setTextSize('standard'));

  it('is picked in Settings → More, applied at once, and remembered on this device', async () => {
    const user = userEvent.setup();
    renderAt('/settings/more');
    const group = await screen.findByRole('radiogroup', { name: 'Text size' });
    expect(within(group).getByRole('radio', { name: 'Standard' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Largest' }));
    expect(within(group).getByRole('radio', { name: 'Largest' })).toBeChecked();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3');
    expect(localStorage.getItem('pantry.textSize')).toBe('largest');
  });
});
