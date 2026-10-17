import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../domain/types';
import { formatAmount, formatQuantity, isSetUp } from '../../domain/rules';
import { tripSummary, untrackedPurchases, type TripResult } from '../../domain/trip';
import { ButtonLink } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { CreateItemSheet } from '../add/CreateItemSheet';
import styles from './Shopped.module.css';

interface Props {
  results: TripResult[];
  houseUpdates: number;
  itemsById: Map<string, Item>;
}

/** ShoppedDone.dc.html: "Trip logged" and what changed. */
export function TripDone({ results, houseUpdates, itemsById }: Props) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<string[]>(() => untrackedPurchases(results));
  const [adding, setAdding] = useState(false);

  const after = (r: Extract<TripResult, { kind: 'bought' }>) => {
    const item = r.itemId ? itemsById.get(r.itemId) : undefined;
    return item && isSetUp(item) ? `now ${formatAmount(item)}` : 'untracked';
  };

  return (
    <div className={styles.done}>
      <div className={styles.doneHead}>
        <span className={styles.doneIcon}>
          <Icon name="check" size={28} strokeWidth={2.4} />
        </span>
        <h1 className={styles.doneTitle}>Trip logged</h1>
        <p className={styles.subtitle}>
          {tripSummary(results)}
          {houseUpdates > 0 &&
            ` Updated ${houseUpdates} ${houseUpdates === 1 ? 'amount' : 'amounts'} around the house.`}
        </p>
      </div>

      {results.length > 0 && (
        <ul className={styles.summary}>
          {results.map((r) =>
            r.kind === 'bought' ? (
              <li key={r.entryId} className={styles.summaryRow}>
                <span className={styles.summaryName}>{r.name}</span>
                <span className={styles.summaryQty}>+{formatQuantity(r.quantity, r.unit)}</span>
                <span className={styles.summaryAfter}>{after(r)}</span>
              </li>
            ) : (
              <li key={r.entryId} className={styles.summaryRow} data-skipped="true">
                <span className={styles.summaryName}>{r.name}</span>
                <span className={styles.summaryQty}>Skipped</span>
                <span className={styles.summaryAfter} />
              </li>
            ),
          )}
        </ul>
      )}

      {queue.length > 0 && (
        <div className={styles.offer}>
          <span className={styles.offerText}>
            {joinNames(queue)} {queue.length === 1 ? "isn't" : "aren't"} in your pantry yet. Add{' '}
            {queue.length === 1 ? 'it' : 'them'} so {queue.length === 1 ? "it's" : "they're"} tracked next time?
          </span>
          <button type="button" className={styles.offerAdd} onClick={() => setAdding(true)}>
            Add
          </button>
        </div>
      )}

      <div className={styles.grow} />
      <div className={styles.doneActions}>
        <ButtonLink to="/" size={56}>
          Back to inventory
        </ButtonLink>
        <ButtonLink to="/list" variant="text" size={44}>
          View shopping list
        </ButtonLink>
      </div>

      {adding && queue[0] && (
        <CreateItemSheet
          key={queue[0]}
          initialName={queue[0]}
          onClose={() => setAdding(false)}
          onCreated={({ done }) => {
            const rest = queue.slice(1);
            setQueue(rest);
            if (done) navigate('/');
            else if (!rest.length) setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
