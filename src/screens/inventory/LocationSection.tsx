import { Link } from 'react-router-dom';
import type { InventoryLocation } from '../../domain/inventory';
import { Icon } from '../../ui/Icon';
import { InventoryRow } from './InventoryRow';
import styles from './Inventory.module.css';

interface Props {
  location: InventoryLocation;
  inGroup: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** "Nothing stored here yet" is only shown on the unfiltered list. */
  showEmpty: boolean;
}

export function LocationSection({ location, inGroup, expanded, onToggle, showEmpty }: Props) {
  const { id, name, rows, itemCount, lowCount } = location;
  const bodyId = `loc-${id ?? 'unassigned'}`;
  return (
    <section aria-label={name}>
      <h3 className={styles.locationHeading}>
        <button
          type="button"
          className={styles.locationHeader}
          data-in-group={inGroup}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${name}, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}${lowCount ? `, ${lowCount} low` : ''}`}
          onClick={onToggle}
        >
          <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.chevron} />
          <span className={styles.locationName}>{name}</span>
          {lowCount > 0 && <span className={styles.lowPill}>{lowCount} low</span>}
          <span className={styles.count}>{itemCount}</span>
        </button>
      </h3>
      {expanded && (
        <div id={bodyId}>
          {rows.map((r) => (
            <InventoryRow key={r.item.id} row={r} />
          ))}
          {showEmpty && itemCount === 0 && id && (
            <div className={styles.emptyLocation}>
              <span>Nothing stored here yet</span>
              <Link to={`/add?location=${encodeURIComponent(id)}`} className={styles.addItem}>
                Add item
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
