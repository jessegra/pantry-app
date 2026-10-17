// Reading typed recipe lines (docs/RECIPES_PLAN.md). Pure.
//   "1½ cups milk"                 -> 1.5 cup, milk
//   "2 large eggs"                 -> 2, large eggs
//   "1 (15 oz) can black beans"    -> 1 can, black beans
//   "½ cup butter, melted"         -> 0.5 cup, butter, prep "melted"
//   "salt, to taste"               -> salt
//   "cilantro (optional)"          -> cilantro, optional

export interface ParsedIngredient {
  quantity?: number;
  unit?: string;
  name: string;
  prep?: string;
  optional: boolean;
}

const UNIT_WORDS: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbs: 'tbsp',
  tbl: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  'fl oz': 'fl oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  ml: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  l: 'l',
  quart: 'qt',
  quarts: 'qt',
  qt: 'qt',
  pint: 'pt',
  pints: 'pt',
  pt: 'pt',
  gallon: 'gal',
  gallons: 'gal',
  gal: 'gal',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  bag: 'bag',
  bags: 'bag',
  package: 'pkg',
  packages: 'pkg',
  pkg: 'pkg',
  packet: 'packet',
  packets: 'packet',
  stick: 'stick',
  sticks: 'stick',
  clove: 'clove',
  cloves: 'clove',
  slice: 'slice',
  slices: 'slice',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
};
// Case matters for these two: "1 T sugar" is a tablespoon, "1 t salt" a teaspoon.
const CASED_UNITS: Record<string, string> = { T: 'tbsp', t: 'tsp' };

const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Reads one number at the start: "2", "1.5", "1/2", "1 1/2", "1½", "½". */
function readNumber(s: string): { value: number; rest: string } | null {
  let m: RegExpMatchArray | null;
  let value: number;
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/))) {
    value = Number(m[1]) + Number(m[2]) / Number(m[3]); // "1 1/2"
  } else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)/))) {
    value = Number(m[1]) / Number(m[2]); // "1/2"
  } else if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*([¼½¾⅓⅔⅛])?/))) {
    value = parseFloat(m[1].replace(',', '.')) + (m[2] ? FRACTIONS[m[2]] : 0); // "2", "1.5", "1½"
  } else if ((m = s.match(/^[¼½¾⅓⅔⅛]/))) {
    value = FRACTIONS[m[0]]; // "½"
  } else {
    return null;
  }
  return Number.isFinite(value) && value > 0 ? { value: round3(value), rest: s.slice(m[0].length) } : null;
}

export function parseIngredientLine(text: string): ParsedIngredient {
  let s = text.trim().replace(/\s+/g, ' ');
  let optional = false;
  const opt = /\(\s*optional\s*\)|,?\s*\boptional\s*$|^optional\s*:?\s*/i;
  if (opt.test(s)) {
    optional = true;
    s = s.replace(opt, '').trim();
  }
  s = s.replace(/,?\s*\bto taste\b/i, '').trim();

  // Quantity, with ranges ("2-3", "2 to 3") read as the larger number.
  let quantity: number | undefined;
  const first = readNumber(s);
  if (first) {
    quantity = first.value;
    s = first.rest.trim();
    const range = s.match(/^(?:-|–|to)\s*/);
    if (range) {
      const second = readNumber(s.slice(range[0].length));
      if (second) {
        quantity = second.value;
        s = second.rest.trim();
      }
    }
  } else if (/^an?\s+/i.test(s)) {
    // "a pinch of salt", "an onion"
    quantity = 1;
    s = s.replace(/^an?\s+/i, '');
  }

  // A size in brackets after the number: "1 (15 oz) can beans".
  s = s.replace(/^\([^)]*\)\s*/, '');

  let unit: string | undefined;
  const two = s.match(/^(\S+\s+\S+?)\.?(?=\s|$)/);
  const one = s.match(/^(\S+?)\.?(?=\s|$)/);
  if (two && UNIT_WORDS[two[1].toLowerCase()]) {
    unit = UNIT_WORDS[two[1].toLowerCase()];
    s = s.slice(two[0].length);
  } else if (one && quantity !== undefined && (CASED_UNITS[one[1]] ?? UNIT_WORDS[one[1].toLowerCase()])) {
    unit = CASED_UNITS[one[1]] ?? UNIT_WORDS[one[1].toLowerCase()];
    s = s.slice(one[0].length);
  }
  s = s.trim().replace(/^of\s+/i, '');

  const comma = s.indexOf(',');
  const name = (comma >= 0 ? s.slice(0, comma) : s).trim();
  const prep = comma >= 0 ? s.slice(comma + 1).trim() : '';
  return { quantity, unit, name: name || text.trim(), ...(prep && { prep }), optional };
}
