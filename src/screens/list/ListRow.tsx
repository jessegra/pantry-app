import { repo } from '../../data/repo';
import { useWhoDid } from '../../data/sync';
import { autoReason } from '../../domain/list';
import { alternateStore, formatQuantity } from '../../domain/rules';
import type { Item, ListEntry, Store } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import styles from './List.module.css';

interface Props {
  entry: ListEntry;
  item?: Item;
  stores: Store[];
  onOpen: () => void;
}

/** 56px row: checkbox, name (+ "Auto · …" line), quantity, swap-store button. */
export function ListRow({ entry, item, stores, onOpen }: Props) {
  const { checked } = entry;
  const auto = entry.source === 'auto';
  const alt = checked ? undefined : alternateStore(entry, item);
  const altName = alt ? stores.find((s) => s.id === alt)?.name : undefined;
  const reason = auto ? autoReason(item) : '';
  // Someone else's addition: "Added by Kim". Your own and the automatic ones say nothing.
  const who = useWhoDid()(entry.createdBy);
  const addedBy = !auto && who && who !== 'you' ? who : null;

  return (
    <div className={styles.row} data-auto={auto && !checked} data-checked={checked}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${checked ? 'Uncheck' : 'Check off'} ${entry.name}`}
        className={styles.check}
        onClick={() => void repo.toggleEntry(entry.id)}
      >
        <span className={styles.box}>{checked && <Icon name="check" size={14} strokeWidth={3.2} />}</span>
      </button>
      <button type="button" className={styles.main} onClick={onOpen}>
        <span className={styles.name}>{entry.name}</span>
        {auto && (
          <span className={styles.autoLine}>
            <Icon name="auto" size={12} strokeWidth={2.4} />
            Auto{reason && ` · ${reason}`}
          </span>
        )}
        {addedBy && <span className={styles.byLine}>Added by {addedBy}</span>}
      </button>
      <span className={styles.qty}>{formatQuantity(entry.quantity, entry.unit)}</span>
      {altName ? (
        <button
          type="button"
          className={styles.move}
          aria-label={`Move to ${altName}`}
          title={`Move to ${altName}`}
          onClick={() => void repo.moveEntryToAlternate(entry.id)}
        >
          <Icon name="swapStore" size={20} strokeWidth={1.9} />
        </button>
      ) : (
        <span className={styles.moveSpacer} />
      )}
    </div>
  );
}
