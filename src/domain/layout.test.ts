import { describe, expect, it } from 'vitest';
import { moveItem, moveRow, moveRowBy, toLayout, toRows, type LayoutNode, type Row } from './layout';

// Seed order: Fridge, Drawer, Freeze, [Pantry: Shelf1, Shelf2, Floor], Cab
const seed: LayoutNode[] = [
  { kind: 'location', id: 'fridge' },
  { kind: 'location', id: 'drawer' },
  { kind: 'location', id: 'freeze' },
  { kind: 'group', id: 'pantry', locationIds: ['shelf1', 'shelf2', 'floor'] },
  { kind: 'location', id: 'cab' },
];
const rows = toRows(seed);
/** "fridge, [pantry: shelf1 shelf2], cab" */
const show = (r: Row[]) =>
  toLayout(r)
    .map((n) => (n.kind === 'group' ? `[${n.id}: ${n.locationIds.join(' ')}]` : n.id))
    .join(', ');

describe('layout rows', () => {
  it('round-trips', () => {
    expect(rows.map((r) => r.id)).toEqual(['fridge', 'drawer', 'freeze', 'pantry', 'shelf1', 'shelf2', 'floor', 'cab']);
    expect(toLayout(rows)).toEqual(seed);
  });
});

describe('moveRow', () => {
  it('moves a top-level location', () => {
    expect(show(moveRow(rows, 0, 3))).toBe('drawer, freeze, fridge, [pantry: shelf1 shelf2 floor], cab');
    expect(show(moveRow(rows, 7, 0))).toBe('cab, fridge, drawer, freeze, [pantry: shelf1 shelf2 floor]');
  });

  it('a location dropped inside a group span joins it', () => {
    expect(show(moveRow(rows, 7, 5))).toBe('fridge, drawer, freeze, [pantry: shelf1 cab shelf2 floor]');
    expect(show(moveRow(rows, 0, 4))).toBe('drawer, freeze, [pantry: fridge shelf1 shelf2 floor], cab');
    // Right after the group's last location still counts as inside.
    expect(show(moveRow(rows, 0, 7))).toBe('drawer, freeze, [pantry: shelf1 shelf2 floor fridge], cab');
  });

  it('a location dragged out of the span leaves the group', () => {
    expect(show(moveRow(rows, 5, 0))).toBe('shelf2, fridge, drawer, freeze, [pantry: shelf1 floor], cab');
    expect(show(moveRow(rows, 4, 3))).toBe('fridge, drawer, freeze, shelf1, [pantry: shelf2 floor], cab');
    expect(show(moveRow(rows, 6, 8))).toBe('fridge, drawer, freeze, [pantry: shelf1 shelf2], cab, floor');
  });

  it('a group moves with its locations and never lands inside another group', () => {
    expect(show(moveRow(rows, 3, 0))).toBe('[pantry: shelf1 shelf2 floor], fridge, drawer, freeze, cab');
    expect(show(moveRow(rows, 3, 8))).toBe('fridge, drawer, freeze, cab, [pantry: shelf1 shelf2 floor]');
    const two = toRows([...seed, { kind: 'group', id: 'garage', locationIds: ['shelfA', 'shelfB'] }]);
    // Dropping garage between shelf1 and shelf2 snaps to after the pantry block.
    expect(show(moveRow(two, 8, 5))).toBe(
      'fridge, drawer, freeze, [pantry: shelf1 shelf2 floor], [garage: shelfA shelfB], cab',
    );
  });

  it('dropping onto itself is a no-op', () => {
    expect(moveRow(rows, 2, 2)).toBe(rows);
    expect(moveRow(rows, 2, 3)).toBe(rows);
    expect(moveRow(rows, 3, 6)).toBe(rows);
  });
});

describe('moveRowBy (keyboard)', () => {
  it('steps locations, joining and leaving groups at the edges', () => {
    expect(show(moveRowBy(rows, 2, 1))).toBe('fridge, drawer, [pantry: freeze shelf1 shelf2 floor], cab');
    expect(show(moveRowBy(rows, 4, -1))).toBe('fridge, drawer, freeze, shelf1, [pantry: shelf2 floor], cab');
    expect(show(moveRowBy(rows, 6, 1))).toBe('fridge, drawer, freeze, [pantry: shelf1 shelf2], floor, cab');
    expect(show(moveRowBy(rows, 7, 1))).toBe(show(rows)); // already last
  });

  it('up and down at a group edge are mirror images', () => {
    // Cab sits below the group: up joins the group at its end, without jumping.
    const joined = moveRowBy(rows, 7, -1);
    expect(show(joined)).toBe('fridge, drawer, freeze, [pantry: shelf1 shelf2 floor cab]');
    // ...and down from there steps back out.
    expect(show(moveRowBy(joined, 7, 1))).toBe(show(rows));
    // A second up moves it above Floor bin, inside the group.
    expect(show(moveRowBy(joined, 7, -1))).toBe('fridge, drawer, freeze, [pantry: shelf1 shelf2 cab floor]');
  });

  it('steps groups past whole blocks', () => {
    expect(show(moveRowBy(rows, 3, -1))).toBe('fridge, drawer, [pantry: shelf1 shelf2 floor], freeze, cab');
    expect(show(moveRowBy(rows, 3, 1))).toBe('fridge, drawer, freeze, cab, [pantry: shelf1 shelf2 floor]');
  });
});

describe('moveItem', () => {
  it('moves within a plain list', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c']);
  });
});
