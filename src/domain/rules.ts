// Pure behaviour rules. No storage, no React. See docs/SPEC.md §3.
import type { Item, ItemStatus, ListEntry, Store, ID } from './types';

export const DEFAULT_THRESHOLD_RATIO = 0.25;
const EPS = 1e-9;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Set-up state ----------

/** An item is "set up" (has a bar) once it has a par. */
export function isSetUp(item: Pick<Item, 'par'>): boolean {
  return item.par != null && item.par > 0;
}

/**
 * A single-container item (par === 1: one bag of flour, one bottle of oil) is
 * shown as a percentage and steps in 10% while at or below par.
 */
export function isSingleContainer(item: Pick<Item, 'par'>): boolean {
  return item.par === 1;
}

// ---------- Threshold & status ----------

export function effectiveThreshold(item: Pick<Item, 'par' | 'lowThreshold'>): number | undefined {
  if (!isSetUp(item)) return undefined;
  return item.lowThreshold ?? item.par! * DEFAULT_THRESHOLD_RATIO;
}

/** out: nothing left. low: at or below threshold. ok: above it. untracked: no par yet. */
export function getStatus(item: Pick<Item, 'par' | 'lowThreshold' | 'amount'>): ItemStatus {
  if (!isSetUp(item)) return 'untracked';
  if (item.amount <= EPS) return 'out';
  if (item.amount <= effectiveThreshold(item)! + EPS) return 'low';
  return 'ok';
}

export function isLowOrOut(item: Pick<Item, 'par' | 'lowThreshold' | 'amount'>): boolean {
  const s = getStatus(item);
  return s === 'low' || s === 'out';
}

/** Bar fill 0..1. Over-par amounts fill to 1. */
export function fillFraction(item: Pick<Item, 'par' | 'amount'>): number {
  if (!isSetUp(item)) return 0;
  return Math.max(0, Math.min(1, item.amount / item.par!));
}

/** Tick positions (0..1) at whole-unit boundaries, excluding 0 and 1. None for single containers. */
export function tickPositions(item: Pick<Item, 'par'>): number[] {
  if (!isSetUp(item) || isSingleContainer(item)) return [];
  const par = item.par!;
  const ticks: number[] = [];
  for (let u = 1; u < par; u++) ticks.push(u / par);
  return ticks;
}

// ---------- Bar interactions ----------

export type TapDirection = 1 | -1;

/**
 * Tap right half = +1 step, left half = -1 step. A step is one unit.
 * Single containers step 10% while at or below par, then whole units above it.
 * Never below 0.
 */
export function applyTap(item: Pick<Item, 'par' | 'amount'>, dir: TapDirection): number {
  const a = item.amount;
  if (isSingleContainer(item)) {
    const par = item.par!;
    if (dir === 1) {
      return round2(a < par - EPS ? Math.min(par, a + 0.1) : a + 1);
    }
    return round2(a > par + EPS ? Math.max(par, a - 1) : Math.max(0, a - 0.1));
  }
  return round2(Math.max(0, a + dir));
}

/** Snap size used while dragging. */
export function dragSnap(item: Pick<Item, 'par'>): number {
  const par = item.par ?? 1;
  if (par >= 4) return 1;
  if (par === 1) return 0.05;
  return 0.1;
}

/** Drag along the bar: fraction 0..1 of the bar width -> amount, snapped. */
export function dragToAmount(item: Pick<Item, 'par'>, fraction: number): number {
  if (!isSetUp(item)) return 0;
  const f = Math.max(0, Math.min(1, fraction));
  const snap = dragSnap(item);
  return round2(Math.round((f * item.par!) / snap) * snap);
}

// ---------- Formatting ----------

