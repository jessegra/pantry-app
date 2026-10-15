# Pantry — project guide for Claude Code

A phone-first home pantry inventory app. See where food is, see what's low at a glance, tap a bar to adjust what's on hand, let the shopping list build itself, log what was bought after a trip.

Read these before writing code:

1. `docs/SPEC.md`: what to build. Data model, behaviour rules, every screen with acceptance criteria, and the decisions already made.
2. `docs/PLAN.md`: build order in milestones. Work one milestone at a time and stop at its checkpoint.
3. `docs/DESIGN.md`: visual system (tokens, type, components, layout numbers).
4. `design/screens/*.dc.html`: the approved mockups, one file per screen (markup reference, see below).
5. `docs/BRIEF.md`: the original design brief. SPEC.md wins where they differ.

## Stack (decided)

- Vite + React 18 + TypeScript (strict)
- React Router for screens
- Dexie (IndexedDB) for local-first storage, `dexie-react-hooks` `useLiveQuery` for reads
- `vite-plugin-pwa` for install + offline (app shell precached)
- Plain CSS with custom properties from `src/styles/tokens.css`, CSS Modules per component. No Tailwind, no UI kit.
- Vitest + Testing Library for unit/component tests, Playwright for a few end-to-end flows

Already written and tested, use as-is and extend:

- `src/domain/types.ts`: data model types
- `src/domain/rules.ts`: pure behaviour rules (status, steps, restock qty, list reconciliation, formatting)
- `src/domain/rules.test.ts`: tests for the above (`npx vitest run`)
- `src/domain/seed.ts`: sample data for first run and tests
- `src/ui/icons.ts`: category icon paths + `guessCategory(name)`
- `src/styles/tokens.css`: design tokens

## Rules of the road

- **Light mode only for this build.** Tokens are named semantically so dark mode can be added later by redefining them; don't hard-code hex values in components.
- **All behaviour logic lives in `src/domain/` as pure functions with tests.** Components call them; they don't re-implement status/threshold/rounding maths.
- **Storage goes through a repository layer** (`src/data/`), never Dexie calls inside components. A sync layer will be added later without changing screens.
- **Minimum 44×44px tap targets.** The status bar's tap zone is the full row height, split into left/right halves.
- **Accessibility:** real `<button>`, `<a>`, `<input>`+`<label>`; `aria-label` on icon-only buttons; the bar exposes `role="slider"` with `aria-valuenow/min/max` and `aria-valuetext` ("3 cans of 8"); arrow keys step it.
- **No fake iOS status bar or keyboard.** Respect `env(safe-area-inset-*)`.
- **No undo.** A mis-tap is corrected by tapping back.
- Out of scope: Instacart, barcode scanning, recipes, photos, sync and multi-user, dark mode. Keep the model ready for them (see SPEC §7); don't build UI for them.

## About the mockup files

`design/screens/*.dc.html` were made in a design canvas. They only render inside that canvas (they load the canvas's `support.js`), so read them as **markup and style reference**: layout, exact spacing, sizes, colours, copy, and the small `renderVals()` logic that drives the interactive ones. Don't copy their structure literally. Rebuild them as React components. The live, clickable canvas is linked in `docs/DESIGN.md`.

| Mockup | Route |
| --- | --- |
| `Main.dc.html` | `/` Inventory |
| `DetailFull.dc.html`, `DetailSetup.dc.html` | `/item/:id` |
| `OpenOne.dc.html` | sheet over `/item/:id` |
| `QuickAdd.dc.html`, `QuickAddNew.dc.html` | `/add` (+ create sheet) |
| `ShoppingList.dc.html` | `/list` |
| `Shopped.dc.html`, `ShoppedDone.dc.html` | `/shopped` |
| `SettingsLocations.dc.html`, `SettingsStores.dc.html` | `/settings/locations`, `/settings/stores` |
| (no mockup) | `/settings/categories`, `/settings/more` |

Decisions made after the mockups are logged in `docs/SPEC.md` §6 ("Decisions made during the build").

## Checks

- `npm test`: unit + component tests (Vitest, jsdom, fake-indexeddb).
- `npm run e2e`: Playwright against the production build: offline core loop, install criteria, and an axe (WCAG 2.2 AA) + 44px tap-target audit of every screen at phone and tablet sizes. CI runs all of it before publishing to GitHub Pages.

## Commands (once scaffolded in Milestone 1)

```
npm run dev        # local dev server
npm run build      # production build incl. service worker
npm run test       # vitest
npm run e2e        # playwright
npm run lint
```

Test on a phone-sized viewport (390×844) first; tablet (≥768px) is a two-pane layout of the same screens.
