import { describe, expect, it } from 'vitest';
import {
  alternateStore, applyPurchase, applyTap, ariaValueText, combinedAmountInPackageUnit, dragToAmount,
  effectiveThreshold, fillFraction, formatAmount, getStatus, groupListByStore, missingForList, openOne,
  reconcileAutoEntry, restockQuantity, shouldAutoList, tickPositions,
} from './rules';
import { seedItems, seedListEntries, seedStores } from './seed';
import type { Item } from './types';

const byId = (id: string) => seedItems.find((i) => i.id === id)!;
const withAmount = (id: string, amount: number): Item => ({ ...byId(id), amount });

describe('status', () => {
  it('defaults threshold to 25% of par', () => {
    expect(effectiveThreshold(byId('it-blackbeans'))).toBe(2);
    expect(effectiveThreshold({ par: 8, lowThreshold: 3 })).toBe(3);
    expect(effectiveThreshold(byId('it-rice'))).toBeUndefined();
  });
  it('classifies the sample data as the mockups show', () => {
    expect(getStatus(byId('it-blackbeans'))).toBe('ok');
    expect(getStatus(byId('it-chicken'))).toBe('low'); // 1 of 4 is exactly at threshold
    expect(getStatus(byId('it-coffee'))).toBe('low');
    expect(getStatus(byId('it-flour'))).toBe('ok');
    expect(getStatus(byId('it-rice'))).toBe('untracked');
    expect(getStatus(withAmount('it-eggs', 0))).toBe('out');
  });
  it('fills and ticks', () => {
    expect(fillFraction(byId('it-blackbeans'))).toBe(3 / 8);
    expect(fillFraction(withAmount('it-blackbeans', 12))).toBe(1);
    expect(tickPositions(byId('it-butter'))).toEqual([0.25, 0.5, 0.75]);
    expect(tickPositions(byId('it-flour'))).toEqual([]);
  });
});

describe('bar interactions', () => {
  it('steps one unit, never below zero', () => {
    expect(applyTap(byId('it-blackbeans'), 1)).toBe(4);
    expect(applyTap(byId('it-blackbeans'), -1)).toBe(2);
    expect(applyTap(byId('it-coffee'), -1)).toBe(0);
    expect(applyTap(byId('it-coffee'), 1)).toBe(1.5);
  });
  it('steps single containers by 10% up to par, then whole units', () => {
    expect(applyTap(byId('it-flour'), 1)).toBe(0.5);
    expect(applyTap(withAmount('it-flour', 1), 1)).toBe(2);
    expect(applyTap(withAmount('it-flour', 2), -1)).toBe(1);
    expect(applyTap(withAmount('it-flour', 0.05), -1)).toBe(0);
  });
  it('drag snaps', () => {
    expect(dragToAmount(byId('it-blackbeans-open'), 5 / 8)).toBe(5);
    expect(dragToAmount(byId('it-milk'), 0.43)).toBe(0.9);
    expect(dragToAmount(byId('it-oil'), 0.33)).toBe(0.35);
    expect(dragToAmount(byId('it-oil'), 2)).toBe(1);
  });
});

describe('formatting', () => {
  it('labels match the mockups', () => {
    expect(formatAmount(byId('it-blackbeans'))).toBe('3 cans');
    expect(formatAmount(byId('it-milk'))).toBe('1 gal');
    expect(formatAmount(byId('it-eggs'))).toBe('9 each');
    expect(formatAmount(byId('it-butter'))).toBe('2 sticks');
    expect(formatAmount(byId('it-coffee'))).toBe('½ bag');
    expect(formatAmount(withAmount('it-coffee', 1.5))).toBe('1½ bags');
    expect(formatAmount(byId('it-flour'))).toBe('40%');
    expect(formatAmount(withAmount('it-flour', 1.4))).toBe('1.4 bags');
    expect(formatAmount(byId('it-rice'))).toBe('');
  });
  it('aria text', () => {
    expect(ariaValueText(byId('it-blackbeans'))).toBe('3 cans of 8');
    expect(ariaValueText(byId('it-chicken'))).toBe('1 lb of 4, low');
    expect(ariaValueText(byId('it-oil'))).toBe('70%');
  });
});

