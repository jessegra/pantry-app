# Pantry — build spec

Source of truth for the first build. Derived from `BRIEF.md` and the approved mockups in `design/screens/`. Where this file and the brief disagree, this file wins. Items marked **Decided** were settled during design. Items marked **Open** need the owner's call; build the proposed default and leave a `// OPEN:` comment.

## 1. Product in one paragraph

Single-user, local-first PWA for a home pantry. Phone-first, one-handed, standing in a kitchen. Tablet = the same screens in two panes. Desktop isn't a design target (must not break, needn't be pretty). Works fully offline. Core loop: see what's low → tap a bar to adjust → shopping list builds itself → log the trip.

## 2. Data model

Types are in `src/domain/types.ts`. Summary:

| Entity | Key fields | Notes |
| --- | --- | --- |
| Item | name*, locationId*, unit, packageSize, par, lowThreshold, amount, preferred/secondaryStoreId, category, isLeftover, parentId, archivedAt | *required at creation. `par` undefined = not set up |
| Location | name, groupId, sortOrder | flat list; exactly one per item; `locationId: null` = Unassigned |
| LocationGroup | name, sortOrder | display header only |
| Store | name, sortOrder, onInstacart? | managed list; order = list group order |
| ListEntry | itemId?, name, quantity, unit?, storeId, source auto/manual, checked | manual entries may have no item |
| Staple | name | seeded: salt, pepper, oil, butter, water, sugar, flour |

Storage: Dexie DB `pantry`, one table per entity, `id` = `crypto.randomUUID()`. Indexes: items `locationId, parentId, archivedAt`; listEntries `itemId, storeId, checked`. Keep a `schemaVersion` and write Dexie migrations from v1. Wrap everything in a repository (`src/data/repo.ts`) with intent-named methods (`setAmount`, `archiveItem`, `deleteLocation`, `logPurchase`…) that also run the side-effects in §3 inside one Dexie transaction.

## 3. Behaviour rules

All implemented and tested in `src/domain/rules.ts`. The repository calls them; components never re-derive.

**Status.** `untracked` (no par) → `out` (amount ≤ 0) → `low` (amount ≤ threshold, *inclusive*) → `ok`. Threshold = `lowThreshold ?? 25% of par`. **Decided:** inclusive, so Chicken thighs 1 lb / par 4 is low, matching the brief's intent.

**Bar colour.** ok = `--color-bar-ok` (blue), low = amber, out = red. The text label beside every bar is always shown ("3 cans", "½ bag", "40%"). Low/out labels are also semibold and tinted.

**Ticks.** At whole-unit boundaries (`tickPositions`). None when par is 1.

**Tap.** Right half +1 step, left half −1 step, one unit per step, floor 0, no upper cap. **Decided:** single-container items (par = 1: flour, olive oil) show as a percentage and step 10% while at or below par, then whole units above it. Stepping a bag of flour by a whole bag per tap was useless.

**Drag.** Horizontal drag on the bar sets the value directly (`dragToAmount`). It snaps to 1 unit when par ≥ 4, 5% when par = 1, otherwise 0.1 unit. Starting a drag must not also fire a tap. Treat movement > 8px as a drag. Vertical movement > 10px before horizontal cancels and lets the list scroll.

**Long-press.** 500 ms on a row opens item detail. Tapping the item name also opens it (discoverable path).

**No undo.** Corrections are taps back.

**Auto-add** (`reconcileAutoEntry`). Runs after any change to amount, par, threshold, archive state, or leftover flag.
- Item set up, not a leftover, not archived, and low/out, with no open entry: add silently, qty = `restockQuantity` (fill to par, rounded up to whole units, min 1). Store = preferred store, else Unassigned.
- Open auto entry exists: keep its qty in step.
- Item back above threshold: remove the *unchecked auto* entry. **Open:** the brief is silent; this is the proposed default.
- Checked entries and manual entries are never touched by auto logic.