const PLURALS: Record<string, string> = {
  can: 'cans',
  bag: 'bags',
  stick: 'sticks',
  bottle: 'bottles',
  pack: 'packs',
  box: 'boxes',
  jar: 'jars',
  loaf: 'loaves',
  carton: 'cartons',
  head: 'heads',
};
/** Units that don't pluralise: oz, lb, gal, each, g, kg, ml, l... */
export function pluralUnit(unit: string, n: number): string {
  if (n > 0 && n <= 1 + EPS) return unit;
  return PLURALS[unit] ?? unit;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

export function formatNumber(n: number): string {
  const whole = Math.floor(n + EPS);
  const frac = n - whole;
  if (frac < 0.01) return String(whole);
  const glyph = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.01)?.[1];
  if (glyph) return (whole ? String(whole) : '') + glyph;
  return String(round2(n).toFixed(1)).replace(/\.0$/, '');
}

export function formatQuantity(n: number, unit?: string): string {
  const num = formatNumber(n);
  return unit ? `${num} ${pluralUnit(unit, n)}` : num;
}

/** Label beside every bar: "3 cans", "½ bag", "40%". */
export function formatAmount(item: Pick<Item, 'par' | 'amount' | 'unit'>): string {
  if (!isSetUp(item)) return '';
  if (isSingleContainer(item) && item.amount <= 1 + EPS) return `${Math.round(item.amount * 100)}%`;
  return formatQuantity(item.amount, item.unit);
}

/** Screen-reader text for the bar: "3 cans of 8, low". */
export function ariaValueText(item: Pick<Item, 'par' | 'amount' | 'unit' | 'lowThreshold'>): string {
  if (!isSetUp(item)) return 'Not set up';
  const s = getStatus(item);
  const of = isSingleContainer(item) ? '' : ` of ${formatNumber(item.par!)}`;
  return `${formatAmount(item)}${of}${s === 'low' ? ', low' : s === 'out' ? ', out' : ''}`;
}

// ---------- Shopping list ----------

/** Quantity that fills the item back to par, rounded up to whole units (min 1). */
export function restockQuantity(item: Pick<Item, 'par' | 'amount'>): number | undefined {
  if (!isSetUp(item)) return undefined;
  return Math.max(1, Math.ceil(item.par! - item.amount - EPS));
}

/** Should this item currently have an auto entry on the list? */
export function shouldAutoList(item: Item): boolean {
  return isSetUp(item) && !item.isLeftover && item.archivedAt == null && isLowOrOut(item);
}

export type AutoListAction =
  | { type: 'none' }
  | { type: 'add'; entry: Omit<ListEntry, 'id' | 'createdAt' | 'updatedAt'>; promptForStore: boolean }
  | { type: 'update'; entryId: ID; quantity: number }
  | { type: 'remove'; entryId: ID };

/**
 * Run after every change to an item's amount, par, threshold or archive state.
 * `entries` = all list entries linked to this item.
 * - Silent add when the item drops to/below threshold. No approval step.
 * - Keeps an unchecked auto entry's quantity in step with the item.
 * - Removes an unchecked auto entry if the item climbs back above threshold.
 * - Never touches checked entries or manual entries.
 */
export function reconcileAutoEntry(item: Item, entries: ListEntry[]): AutoListAction {
  const open = entries.find((e) => e.itemId === item.id && !e.checked);
  const want = shouldAutoList(item);
  if (want) {
    if (!open) {
      return {
        type: 'add',
        entry: {
          itemId: item.id,
          name: item.name,
          quantity: restockQuantity(item)!,
          unit: item.unit,
          storeId: item.preferredStoreId ?? null,
          source: 'auto',
          checked: false,
        },
        promptForStore: item.preferredStoreId == null,
      };
    }
    if (open.source === 'auto') {
      const q = restockQuantity(item)!;
      if (q !== open.quantity) return { type: 'update', entryId: open.id, quantity: q };
    }
    return { type: 'none' };
  }
  if (open && open.source === 'auto') return { type: 'remove', entryId: open.id };
  return { type: 'none' };
}

