# Recipes plan (milestone R)

Goal: a small library of the household's routine recipes, each compared against the
pantry: what can we make now, what are we close to, and one tap to put what's missing
on the shopping list. Owner decisions (Oct 2026): recipes are typed in; matching starts
with "do I have each ingredient" and later adds "do I have enough"; ingredients are
matched to pantry items automatically, and unmatched ones are linked or given a
substitute by hand; missing ingredients go on the list with one tap; tags; a few
sample recipes (waffles, tacos, pizza, bread, vegetable curry).

Rules already set in the brief / SPEC §7: cooking never reduces stock. "Almost
makeable" = up to 3 missing ingredients. Staples (salt, pepper, oil…) never count as
missing. A parent item and its leftovers count together.

## Data

- **Recipe**: name, tags, servings (optional), ingredients, steps (free text, optional),
  notes (optional). One record per recipe, so it syncs as one record (added to the
  synced tables and the server's allow-list).
- **Ingredient** (inside the recipe): the line as typed ("2 cups flour"), the parsed
  quantity / unit / name, and how it's matched:
  - **linked** to a pantry item (and optionally **substitutes**: other items that also
    do, e.g. butter or oil);
  - **staple** (always assumed on hand);
  - **unlinked** (not something we stock: counts as missing, goes on the list by name).
  - **optional** ingredients never count as missing.

## Matching (phase 1: "do I have it")

Per ingredient: **have** (the item or a substitute has some on hand, leftovers
included), **low** (have, but at or under its low threshold), **missing** (out, or
not in the pantry), or **staple**. An item without a tracked amount counts as have.

Per recipe: **Ready** (nothing missing), **Almost** (1–3 missing), **Need more** (4+).

## Screens

- **A Recipes tab** (the tab bar goes from 4 to 5: Inventory, List, Recipes, Add,
  Settings). The list is grouped Ready / Almost / Need more, with tag chips to filter and
  a search. Each row shows what's missing ("Missing: eggs, milk").
- **Recipe**: ingredients with have / low / missing / staple marks and their pantry item,
  **Add missing to list** (skips anything already on the list; linked items go under
  their store with a sensible quantity, unlinked ones by name under Unassigned), steps,
  notes, Edit.
- **Add / edit a recipe**: name, tags (chips + new tag), servings, ingredients typed one
  per line, steps. On save, a short review: each line shows what it matched; anything
  unmatched or uncertain asks: link to a pantry item, pick a substitute, mark as staple,
  or leave it (counts as missing).
- **Settings → Staples**: the always-on-hand list (salt, pepper, oil, butter, water,
  sugar, flour to start), editable. A staple that's also a tracked pantry item (flour)
  follows the item when the recipe links to it.
- **Sample recipes**: the five above, in the sample data, chosen so the sample pantry
  shows a mix of Ready / Almost / Need more. A real pantry gets an "Add sample recipes"
  button when the library is empty.

## Build steps (each ends with tests passing)

1. **Model + rules**: recipe types, the ingredient-line parser (cups, tbsp, tsp, g, ml…),
   automatic matching to pantry items (case, plurals, "opened" leftovers), the have /
   missing / Ready / Almost rules, sample recipes, sync for the new table. All pure,
   all tested.
2. **Recipes tab + recipe screen**, including Add missing to list.
3. **Add / edit with the match review**, and Settings → Staples.
4. **Phase 2, "do I have enough"**: compare amounts where the units allow it (same
   unit; weight to weight and volume to volume conversions; a pantry item's package size,
   e.g. 1 can = 15 oz). Shows "have 1 cup of 2"; where amounts can't be compared
   (2 cups flour vs. a 40% bag), it says so and falls back to "have it".

## Not now

- Cooking reducing stock (the brief says never).
- Importing recipes from a web address (later, per the brief).
- Scaling servings.