**The nag** (`missingForList`). Nothing is asked before it is needed. Prompt for missing fields (unit, par, preferred store) at the moment an item first needs to reach the list:
1. An auto-add happens and the item has no preferred store: add to Unassigned, then show a non-blocking bottom sheet "Where do you buy Chicken thighs?" with store chips + Skip. Picking one sets `preferredStoreId` and moves the entry.
2. The user adds a not-set-up item to the list (e.g. via the list's add field matching "Rice"): sheet asks for unit, par and store. Low threshold is not asked; it shows the 25% default.

Show the sheet once per item per session. Skipping is fine. **Open:** no mockup exists for this sheet. Build it in the same style as `OpenOne.dc.html`.

**Open one** (`openOne`). From item detail. Creates a linked leftover: name prefilled "<Parent>, opened", `isLeftover: true`, `parentId`. The user picks the unit and location. A freshly opened leftover is full. If the chosen unit is the parent's package unit, par and amount = package size (8 oz). If it's the parent's own unit, they're 1. Otherwise par is unset. "Take 1 from <parent>" is pre-checked and subtracts one from the parent. Unchecking it covers leftovers that didn't come from tracked stock.

**Archiving.** Sets `archivedAt`. Hidden from inventory, quick-add and search, recoverable. Archiving removes the item's unchecked auto entry. Nothing is ever hard-deleted from items.

**Deleting a location.** Its items get `locationId: null` and show under an "Unassigned" header at the bottom of inventory (only when non-empty). Deleting a group ungroups its locations (they keep their order). **Decided:** the brief only covers deleting locations.

**Deleting a store.** Items clear that preferred/secondary store; its list entries move to Unassigned.

**Staples.** Model + seed only in this build (they matter for recipes). **Open:** add a simple "Staples" list under Settings when convenient; no mockup.

## 4. Screens

Phone mockups are 390×844. Every screen respects safe-area insets. Bottom tab bar on top-level screens: **Inventory · List · Add · Settings**. The List tab shows a badge with the unchecked entry count.

### 4.1 Inventory `/` (Main.dc.html)
- Sticky top: search field (filters items by name across all locations, case-insensitive; results keep their location headers) and filter chips **All · Low · n · Out · n**.
- Body: sections in sortOrder. Ungrouped locations and groups share one top-level order. A group renders a slim 28px uppercase header with its low-or-out count, then its locations indented.
- Location header (44px, a button): chevron, name, amber "n low" pill when n > 0, item count. Tap collapses or expands. Persist collapsed state per location in localStorage.
- Item row (min 46px): category icon tile, name (2 lines max), status bar (full remaining width, 44px tap zone), cart glyph when the item has an unchecked list entry, amount label (60px, right-aligned, tabular).
- Not-set-up row: icon, name, "No amount tracked", **Set up** button → item detail.
- Empty location (All filter only): "Nothing stored here yet" + **Add item** → Quick add with that location preselected.
- Low/Out filters hide locations with no matches. If nothing matches, show "Nothing is low" / "Nothing is out".
- Leftovers sort directly after their parent when in the same location, otherwise normally. The name already says "opened".
- Acceptance: with seed data, 8+ item rows are visible at 390×844 without scrolling. **Open (from brief):** if headers eat too much room on a phone, groups collapse to a single line of tabs. Build the list version first and judge on a real phone.

### 4.2 Item detail `/item/:id` (DetailFull.dc.html, DetailSetup.dc.html)
- Top bar: back to Inventory, **Edit**. Fields are also individually tappable.
- Identity: 52px icon tile, name (24px), category with **Change** (opens a category picker grid; sets `categoryConfirmed`).
- Configured: large bar (22px track, 48px tap zone), "3 cans" / "of 8 cans", hint "Tap a half to step by one can. Drag to set an exact amount."
- Not set up: blue tint panel "Not tracked yet" + **Set unit & par**. No bar.
- Field rows (48px): Unit, Package size ("1 can = 8 oz"), Par, Low threshold (shows "default" when unset), Location ("Pantry · Shelf 1"), Preferred store, Secondary store. Unset fields read **Add** in blue. Each opens an edit sheet: number stepper + unit chips, location chips grouped like 4.6, store chips.
- Linked leftover card(s) when this item has leftovers. A leftover's detail shows "Opened from <parent>" linking back.
- **Open one** primary button (hidden on leftovers). **Archive item** text button. Archived items show **Restore** instead.

### 4.3 Open one sheet (OpenOne.dc.html)
Bottom sheet over item detail. Fields: Name (prefilled), Unit chips (can, oz, lb, bag, each + the parent's unit if different), Location chips, the "Take 1 can from Black beans" checkbox with live consequence text ("Black beans goes from 3 to 2 cans"). **Cancel**, **Create leftover** → navigates to the new leftover's detail.

### 4.4 Quick add `/add` (QuickAdd.dc.html, QuickAddNew.dc.html)
- Autofocused search. Typing matches existing (non-archived) items first, by name contains. Each match row shows its location, current amount and a **+1** button (applies one tap step). The last row is always **Create "<query>"**.
- No query: **Recent & frequent** grid of up to 9 chip-tiles (3 columns). Rank by the last 30 days of taps and edits, most recent first as tiebreak. A tap adds one step and shows "+n added" until you leave the screen.
- Create sheet: Name (prefilled from query) and Location only. Location chips are grouped (ungrouped first, then each group under its label). **Add another** (back to search, cleared, focused) and **Add & done** (→ Inventory). Category is guessed via `guessCategory`.
- Built for adding several items fast: never navigate away after a +1.

### 4.5 Shopping list `/list` (ShoppingList.dc.html)
- Header: title + **I just shopped** (→ 4.6). Manual add field + **Add**. If the text matches an existing item, offer it, which links the entry (triggers the nag if the item isn't set up). Otherwise create a manual entry. Optional quantity parsing: "4 lemons" → qty 4.
- One scrolling list, store headers (`groupListByStore`) with "n to get". No filtering.
- Row (56px): 44px checkbox, name, auto rows get a tinted background and a second line "Auto · low, back to 4 lb". Quantity on the right. A swap button moves the entry to the item's other store (only when the item has both stores and the row is unchecked).
- Checked rows grey out, strike through, and drop to the bottom of their own store group.
- Unassigned group at the bottom. **Export list** button at the end, wired to nothing (`// TODO export`).
- **Decided:** checked entries are cleared when a just-shopped run finishes (they've been logged). Otherwise they stay until then.

### 4.6 Just shopped `/shopped` (Shopped.dc.html, ShoppedDone.dc.html)
- Walks every list entry one at a time in list order (stores, then rows, including already-checked ones), with a segmented progress bar and "2 of 5".
- Card: store label, big name (36px), "List asked for 3 lb", quantity stepper (72px tall, ± 80px buttons) prefilled with the list qty, consequence text "On hand after: 4 lb" (or "Not tracked in inventory").
- **Skip** / **Confirm**. Confirm: `applyPurchase` on the linked item, mark the entry done. Skip: entry stays on the list unchecked.
- End of list: "That's the whole list." **Finish** → completion screen, or **Continue through the house**. That walks remaining non-archived, set-up items location by location with the same card, prefilled with the current amount and the label "Have now". Confirm sets the amount. Exit any time.
- Completion: "Trip logged", summary rows (+qty, "now 4 lb" / "untracked" / "Skipped"). Untracked manual purchases get "Add them so they're tracked next time?" → create sheet. **Back to inventory**.
- On finish: delete confirmed entries (and any checked ones). Skipped ones stay.

### 4.7 Settings `/settings/locations`, `/settings/stores` (SettingsLocations.dc.html, SettingsStores.dc.html)
- Segmented control Locations | Stores.
- Locations: rows in display order with drag handle, tappable name (inline rename), item count ("Empty"), delete. Group rows are tinted uppercase "Pantry · group" rows with their own handle. Their locations are indented beneath. Dragging a location into or out of a group's span changes its `groupId`. "Unassigned" is a fixed last row with no actions. **Add location**, **Add group**.
- Stores: name + "Preferred for n items · backup for n", drag, rename, delete, **Add store**.
- Delete asks for confirmation in a small sheet stating the consequence ("2 items will move to Unassigned"). Use an in-app sheet, not `window.confirm`.
- Drag-to-reorder: pointer-events based (works with touch), handle-only, 44px handles. `@dnd-kit` is acceptable.

### 4.8 Tablet (≥ 768px)
Two panes: list screens (Inventory, List, Settings) on the left at 380–420px, detail on the right (item detail, or an empty "Select an item" state). Tab bar becomes a left rail. Sheets become centred dialogs (max-width 480px). No separate mockups. Derive from the phone screens.

## 5. Non-functional

- **Offline:** app shell precached by the service worker. All data in IndexedDB, no network calls. Self-host the font for offline (see `tokens.css`).
- **Install:** web manifest (name "Pantry", theme `#1D5BD6`, background `#FFFFFF`, standalone, portrait). Include 192/512 icons. A placeholder generic icon is fine for now.
- **Performance:** a tap updates the bar within one frame. Write to IndexedDB optimistically, debounce rapid taps (~300 ms) into one write per item.
- **Accessibility:** WCAG AA contrast (tokens comply), bar as `role="slider"` with arrow keys, visible focus rings (2px `--color-primary` outline, 2px offset), `prefers-reduced-motion` disables bar transitions.
- **Data safety:** Settings gets "Export data (JSON)" / "Import data" for backup until sync exists (small, not mocked). **Open:** confirm this is wanted.

## 6. Decisions log (from design)

1. Light mode only for this build. Blue (`#1D5BD6`) for buttons, navigation, links and selection.
2. Typeface IBM Plex Sans: calm and practical, not a default system look.
3. Low threshold is inclusive.
4. Single-container (par = 1) items display as % and tap-step 10%.
5. Restock quantity rounds up to whole units.
6. Unchecked auto entries are removed when the item recovers (open, see §3).
7. Mockup copy "1 can = 15 oz" changed to the brief's "1 can = 8 oz" so the 8 oz leftover par lines up.
8. Lemons, Tortillas, Dish soap and the "Floor bin" location are invented demo data (see `seed.ts`).

### Decisions made during the build (owner, Oct 2026)

9. **Data:** first open loads the sample data automatically (for testing). Settings → More has Reset to sample data / Erase everything, Export / Import (JSON backup), and the build version with Check for updates.
10. **Locations:** an item's location can be Unassigned from the start; every location picker offers Unassigned and an inline "New location". No dead end on a blank pantry.
11. **New item sheet:** name and location are still all that's required, but an optional "Add unit, par and store now" section sets an item up completely at creation.
12. **Delete:** Archive stays the default; archived items can then be deleted permanently (item screen and Settings → More). This relaxes "never hard-deleted" in §3.
13. **Categories** are user-maintained (Settings → Categories): name, icon from the built-in set, and "words that pick it" for guessing. Deleting one moves its items to Other; Other can't be deleted. Built-in ids are the old keys (Dexie v3 migration).
14. **Settings** has four sections: Locations | Stores | Categories | More.
15. **Checked-off list rows** use `--color-text-muted`, not `--color-text-disabled`: the latter is 3:1 on white and failed the WCAG AA audit.
16. **Tablet:** opening an item keeps the list that opened it on the left; the detail pane's top-left action is Close.

## 7. Out of scope, but keep the model ready

- **Instacart:** `Store.onInstacart` exists. A future export would send one store's portion at a time.
- **Barcode scanning:** manual entry must always work. Don't design around scanning.
- **Recipes:** typed first, URL import later. Cooking never decrements stock. "Almost makeable" = up to 3 missing. Staples are excluded from matching, other untracked ingredients count as missing. Parent + leftovers count together via `combinedAmountInPackageUnit`.
- **Photos:** category icons only.
- **Sync / multi-user:** keep all writes behind the repository so a sync layer can slot in. Use UUID ids and `updatedAt` on every record for later conflict resolution. Only `Item` has it in `types.ts` today, so add it to the other entities when you write the Dexie schema. No screen changes expected.
- **Dark mode:** tokens are semantic. Add a dark block later.
