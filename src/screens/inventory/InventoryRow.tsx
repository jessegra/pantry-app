import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { repo } from '../../data/repo';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { useCategory } from '../../app/categories';
import { useNag } from '../../app/nag';
import { useOptimisticAmount } from '../../data/useOptimisticAmount';
import type { InventoryRow as Row } from '../../domain/inventory';
import { formatAmount, getStatus, isSetUp } from '../../domain/rules';
import { Icon } from '../../ui/Icon';
import { StatusBar } from '../../ui/StatusBar';
import { useLongPress } from '../../ui/useLongPress';
import styles from './Inventory.module.css';

export function InventoryRow({ row }: { row: Row }) {
  const { item } = row;
  const navigate = useNavigate();
  const href = `/item/${item.id}`;
  const open = () => navigate(href);
  const longPress = useLongPress(open);
  const category = useCategory(item.category);

  return (
    <div className={styles.row} {...longPress}>
      <span className={styles.iconTile}>
        <Icon path={category.icon} size={18} strokeWidth={1.6} />
      </span>
      <Link to={href} className={styles.name} draggable={false}>
        {item.name}
      </Link>
      {isSetUp(item) ? <TrackedPart row={row} onLongPress={open} /> : <SetUpPart href={href} />}
    </div>
  );
}

function TrackedPart({ row, onLongPress }: { row: Row; onLongPress: () => void }) {
  const { item } = row;
  const nag = useNag();
  const [amount, setAmount] = useOptimisticAmount(item, (change) => nag.report(item.id, change));
  const current = { ...item, amount };
  const [removing, setRemoving] = useState(false);
  // A used-up leftover: a trash can instead of "0 oz", to clear it away.
  const usedUp = item.isLeftover && amount <= 0;
  return (
    <>
      <StatusBar item={item} amount={amount} onChange={setAmount} onLongPress={onLongPress} />
      <span className={styles.cartSlot}>
        {row.onList && (
          <span role="img" aria-label="On shopping list" className={styles.cart}>
            <Icon name="cart" size={16} strokeWidth={2} />
          </span>
        )}
      </span>
      {usedUp ? (
        <button
          type="button"
          className={styles.removeLeftover}
          aria-label={`Remove ${item.name}`}
          onClick={() => setRemoving(true)}
        >
          <Icon name="trash" size={18} strokeWidth={1.8} />
        </button>
      ) : (
        <span className={styles.amount} data-status={getStatus(current)}>
          {formatAmount(current)}
        </span>
      )}
      {removing && (
        <ConfirmSheet
          title={`Remove ${item.name}?`}
          consequence="It's used up: this clears it from the pantry for good."
          confirmLabel="Remove"
          onConfirm={() => repo.deleteLeftover(item.id)}
          onClose={() => setRemoving(false)}
        />
      )}
    </>
  );
}

function SetUpPart({ href }: { href: string }) {
  return (
    <>
      <span className={styles.untracked}>No amount tracked</span>
      <Link to={href} className={styles.setUp}>
        Set up
      </Link>
    </>
  );
}
