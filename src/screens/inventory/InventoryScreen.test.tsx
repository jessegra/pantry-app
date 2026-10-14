import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { repo } from '../../data/repo';

const clearDb = () => Promise.all(repo.db.tables.map((t) => t.clear()));

beforeEach(async () => {
  localStorage.clear();
  await clearDb();
  await repo.loadSampleData();
});

const renderApp = async (path = '/') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('slider', { name: 'Black beans' });
};

const bar = (name: string) => screen.getByRole('slider', { name });
const rowOf = (name: string) => bar(name).closest('div[class*="row"]') as HTMLElement;

/** Taps a bar at a fraction of its width (jsdom has no layout, so the rect is stubbed). */
function tapAt(el: HTMLElement, fraction: number) {
  el.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 44, right: 200, bottom: 44 }) as DOMRect;
  const opts = { pointerId: 1, isPrimary: true, clientX: 200 * fraction, clientY: 20 };
  fireEvent.pointerDown(el, opts);
  fireEvent.pointerUp(el, opts);
}

describe('inventory', () => {
  it('renders the mockup structure: groups, locations, counts and low pills', async () => {
    await renderApp();
    const pantry = screen.getByRole('group', { name: 'Pantry' });
    expect(within(pantry).getByRole('heading', { level: 2 })).toHaveTextContent('Pantry1 low');
    expect(screen.getByRole('button', { name: 'Deep Freeze, 2 items, 1 low' })).toBeInTheDocument();
    expect(bar('Flour')).toHaveAttribute('aria-valuetext', '40%');
    expect(bar('Chicken thighs')).toHaveAttribute('aria-valuetext', '1 lb of 4, low');
  });

  it('tapping the right half adds one, the left half uses one; the label follows', async () => {
    await renderApp();
    tapAt(bar('Black beans'), 0.8);
    expect(within(rowOf('Black beans')).getByText('4 cans')).toBeInTheDocument();
    tapAt(bar('Black beans'), 0.2);
    tapAt(bar('Black beans'), 0.2);
    expect(within(rowOf('Black beans')).getByText('2 cans')).toBeInTheDocument();
  });

  it('dropping Black beans to 2 shows the cart glyph and bumps the List badge', async () => {
    await renderApp();
    expect(screen.getByRole('link', { name: 'List, 4 to get' })).toBeInTheDocument();
    expect(within(rowOf('Black beans')).queryByRole('img', { name: 'On shopping list' })).toBeNull();
    tapAt(bar('Black beans'), 0.2);
    expect(await within(rowOf('Black beans')).findByRole('img', { name: 'On shopping list' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'List, 5 to get' })).toBeInTheDocument();
    const [entry] = await repo.db.listEntries.where('itemId').equals('it-blackbeans').toArray();
    expect(entry).toMatchObject({ quantity: 6, storeId: 'st-costco' });
  });

  it('Low filter shows Chicken thighs and Coffee beans only', async () => {
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Low · 2' }));
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Chicken thighs',
      'Coffee beans',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Out · 0' }));
    expect(screen.getByText('Nothing is out')).toBeInTheDocument();
  });

  it('search filters by name across locations', async () => {
    await renderApp();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search pantry' }), 'bean');
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Black beans, opened',
      'Black beans',
      'Coffee beans',
    ]);
  });

  it('drag sets an exact value without also tapping', async () => {
    await renderApp();
    const el = bar('Black beans');
    el.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
    fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: 60, clientY: 20 });
    fireEvent.pointerMove(el, { pointerId: 1, isPrimary: true, clientX: 75, clientY: 21 });
    fireEvent.pointerMove(el, { pointerId: 1, isPrimary: true, clientX: 125, clientY: 21 });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true, clientX: 125, clientY: 21 });
    expect(el).toHaveAttribute('aria-valuenow', '5'); // 125/200 of 8 cans
  });

  it('a vertical move cancels so the list can scroll', async () => {
    await renderApp();
    const el = bar('Black beans');
    el.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
    fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: 150, clientY: 20 });
    fireEvent.pointerMove(el, { pointerId: 1, isPrimary: true, clientX: 152, clientY: 40 });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true, clientX: 152, clientY: 40 });
    expect(el).toHaveAttribute('aria-valuenow', '3');
  });

  it('arrow keys step the slider', async () => {
    await renderApp();
    bar('Flour').focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(bar('Flour')).toHaveAttribute('aria-valuetext', '60%');
    await userEvent.keyboard('{Home}');
    expect(bar('Flour')).toHaveAttribute('aria-valuetext', '0%, out');
  });

  it('long-press on a bar opens item detail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderApp();
      fireEvent.pointerDown(bar('Milk'), { pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
      act(() => vi.advanceTimersByTime(500));
      expect(await screen.findByRole('heading', { level: 1, name: 'Milk' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses a location and remembers it', async () => {
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Refrigerator, 3 items' }));
    expect(screen.queryByRole('slider', { name: 'Milk' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('pantry.collapsedLocations')!)).toEqual(['loc-fridge']);
  });

  it('shows the set-up row and the empty location', async () => {
    await renderApp();
    expect(screen.getByRole('link', { name: 'Set up' })).toHaveAttribute('href', '/item/it-rice');
    expect(screen.getByText('Nothing stored here yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add item' })).toHaveAttribute('href', '/add?location=loc-floor');
  });
});
