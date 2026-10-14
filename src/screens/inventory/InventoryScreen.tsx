import { useState } from 'react';
import { useInventory } from '../../data/hooks';
import { filterInventory, statusCounts, type InventoryLocation, type StatusFilter } from '../../domain/inventory';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import { LocationSection } from './LocationSection';
import { useCollapsed } from './useCollapsed';
import styles from './Inventory.module.css';

export function InventoryScreen() {
  const data = useInventory();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [isCollapsed, toggle] = useCollapsed();

  const sections = data?.sections ?? [];
  const counts = statusCounts(sections);
  const shown = filterInventory(sections, filter, query);
  const narrowed = filter !== 'all' || query.trim() !== '';

  const renderLocation = (location: InventoryLocation, inGroup: boolean) => (
    <LocationSection
      key={location.id ?? 'unassigned'}
      location={location}
      inGroup={inGroup}
      // Searching or filtering opens everything so matches are never hidden.
      expanded={narrowed || !isCollapsed(location.id)}
      onToggle={() => toggle(location.id)}
      showEmpty={!narrowed}
    />
  );

  return (
    <>
      <header className={styles.top}>
        <h1 className="visually-hidden">Inventory</h1>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className="visually-hidden">Search pantry</span>
          <input
            type="search"
            placeholder="Search pantry"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
        <div className={styles.chips} role="group" aria-label="Show">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          <Chip selected={filter === 'low'} onClick={() => setFilter('low')}>
            Low · {counts.low}
          </Chip>
          <Chip selected={filter === 'out'} onClick={() => setFilter('out')}>
            Out · {counts.out}
          </Chip>
        </div>
      </header>
      <ScreenBody>
        {data &&
          shown.map((s) =>
            s.kind === 'location' ? (
              renderLocation(s.location, false)
            ) : (
              <div key={s.group.id} role="group" aria-label={s.group.name}>
                <h2 className={styles.groupHeader}>
                  <span>{s.group.name}</span>
                  {s.lowCount > 0 && <span className={styles.groupLow}>{s.lowCount} low</span>}
                </h2>
                {s.locations.map((l) => renderLocation(l, true))}
              </div>
            ),
          )}
        {data && shown.length === 0 && (
          <p className={styles.noResults}>
            {query.trim()
              ? `Nothing matches “${query.trim()}”`
              : filter === 'out'
                ? 'Nothing is out'
                : filter === 'low'
                  ? 'Nothing is low'
                  : 'No locations yet. Add some in Settings.'}
          </p>
        )}
      </ScreenBody>
    </>
  );
}
