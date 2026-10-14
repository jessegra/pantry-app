import { useState } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../../data/repo';
import { pluralUnit } from '../../domain/rules';
import type { ID, Item, ListEntry, Store } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Stepper, StorePicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';
import styles from './List.module.css';

interface Props {
  entry: ListEntry;
  item?: Item;
  stores: Store[];
  onClose: () => void;
}

/** Tap a row's name: change how many, which store, or remove it. (No mockup; same sheet style.) */
export function EntrySheet({ entry, item, stores, onClose }: Props) {
  const [quantity, setQuantity] = useState<number | undefined>(entry.quantity);
  const [storeId, setStoreId] = useState<ID | undefined>(entry.storeId ?? undefined);
  const [blocked, setBlocked] = useState(false);

  const save = async () => {
    if (quantity && quantity !== entry.quantity) await repo.updateListEntry(entry.id, { quantity });
    if ((storeId ?? null) !== entry.storeId) await repo.setEntryStore(entry.id, storeId ?? null);
    onClose();
  };

  const remove = async () => {
    const { removed } = await repo.removeListEntry(entry.id);
    if (removed) onClose();
    else setBlocked(true);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.name}
      description={entry.source === 'auto' ? 'Added automatically because it’s low.' : undefined}
      actions={
        <>
          <Button variant="neutral" onClick={() => void remove()}>
            Remove
          </Button>
          <Button onClick={() => void save()} disabled={!quantity}>
            Save
          </Button>
        </>
      }
    >
      {blocked && (
        <p className={styles.blocked} role="alert">
          {entry.name} is still low, so it would come straight back. Top it up in Inventory, or check it off here.
        </p>
      )}
      <Stepper
        label="How many to buy"
        value={quantity}
        onChange={setQuantity}
        min={0}
        suffix={entry.unit ? pluralUnit(entry.unit, quantity ?? 2) : undefined}
      />
      <StorePicker
        label="Store"
        value={storeId}
        onChange={setStoreId}
        stores={stores}
        allowNone
        onCreate={(n) => repo.addStore(n)}
      />
      {item && (
        <Link to={`/item/${item.id}`} className={styles.itemLink}>
          Open {item.name} in inventory
        </Link>
      )}
    </Sheet>
  );
}
