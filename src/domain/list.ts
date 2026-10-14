// Shopping list helpers (SPEC §4.5). Pure.
import { nameFromQuery } from './quickAdd';
import { formatQuantity, getStatus, isSetUp } from './rules';
import type { Item } from './types';
import { ITEM_UNITS, MEASURE_UNITS } from './units';

const GLYPHS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const UNIT_WORDS = new Map<string, string>(
  [...ITEM_UNITS, ...MEASURE_UNITS].flatMap((u) => [
    [u, u],
    [`${u}s`, u],
    [`${u}es`, u],
  ]),
);

export interface ParsedListInput {
  name: string;
  quantity?: number;
  unit?: string;
}

/**
 * "4 lemons" -> 4 Lemons. "2 lb ground beef" -> 2 lb Ground beef. "1½ bags rice" -> 1.5 bag Rice.
 * Anything else is just a name.
 */
export function parseListInput(text: string): ParsedListInput {
  const t = text.trim().replace(/\s+/g, ' ');
  const m = t.match(/^(\d+(?:[.,]\d+)?)?([¼½¾])?\s+(.*)$/); // the space keeps "7up" a name
  if (!m || (!m[1] && !m[2]) || !m[3]) return { name: nameFromQuery(t) };
  const quantity = (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? GLYPHS[m[2]] : 0);
  let rest = m[3];
  let unit: string | undefined;
  const [first, ...others] = rest.split(' ');
  const asUnit = UNIT_WORDS.get(first.toLowerCase());
  if (asUnit && others.length) {
    unit = asUnit;
    rest = others.join(' ').replace(/^of /i, '');
  }
  return { name: nameFromQuery(rest), quantity: quantity > 0 ? quantity : undefined, unit };
}

/** Second line on auto rows: "low, back to 4 lb". */
export function autoReason(item: Item | undefined): string {
  if (!item || !isSetUp(item)) return '';
  const s = getStatus(item);
  const state = s === 'out' ? 'out' : s === 'low' ? 'low' : 'topped up';
  return `${state}, back to ${formatQuantity(item.par!, item.unit)}`;
}
