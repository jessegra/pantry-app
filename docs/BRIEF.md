# Pantry App — Design Brief

Oct 12, 2026

## Overview

A home pantry inventory app: track what food is on hand, where it's stored, and what needs buying. Single user to start, built so a shared household can be added later.

Phone-first, designed for one-handed use while standing in a kitchen. Tablet is the same screens in a wider two-pane layout. Desktop is not a design target. Works offline, syncing when a connection returns.

The core loop: see what's low at a glance, tap a bar to adjust what's on hand, let the shopping list build itself, then log what was bought after a trip.

## Data model

Every item is one name, one unit, one par, one location, one bar. There is no sealed-versus-open duality inside an item. A half-used can is simply a second item, in a different unit and usually a different location, linked back to its parent.

| Field | Required at creation | Notes |
| --- | --- | --- |
| Name | Yes | Free text |
| Location | Yes | Exactly one |
| Unit | No | can, oz, lb, bag, each |
| Package size | No | 1 can = 8 oz; needed later for recipe totals |
| Par | No | Sets the full end of the bar |
| Low threshold | No | Defaults to 25% of par |
| Preferred store | No | Prompted when the item first reaches the shopping list |
| Secondary store | No | Switchable while shopping |
| Category | No | Guessed from the name, drives the icon |
| Leftover flag | No | Set by the "open one" shortcut; blocks auto-add |
| Parent link | No | Ties a leftover to the item it came from |

Only name and location are required. Everything else is filled in later, when the app asks.

**Locations** are a flat, user-maintained list. Each can belong to an optional group, which is a display header only. So "Shelf 1", "Shelf 2" and "Floor bin" can sit under a "Pantry" group while an item still belongs to exactly one location. Groups and locations can be added, renamed, reordered by dragging, and deleted. Deleting a location moves its items to Unassigned.

**Stores** are their own managed list, maintained the same way.

**Categories** exist only to pick an icon. Guessed from the item name, correctable, falling back to a generic icon.

## Status bar

One component, used identically everywhere. A continuous fill showing current amount against par, with tick marks at whole-unit boundaries.

Three interactions:

1. Tap the right half to increase by one step, the left half to decrease by one step. A step is one unit of whatever the item is measured in, so one tap is one can on an 8-can item and one ounce on an 8 oz item.
2. Drag a finger along the bar to set any value directly, for odd amounts like 5 oz left.
3. Long-press to open item detail.

Colour follows state: normal above the threshold, amber below it, red at zero. A text label sits beside every bar reading amount and unit, because colour alone fails in bad kitchen lighting.

Items created with only a name and location have no par yet, so there is no bar to draw. They render instead as a plain row with a "set up" action in place of the bar.

No undo is needed. A mis-tap is corrected by tapping back.

## Screens

**Inventory (home).** Items under collapsible location headers, nested inside optional group headers. Each row: category icon, item name, status bar, amount label, and a badge when the item is already on the shopping list. Sticky search at the top. Filter chips for All, Low, Out. Headers show a count of low-or-out items. Needs the empty state for a location with no items, and the "set up" row for an incomplete item.

**Item detail.** Identity block with icon, name, category. Fields for unit, package size, par, low threshold, location, preferred and secondary store. An "open one" action that creates a leftover item. Archive action. Show this with a fully configured item and with a half-configured one.

**Quick add.** Built for adding several items fast. Search at the top that matches existing items first and offers "create new" when nothing matches. Below it, a grid of recent and frequent items as one-tap chips. Creating an item asks for name and location only.

**Just-shopped mode.** One item at a time through the shopping list. Big item name, a quantity field prefilled with the amount the list asked for, confirm and skip actions, progress indicator. On finishing the list, an option to continue through the rest of the house. Completion screen.

**Shopping list.** One scrolling list grouped under store headers, no filtering. Each row has a checkbox, name, and quantity to buy. Auto-added items look different from manually added ones. An action to move an item to its secondary store. Checked items grey out and drop to the bottom of their own store group. Manual add field. Unassigned group at the bottom. A placeholder "Export list" button, wired to nothing.

**Settings.** Two management screens, one for locations and groups, one for stores. Both support add, rename, drag-to-reorder, delete.

## Behaviour rules

**Auto-add.** When an item falls below its threshold it is added to the shopping list silently, with a quantity set to whatever fills it back to par. No approval step. Leftover items never auto-add.

**Thresholds.** Per item, defaulting to 25% of par. Only touched on items where that default is wrong.

**The nag.** Items created with just a name and location are prompted for their missing fields at the moment they first need to reach the shopping list, since that is when par, threshold and store all become necessary. Nothing is asked before it is needed.

**Open one.** On an item's detail screen, this creates a linked leftover item, prefilling the name and marking it as a leftover. The user sets unit and location. A pre-checked option subtracts one from the parent, which can be unchecked when logging a leftover that did not come from tracked stock.

**Archiving.** Items are archived, not deleted. Hidden from inventory, recoverable.

**Staples.** A separate editable list sitting outside inventory, seeded with salt, pepper, oil, butter, water, sugar and flour. Anything on it is assumed always on hand and never counts against a recipe.

## Out of scope for this prototype

**Instacart.** Decided against for now. Worth knowing it is buildable later: Instacart's Developer Platform has a shopping-list endpoint that returns a shareable link, where the user picks a store and reviews matched products. It handles one retailer at a time, so a multi-store list would be sent in separate portions. The store record should carry a flag for whether that store is on Instacart.

**Barcode scanning.** Only if it turns out to be easy. It needs a product database lookup, and browser support is unreliable on iPhone, so a manual path has to exist regardless.

**Recipes.** Not in the prototype, but the model anticipates them. Recipes will be typed first, imported from URLs later. Cooking never decrements stock. A recipe counts as almost-makeable at up to three missing ingredients. Staples are excluded from matching; any other untracked ingredient counts as missing. Linked parent and leftover items count together, which is why items carry a package size.

**Photos.** Category icons only.

**Sync and multi-user.** Local-first storage now, sync layer later. No screens change.

## Visual direction

Calm and utilitarian, not playful. Dense enough to show eight to ten items per screen without scrolling. Dark mode supported. Minimum 44px tap targets, with generous tap zones on the status bar since it is the most-used control in the app.

Use realistic sample data rather than placeholders:

- Black beans, 3 cans, Pantry Shelf 1, par 8
- Black beans opened, 4 oz, Refrigerator, par 8 oz, leftover
- Milk, 1 gallon, Refrigerator, par 2
- Eggs, 9 each, Refrigerator, par 12
- Butter, 2 sticks, Refrigerator Drawer, par 4
- Flour, 40%, Kitchen Cabinet Left, par 1 bag
- Olive oil, 70%, Kitchen Cabinet Left, par 1 bottle
- Frozen peas, 2 bags, Deep Freeze, par 3
- Chicken thighs, 1 lb, Deep Freeze, par 4
- Coffee beans, low, Pantry Shelf 2, par 2
- Rice, name and location only, no par set

Sample locations, since the real ones are user-maintained: Refrigerator, Refrigerator Drawer, Deep Freeze, and a Pantry group containing Shelf 1 and Shelf 2, plus Kitchen Cabinet Left. Sample stores: Costco, Fred Meyer, Trader Joe's.

One thing to watch when the mockups come back: whether the inventory list stays readable with groups, locations, and incomplete items all nested together. If the headers eat too much room on a phone, groups collapse to a single line of tabs instead.
