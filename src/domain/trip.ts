// Just-shopped walk (SPEC §4.6). Pure.
import type { InventorySection } from './inventory';
import { groupListByStore, isSetUp } from './rules';
import type { ID, Item, ListEntry, Store } from './types';

/** Every entry in list order: stores in order, then rows (checked ones included, at the end of their store). */
export function tripOrder(entries: ListEntry[], stores: Store[]): Array<ListEntry & { storeName: string }> {
  return groupListByStore(entries, stores).flatMap((g) => g.entries.map((e) => ({ ...e, storeName: g.name })));
}

/** "Continue through the house": remaining non-archived, set-up items, location by location. */
export function houseOrder(
  sections: InventorySection[],
  exclude: Set<ID>,
): Array<{ item: Item; where: string }> {
  return sections.flatMap((s) =>
    (s.kind === 'group' ? s.locations.map((l) => ({ l, where: `${s.group.name} · ${l.name}` })) : [{ l: s.location, where: s.location.name }]).flatMap(
      ({ l, where }) => l.rows.filter((r) => isSetUp(r.item) && !exclude.has(r.item.id)).map((r) => ({ item: r.item, where })),
    ),
  );
}

export type TripResult =
  | { kind: 'bought'; entryId: ID; name: string; quantity: number; unit?: string; itemId?: ID }
  | { kind: 'skipped'; entryId: ID; name: string };

/** "4 items added to what's on hand. 1 skipped and still on the list." */
export function tripSummary(results: TripResult[]): string {
  const bought = results.filter((r) => r.kind === 'bought').length;
  const skipped = results.length - bought;
  const parts = [
    bought === 0
      ? 'Nothing logged from the list.'
      : `${bought} ${bought === 1 ? 'item' : 'items'} added to what's on hand.`,
  ];
  if (skipped) parts.push(`${skipped} skipped and still on the list.`);
  return parts.join(' ');
}

/** Bought things that aren't in the pantry: offer to add them (deduplicated, in order). */
export function untrackedPurchases(results: TripResult[]): string[] {
  const names = results.flatMap((r) => (r.kind === 'bought' && !r.itemId ? [r.name] : []));
  return [...new Set(names)];
}