/** "The nag": fields to ask for when an item first needs to reach the list. */
export function missingForList(item: Item): Array<'unit' | 'par' | 'preferredStore'> {
  const missing: Array<'unit' | 'par' | 'preferredStore'> = [];
  if (!item.unit) missing.push('unit');
  if (!isSetUp(item)) missing.push('par');
  if (!item.preferredStoreId) missing.push('preferredStore');
  return missing;
}

export interface StoreGroup {
  storeId: ID | null;
  name: string;
  entries: ListEntry[];
  remaining: number;
}

/**
 * Groups entries under store headers in the stores' sortOrder, Unassigned last.
 * Within a group: unchecked first (oldest first), then checked (in the order they were checked).
 * Empty groups are omitted.
 */
export function groupListByStore(entries: ListEntry[], stores: Store[]): StoreGroup[] {
  const ordered = [...stores].sort((a, b) => a.sortOrder - b.sortOrder);
  const known = new Set(ordered.map((s) => s.id));
  const groups: StoreGroup[] = [
    ...ordered.map((s) => ({ storeId: s.id as ID | null, name: s.name })),
    { storeId: null, name: 'Unassigned' },
  ].map(({ storeId, name }) => {
    const mine = entries.filter((e) =>
      storeId === null ? e.storeId === null || !known.has(e.storeId) : e.storeId === storeId,
    );
    const unchecked = mine.filter((e) => !e.checked).sort((a, b) => a.createdAt - b.createdAt);
    const checked = mine.filter((e) => e.checked).sort((a, b) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0));
    return { storeId, name, entries: [...unchecked, ...checked], remaining: unchecked.length };
  });
  return groups.filter((g) => g.entries.length > 0);
}

/** "Move to secondary store": the entry swaps to the item's other store. */
export function alternateStore(entry: ListEntry, item?: Item): ID | null | undefined {
  if (!item) return undefined;
  const { preferredStoreId: p, secondaryStoreId: s } = item;
  if (!p || !s) return undefined;
  return entry.storeId === s ? p : s;
}

// ---------- Just-shopped & Open one ----------

/** Logging a purchase adds to what's on hand. */
export function applyPurchase(item: Pick<Item, 'amount'>, quantity: number): number {
  return round2(Math.max(0, item.amount + quantity));
}

export interface OpenOneInput {
  name?: string;
  unit?: string;
  locationId: ID | null;
  /** Pre-checked in the UI. Uncheck for a leftover that didn't come from tracked stock. */
  subtractFromParent: boolean;
}

/** Builds the leftover item (minus ids/timestamps) and the parent's new amount. */
export function openOne(
  parent: Item,
  input: OpenOneInput,
): {
  leftover: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
  parentAmount: number;
} {
  // A freshly opened package is full: par and amount default to one package's worth
  // in whichever unit the user picked (8 oz for "1 can = 8 oz"; 1 for the parent's own unit).
  let full: number | undefined;
  if (input.unit && parent.packageSize && input.unit === parent.packageSize.unit) full = parent.packageSize.amount;
  else if (input.unit && input.unit === parent.unit) full = 1;
  return {
    leftover: {
      name: input.name?.trim() || `${parent.name}, opened`,
      unit: input.unit,
      locationId: input.locationId,
      par: full,
      amount: full ?? 0,
      category: parent.category,
      categoryConfirmed: parent.categoryConfirmed,
      isLeftover: true,
      parentId: parent.id,
    },
    parentAmount: input.subtractFromParent ? round2(Math.max(0, parent.amount - 1)) : parent.amount,
  };
}

/**
 * Total on hand for recipes later: parent + leftovers, in the parent's package unit.
 * Returns undefined if any leftover's unit can't be converted (no package size).
 */
export function combinedAmountInPackageUnit(parent: Item, leftovers: Item[]): number | undefined {
  if (!parent.packageSize) return undefined;
  let total = parent.amount * parent.packageSize.amount;
  for (const l of leftovers) {
    if (l.unit === parent.packageSize.unit) total += l.amount;
    else if (l.unit === parent.unit) total += l.amount * parent.packageSize.amount;
    else return undefined;
  }
  return round2(total);
}
