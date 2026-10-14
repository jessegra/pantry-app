# Pantry — visual system

**Live mockups (clickable, private to Jesse):** https://claude.ai/artifact/JnyHdz51Pz7KKB4nnGYQXA
**Markup reference:** `design/screens/*.dc.html` (only renders inside the canvas, so read it as source)
**Tokens:** `src/styles/tokens.css`

## Direction

Calm and practical, not playful. White ground, near-black text, one blue for everything you can act on (buttons, navigation, links, selection). Amber and red are reserved for stock status. Dense: 8–10 items per phone screen. Flat. Hairline dividers instead of cards, almost no shadows, no gradients, no emoji.

## Type

IBM Plex Sans 400/500/600. Tabular numbers for every amount and count.

| Use | Size / weight |
| --- | --- |
| Screen title | 22 / 600 |
| Item detail name | 24 / 600 |
| Just-shopped name | 36 / 600, line-height 1.1 |
| Row name | 15 / 400 (detail values 500) |
| Amount label | 14 / 500, low/out 600 + tinted |
| Captions, counts | 13 / 400, `--color-text-muted` |
| Section labels | 12 / 600, uppercase, +0.06em |
| Nav labels | 12 / 500, active 600 blue |
| Inputs | 16 (prevents iOS zoom) |

## Components

**StatusBar** (the most-used control)
- Track 14px tall, radius 7, `--color-bar-track`. Fill is the same height, colour by status, 120ms width transition.
- Ticks: 2px white lines at whole units, drawn over the fill (`repeating-linear-gradient` or absolutely positioned spans).
- Tap zone: full row height (≥ 44px) × full bar width, split into two invisible halves (`<button aria-label="Use one can of Black beans">` / `"Add one…"`). For a11y, the wrapper is `role="slider"`.
- Large variant (item detail): 22px track, 48px zone.

**InventoryRow:** `[30px icon tile] 10px [name 108px, 2 lines] 10px [bar flex:1] 10px [16px cart slot] 10px [label 60px right]`, padding 0 16px, min-height 46, row divider `--color-border-row`.

**LocationHeader:** 44px button, chevron (rotates 90° when open), name 15/600, low pill (`--color-bg-low` / `--color-text-low`, 12/600, radius pill), count. Indent 24px inside a group, else 12px.

**GroupHeader:** 28px, `--color-surface-muted`, uppercase label, low count in `--color-text-low`.

**Chips:** 44px tall, radius pill, 14/600. Off: white, `--color-border-chip`. On: blue fill, white text, `aria-pressed`.

**Buttons:** primary = blue fill, white 600 text, radius 10 (12 for 56px buttons). Secondary = white, 1px blue border, blue text. Neutral = white, `--color-border-control`, dark text. Text button = no border. Heights 44 / 48 / 56.

**Field row (detail):** 48px, label `--color-text-secondary` left, value 500 right, chevron `--color-text-disabled`. Unset value = blue "Add".

**Bottom sheet:** radius 16 top, 5×36 grabber, 16px padding, 18px gap, scrim behind. Focus-trapped, Esc / scrim tap closes.

**Tab bar:** 4 equal columns, 52px items + safe-area bottom padding, top hairline, icon 22px stroke 1.9, label 12. Count badge on List: 18px blue pill, white 11/600.

**List row:** 56px; checkbox 24px box (radius 6, 2px border `--color-text-secondary`, checked = grey fill + white tick) in a 44px button; auto rows `--color-primary-wash` background + "Auto ·" caption with refresh glyph in `--color-primary-hover`.

**Segmented control:** track `--color-surface-input`, padding 4, radius 12; segment 40px, radius 9; selected = white + `--shadow-raised` + blue 600 text.

## Icons

`src/ui/icons.ts`: 24px viewBox, stroke-only, round caps and joins. Category icons stroke 1.6 in `--color-icon` on a `--color-surface-input` tile (30px, radius 8; 52px / radius 12 in detail). UI glyphs stroke 1.8–2.

## Layout

- 16px side gutter everywhere. Top content starts below the safe area (the mockups reserve 48px).
- Scroll regions are the middle band only. Search, chips and tab bar stay fixed.
- Tablet: see SPEC §4.8.
