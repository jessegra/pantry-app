import { Link, useNavigate } from 'react-router-dom';
import { useOptimisticAmount } from '../../data/useOptimisticAmount';
import type { InventoryRow as Row } from '../../domain/inventory';
import { formatAmount, getStatus, isSetUp } from '../../domain/rules';
import { CATEGORY_ICONS } from '../../ui/icons';
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

  return (
    <div className={styles.row} {...longPress}>
      <span className={styles.iconTile}>
        <Icon path={CATEGORY_ICONS[item.category]} size={18} strokeWidth={1.6} />
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
  // TODO(M4): when a commit reports promptForStore, open the "Where do you buy…?" sheet.
  const [amount, setAmount] = useOptimisticAmount(item);
  const current = { ...item, amount };
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
      <span className={styles.amount} data-status={getStatus(current)}>
        {formatAmount(current)}
      </span>
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
