# Build plan

Work one milestone at a time. Each ends at a **checkpoint**: tests pass, `npm run build` succeeds, and the owner can try it on a phone. Stop there and summarise what changed before starting the next one. Commit at each checkpoint.

## M1 — Scaffold
- `npm create vite@latest . -- --template react-ts` around the existing `src/domain`, `src/ui`, `src/styles` files. Don't overwrite them.
- Add: react-router-dom, dexie, dexie-react-hooks, vite-plugin-pwa, vitest, @testing-library/react, @testing-library/user-event, jsdom, @playwright/test, eslint + prettier.
- Scripts: dev, build, preview, test, e2e, lint. TS `strict: true`.
- Import `tokens.css` once in `main.tsx`. Self-host IBM Plex Sans (400/500/600 woff2) and remove the Google Fonts import.
- App shell: routes from CLAUDE.md, placeholder screens, the bottom tab bar (DESIGN.md), safe-area padding.
- PWA manifest + service worker (precache app shell).
- **Checkpoint:** existing domain tests pass under the new config. The app installs to the home screen and opens offline to the tab bar.

## M2 — Data layer
- Dexie schema v1 (SPEC §2), `src/data/db.ts`.
- Repository `src/data/repo.ts`: CRUD + intent methods (`setAmount`, `tap`, `createItem`, `updateItem`, `archiveItem`, `restoreItem`, `openOne`, `addListEntry`, `toggleEntry`, `moveEntryToAlternate`, `logPurchase`, `finishTrip`, location/group/store add, rename, reorder, delete). Each runs `reconcileAutoEntry` where SPEC §3 says, inside one transaction.
- Hooks: `useInventory()` (sections → locations → items, computed status), `useItem(id)`, `useShoppingList()`, `useLocations()`, `useStores()`.
- First-run: empty DB offers "Start empty" or "Load sample data" (`seed.ts`). Dev builds can auto-seed.
- Tests: repo tests with `fake-indexeddb`. Tap to threshold → entry appears. Recover → entry removed. Leftover never listed. Delete location → items Unassigned. Delete store → entries Unassigned.
- **Checkpoint:** repo test suite green.

## M3 — Status bar + Inventory
- `StatusBar` component: tap halves, drag (pointer events, 8px slop, vertical-scroll cancel), long-press on the row, slider a11y + arrow keys, reduced-motion.
- Inventory screen per SPEC §4.1: search, filter chips, group/location headers with collapse (persisted), item rows, set-up rows, empty state, cart glyph, Unassigned section.
- Component tests: tapping changes the label; dropping Black beans to 2 shows the cart glyph and bumps the List badge; Low filter shows Chicken thighs and Coffee beans only.
- **Checkpoint:** compare against `Main.dc.html` at 390×844. 8+ rows visible.

## M4 — Item detail + Open one + the nag
- Detail (configured / not set up / leftover / archived variants), field edit sheets, category picker, Archive/Restore.
- Open one sheet (SPEC §4.3).
- Nag sheet (SPEC §3): store prompt after an auto-add with no store; full set-up prompt when a not-set-up item is added to the list.
- **Checkpoint:** compare against `DetailFull`, `DetailSetup`, `OpenOne`.

## M5 — Quick add
- Search-first, matches + Create row, recent & frequent grid (track tap/edit events in a small `activity` table), create sheet with grouped location chips, guessed category.
- **Checkpoint:** you can add five new items in under 30 seconds one-handed.

## M6 — Shopping list
- Store groups, checkbox ordering, auto vs manual styling, move to secondary store, manual add with item matching, Unassigned, Export placeholder.
- **Checkpoint:** compare against `ShoppingList.dc.html`.

## M7 — Just shopped
- Step-through flow, progress, stepper, Skip/Confirm, end-of-list choice, "continue through the house" walk, completion summary, finish clears logged entries.
- Playwright e2e: seed → Black beans to 2 → list shows Black beans 6 cans at Costco → just shopped, confirm all → inventory shows full bars, list empty except skipped.
- **Checkpoint:** full core loop works offline.

## M8 — Settings
- Locations & groups and Stores management with drag-to-reorder (handles), inline rename, delete with consequence sheet. Data export/import JSON.
- **Checkpoint:** compare against both Settings mockups. Reorder is reflected on Inventory and List.

## M9 — Tablet + polish
- Two-pane layout ≥ 768px (SPEC §4.8), dialogs instead of sheets, rail nav.
- A11y pass (axe in Playwright), focus management for sheets, 44px audit, Lighthouse PWA check.
- Revisit the open questions in SPEC (search "**Open:**").
