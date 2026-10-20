import type { ReactNode } from 'react';
import { plural } from '../../domain/text';
import { Icon } from '../../ui/Icon';
import styles from './Inventory.module.css';

interface Props {
  id: string;
  name: string;
  lowCount: number;
  locationCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A location group ("Pantry"): a header that folds away all its locations at once (owner request). */
export function GroupSection({ id, name, lowCount, locationCount, expanded, onToggle, children }: Props) {
  const bodyId = `grp-${id}`;
  return (
    <div role="group" aria-label={name}>
      <h2 className={styles.groupHeading}>
        <button
          type="button"
          className={styles.groupHeader}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${name}, ${plural(locationCount, 'location')}${lowCount ? `, ${lowCount} low` : ''}`}
          onClick={onToggle}
        >
          <Icon name="chevronRight" size={14} strokeWidth={2.2} className={styles.chevron} />
          <span className={styles.groupName}>{name}</span>
          {lowCount > 0 && <span className={styles.groupLow}>{lowCount} low</span>}
        </button>
      </h2>
      {expanded && <div id={bodyId}>{children}</div>}
    </div>
  );
}
