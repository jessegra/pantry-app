import { useState } from 'react';
import { useInventory } from '../../data/hooks';
import { filterInventory, statusCounts, type InventoryLocation, type StatusFilter } from '../../domain/inventory';
import { ButtonLink } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import { LocationSection } from './LocationSection';
import { groupKey, useCollapsed } from './useCollapsed';
import { GroupSection } from './GroupSection';
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
              <GroupSection
                key={s.group.id}
                name={s.group.name}
                id={s.group.id}
                lowCount={s.lowCount}
                locationCount={s.locations.length}
                // Like locations: searching or filtering opens everything.
                expanded={narrowed || !isCollapsed(groupKey(s.group.id))}
                onToggle={() => toggle(groupKey(s.group.id))}
              >
                {s.locations.map((l) => renderLocation(l, true))}
              </GroupSection>
            ),
          )}
        {data && shown.length === 0 && narrowed && (
          <p className={styles.noResults}>
            {query.trim()
              ? `Nothing matches “${query.trim()}”`
              : filter === 'out'
                ? 'Nothing is out'
                : 'Nothing is low'}
          </p>
        )}
        {data && shown.length === 0 && !narrowed && (
          <div className={styles.blank}>
            <p className={styles.blankTitle}>Your pantry is empty</p>
            <p className={styles.noResultsText}>
              Add what you have. Items can go under Unassigned and get a location later.
            </p>
            <ButtonLink to="/add">Add items</ButtonLink>
            <ButtonLink to="/settings/locations" variant="secondary">
              Set up locations
            </ButtonLink>
          </div>
        )}
      </ScreenBody>
    </>
  );
}