describe('shopping list', () => {
  it('restock fills back to par in whole units', () => {
    expect(restockQuantity(byId('it-chicken'))).toBe(3);
    expect(restockQuantity(byId('it-coffee'))).toBe(2);
    expect(restockQuantity(byId('it-flour'))).toBe(1);
    expect(restockQuantity(byId('it-rice'))).toBeUndefined();
  });
  it('leftovers, archived and untracked items never auto-add', () => {
    expect(shouldAutoList(withAmount('it-blackbeans-open', 0))).toBe(false);
    expect(shouldAutoList({ ...byId('it-coffee'), archivedAt: 1 })).toBe(false);
    expect(shouldAutoList(byId('it-rice'))).toBe(false);
    expect(shouldAutoList(byId('it-coffee'))).toBe(true);
  });
  it('adds silently when an item drops to threshold', () => {
    const act = reconcileAutoEntry(withAmount('it-blackbeans', 2), []);
    expect(act.type).toBe('add');
    if (act.type === 'add') {
      expect(act.entry).toMatchObject({ itemId: 'it-blackbeans', quantity: 6, storeId: 'st-costco', source: 'auto' });
      expect(act.promptForStore).toBe(false);
    }
  });
  it('asks for a store when there is none', () => {
    const noStore = { ...withAmount('it-blackbeans', 1), preferredStoreId: undefined };
    const act = reconcileAutoEntry(noStore, []);
    expect(act.type === 'add' && act.promptForStore && act.entry.storeId === null).toBe(true);
  });
  it('updates, removes, and leaves checked/manual entries alone', () => {
    const entry = seedListEntries.find((e) => e.id === 'le-chicken')!;
    expect(reconcileAutoEntry(withAmount('it-chicken', 0), [entry])).toEqual({ type: 'update', entryId: 'le-chicken', quantity: 4 });
    expect(reconcileAutoEntry(withAmount('it-chicken', 1), [entry])).toEqual({ type: 'none' });
    expect(reconcileAutoEntry(withAmount('it-chicken', 3), [entry])).toEqual({ type: 'remove', entryId: 'le-chicken' });
    expect(reconcileAutoEntry(withAmount('it-chicken', 3), [{ ...entry, checked: true }])).toEqual({ type: 'none' });
    expect(reconcileAutoEntry(withAmount('it-chicken', 3), [{ ...entry, source: 'manual' }])).toEqual({ type: 'none' });
  });
  it('the nag lists missing fields', () => {
    expect(missingForList(byId('it-rice'))).toEqual(['unit', 'par', 'preferredStore']);
    expect(missingForList(byId('it-chicken'))).toEqual([]);
  });
  it('groups by store order, Unassigned last, checked items sink', () => {
    const groups = groupListByStore(seedListEntries, seedStores);
    expect(groups.map((g) => g.name)).toEqual(['Costco', 'Fred Meyer', "Trader Joe's", 'Unassigned']);
    expect(groups[2].entries.map((e) => e.name)).toEqual(['Coffee beans', 'Tortillas']);
    const moreChecked = seedListEntries.map((e) => (e.id === 'le-coffee' ? { ...e, checked: true, checkedAt: 99 } : e));
    expect(groupListByStore(moreChecked, seedStores)[2].entries.map((e) => e.name)).toEqual(['Tortillas', 'Coffee beans']);
  });
  it('moves to the other store', () => {
    const entry = seedListEntries.find((e) => e.id === 'le-chicken')!;
    expect(alternateStore(entry, byId('it-chicken'))).toBe('st-fredmeyer');
    expect(alternateStore({ ...entry, storeId: 'st-fredmeyer' }, byId('it-chicken'))).toBe('st-costco');
    expect(alternateStore(entry, byId('it-milk'))).toBeUndefined();
  });
});

describe('just shopped & open one', () => {
  it('purchases add to on hand', () => {
    expect(applyPurchase(byId('it-coffee'), 2)).toBe(2.5);
  });
  it('open one makes a full linked leftover and takes one from the parent', () => {
    const { leftover, parentAmount } = openOne(byId('it-blackbeans'), { unit: 'oz', locationId: 'loc-fridge', subtractFromParent: true });
    expect(leftover).toMatchObject({ name: 'Black beans, opened', isLeftover: true, parentId: 'it-blackbeans', par: 8, amount: 8 });
    expect(parentAmount).toBe(2);
    expect(openOne(byId('it-blackbeans'), { locationId: null, subtractFromParent: false }).parentAmount).toBe(3);
  });
  it('sums parent and leftovers in package units', () => {
    expect(combinedAmountInPackageUnit(byId('it-blackbeans'), [byId('it-blackbeans-open')])).toBe(28);
    expect(combinedAmountInPackageUnit(byId('it-milk'), [])).toBeUndefined();
  });
});
