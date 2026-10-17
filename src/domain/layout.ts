// Settings → Locations reordering (SPEC §4.7). Pure.
// The screen shows one flat list: top-level locations, and group headers followed
// by their (indented) locations. Dragging a location into or out of a group's span
// changes its group. Dragging a group moves the whole block.
import type { ID } from './types';

export type LayoutNode = { kind: 'location'; id: ID } | { kind: 'group'; id: ID; locationIds: ID[] };
export type Row = { kind: 'group'; id: ID } | { kind: 'location'; id: ID; groupId: ID | null };

export function toRows(layout: LayoutNode[]): Row[] {
  return layout.flatMap((n): Row[] =>
    n.kind === 'location'
      ? [{ kind: 'location', id: n.id, groupId: null }]
      : [{ kind: 'group', id: n.id }, ...n.locationIds.map((id) => ({ kind: 'location' as const, id, groupId: n.id }))],
  );
}

export function toLayout(rows: Row[]): LayoutNode[] {
  const out: LayoutNode[] = [];
  for (const r of rows) {
    if (r.kind === 'group') out.push({ kind: 'group', id: r.id, locationIds: [] });
    else if (r.groupId === null) out.push({ kind: 'location', id: r.id });
    else {
      const g = out.findLast((n) => n.kind === 'group' && n.id === r.groupId);
      if (g && g.kind === 'group') g.locationIds.push(r.id);
      else out.push({ kind: 'location', id: r.id }); // orphan: treat as top-level
    }
  }
  return out;
}

/** Index range [start, end) of the block starting at `i`: a group and its children, or one row. */
function blockAt(rows: Row[], i: number): [number, number] {
  const r = rows[i];
  if (r.kind !== 'group') return [i, i + 1];
  let end = i + 1;
  while (end < rows.length && rows[end].kind === 'location' && (rows[end] as { groupId: ID | null }).groupId === r.id)
    end++;
  return [i, end];
}

/** The group a location joins when it lands right after `prev`. */
function groupAfter(prev: Row | undefined): ID | null {
  if (!prev) return null;
  if (prev.kind === 'group') return prev.id;
  return prev.groupId;
}

/**
 * Moves the row at `from` so it lands before the row currently at `before`
 * (0..rows.length; rows.length = the end). A location joins the group it lands in
 * (right after the header or one of its locations), else becomes top-level. A group
 * moves with its locations and can't land inside another group.
 */
export function moveRow(rows: Row[], from: number, before: number): Row[] {
  const [start, end] = blockAt(rows, from);
  if (before >= start && before <= end) return rows; // no-op: dropped onto itself
  const block = rows.slice(start, end);
  const rest = [...rows.slice(0, start), ...rows.slice(end)];
  let at = before > start ? before - block.length : before;

  if (block[0].kind === 'group') {
    // Snap out of any group span: move forward past the children of the group we're in.
    while (at > 0 && at < rest.length && rest[at].kind === 'location' && groupAfter(rest[at - 1]) !== null) {
      const g = groupAfter(rest[at - 1]);
      if ((rest[at] as { groupId: ID | null }).groupId !== g) break;
      at++;
    }
    return [...rest.slice(0, at), ...block, ...rest.slice(at)];
  }

  const moved: Row = { ...(block[0] as Row & { kind: 'location' }), groupId: groupAfter(rest[at - 1]) };
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Keyboard reordering: one step up or down, treating a group as one block. */
export function moveRowBy(rows: Row[], index: number, dir: -1 | 1): Row[] {
  const row = rows[index];
  if (dir === -1) {
    if (index === 0) return rows;
    const prev = rows[index - 1];
    // A top-level location just below a group first joins it at the end (same spot, indented).
    if (row.kind === 'location' && prev.kind === 'location' && prev.groupId !== null && row.groupId !== prev.groupId) {
      return rows.map((r, i) => (i === index ? { ...row, groupId: prev.groupId } : r));
    }
    if (row.kind === 'group') {
      // Jump above the previous top-level block.
      let prev = index - 1;
      while (prev > 0 && rows[prev].kind === 'location' && (rows[prev] as { groupId: ID | null }).groupId !== null)
        prev--;
      return moveRow(rows, index, prev);
    }
    return moveRow(rows, index, index - 1);
  }
  const [, end] = blockAt(rows, index);
  if (end >= rows.length) {
    // A last grouped location steps out of its group.
    if (row.kind === 'location' && row.groupId !== null) {
      return rows.map((r, i) => (i === index ? { ...row, groupId: null } : r));
    }
    return rows;
  }
  if (row.kind === 'group') {
    const [, nextEnd] = blockAt(rows, end);
    return moveRow(rows, index, nextEnd);
  }
  // A grouped location at the end of its span steps out instead of jumping the next block.
  const next = rows[index + 1];
  if (row.groupId !== null && !(next.kind === 'location' && next.groupId === row.groupId)) {
    return rows.map((r, i) => (i === index ? { ...row, groupId: null } : r));
  }
  return moveRow(rows, index, index + 2);
}

/** Store order: plain list move. `before` as in moveRow. */
export function moveItem<T>(items: T[], from: number, before: number): T[] {
  if (before === from || before === from + 1) return items;
  const rest = items.filter((_, i) => i !== from);
  const at = before > from ? before - 1 : before;
  return [...rest.slice(0, at), items[from], ...rest.slice(at)];
}
