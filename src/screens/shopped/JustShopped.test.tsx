import { fireEvent, render, screen, within } from '@testing-library/react';
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

const start = async () => {
  render(
    <MemoryRouter initialEntries={['/shopped']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Chicken thighs' });
};

const confirm = () => userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
const skip = () => userEvent.click(screen.getByRole('button', { name: 'Skip' }));
const nextCard = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('just shopped', () => {
  it('walks the list one item at a time, prefilled from the list', async () => {
    await start();
    expect(screen.getByText('1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Costco')).toBeInTheDocument();
    expect(screen.getByText('List asked for 3 lb')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3lb');
    expect(screen.getByText('On hand after: 4 lb')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByText('On hand after: 5 lb')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'One fewer' }));
    await confirm();
    await nextCard('Lemons');
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    expect(screen.getByText('Not tracked in inventory')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Items logged' })).toHaveAttribute('aria-valuenow', '1');
  });

  it('logs the mockup trip and shows the completion summary', async () => {
    await start();
    await confirm(); // Chicken thighs +3 lb
    await nextCard('Lemons');
    await confirm(); // +4
    await nextCard('Coffee beans');
    await confirm(); // +2 bags
    await nextCard('Tortillas');
    await confirm(); // +1 pack
    await nextCard('Dish soap');
    await skip();
    expect(await screen.findByRole('heading', { name: "That's the whole list." })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByRole('heading', { name: 'Trip logged' })).toBeInTheDocument();
    expect(screen.getByText("4 items added to what's on hand. 1 skipped and still on the list.")).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual([
      'Chicken thighs+3 lbnow 4 lb',
      'Lemons+4untracked',
      'Coffee beans+2 bagsnow 2½ bags',
      'Tortillas+1 packuntracked',
      'Dish soapSkipped',
    ]);
    expect(screen.getByText(/Lemons and Tortillas aren't in your pantry yet/)).toBeInTheDocument();

    // Logged entries are cleared; the skipped one stays, unchecked.
    const left = await repo.db.listEntries.toArray();
    expect(left.map((e) => [e.name, e.checked])).toEqual([['Dish soap', false]]);
    expect((await repo.db.items.get('it-chicken'))!.amount).toBe(4);
  });

  it('a double-tap on Confirm logs the purchase once', async () => {
    await start();
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmButton); // two raw clicks, no re-render in between
    fireEvent.click(confirmButton);
    await nextCard('Lemons');
    expect((await repo.db.items.get('it-chicken'))!.amount).toBe(4); // 1 + 3, not 1 + 3 + 3
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
  });

  it('skipping an already-checked entry keeps it on the list, unchecked', async () => {
    await start();
    await skip();
    await nextCard('Lemons');
    await skip();
    await nextCard('Coffee beans');
    expect(await repo.db.listEntries.get('le-lemons')).toMatchObject({ checked: false });
  });

  it('continues through the house, then finishes', async () => {
    await start();
    await confirm(); // chicken
    for (const name of ['Lemons', 'Coffee beans', 'Tortillas', 'Dish soap']) {
      await nextCard(name);
      await skip();
    }
    await userEvent.click(await screen.findByRole('button', { name: 'Continue through the house' }));
    expect(await nextCard('Milk')).toBeInTheDocument();
    expect(screen.getByText('Around the house')).toBeInTheDocument();
    expect(screen.getByText('Have now')).toBeInTheDocument();
    expect(screen.getByText('1 of 9')).toBeInTheDocument(); // set-up items minus chicken
    await userEvent.click(screen.getByRole('button', { name: 'One more' }));
    await confirm();
    await nextCard('Eggs');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByRole('heading', { name: 'Trip logged' })).toBeInTheDocument();
    expect(screen.getByText(/Updated 1 amount around the house/)).toBeInTheDocument();
    expect((await repo.db.items.get('it-milk'))!.amount).toBe(2);
  });

  it('offers to add untracked purchases to the pantry', async () => {
    await start();
    await skip();
    await nextCard('Lemons');
    await confirm();
    for (const name of ['Coffee beans', 'Tortillas', 'Dish soap']) {
      await nextCard(name);
      await skip();
    }
    await userEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' }));
    const sheet = screen.getByRole('dialog', { name: 'New item' });
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('Lemons');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add another' }));
    await sheetClosed();
    expect(screen.queryByText(/in your pantry yet/)).toBeNull();
    const lemons = (await repo.db.items.toArray()).find((i) => i.name === 'Lemons');
    expect(lemons).toMatchObject({ category: 'produce', locationId: 'loc-fridge' });
  });

  it('an empty list goes straight to the end choice', async () => {
    await Promise.all([repo.db.listEntries.clear()]);
    render(
      <MemoryRouter initialEntries={['/shopped']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'The list is empty.' })).toBeInTheDocument();
  });
});
