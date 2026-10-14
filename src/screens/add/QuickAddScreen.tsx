import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useNag } from '../../app/nag';
import { useQuickAdd } from '../../data/hooks';
import { repo } from '../../data/repo';
import { hasExactMatch, matchItems, nameFromQuery } from '../../domain/quickAdd';
import { formatAmount, isSetUp } from '../../domain/rules';
import type { ID, Item } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import { CreateItemSheet } from './CreateItemSheet';
import styles from './QuickAdd.module.css';

/** QuickAdd.dc.html. Built for adding several things fast: +1 never navigates away. */
export function QuickAddScreen() {
  const data = useQuickAdd();
  const nag = useNag();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetLocationId = params.get('location');
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  /** "+n added" per item, until you leave the screen. */
  const [added, setAdded] = useState<Record<ID, number>>({});
  const [announce, setAnnounce] = useState('');

  const items = data?.items ?? [];
  const matches = matchItems(items, query);
  const title = nameFromQuery(query);

  const plusOne = async (item: Item) => {
    setAdded((a) => ({ ...a, [item.id]: (a[item.id] ?? 0) + 1 }));
    nag.report(item.id, await repo.tap(item.id, 1));
  };

  const startCreate = () => setCreating(title);

  return (
    <>
      <header className={styles.top}>
        <h1 className={styles.title}>Quick add</h1>
        <div className={styles.search}>
          <Icon name="search" size={18} />
          <input
            ref={search}
            type="search"
            aria-label="Find or create an item"
            placeholder="Find or create an item"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter creates, unless that exact item already exists.
              if (e.key === 'Enter' && query.trim() && !hasExactMatch(items, query)) {
                e.preventDefault();
                startCreate();
              }
            }}
            enterKeyHint="go"
            autoComplete="off"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className={styles.clear}
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                search.current?.focus();
              }}
            >
              <Icon name="close" size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      <ScreenBody>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>

        {query.trim() && (
          <div className={styles.results}>
            {matches.map((item) => (
              <div key={item.id} className={styles.match}>
                <span className={styles.matchText}>
                  <span className={styles.matchName}>{item.name}</span>
                  <span className={styles.matchWhere}>{data?.whereById.get(item.id)}</span>
                </span>
                {isSetUp(item) ? (
                  <>
                    <span className={styles.matchAmount}>{formatAmount(item)}</span>
                    <button
                      type="button"
                      className={styles.plusOne}
                      aria-label={`Add one to ${item.name}`}
                      onClick={() => void plusOne(item)}
                    >
                      +1
                    </button>
                  </>
                ) : (
                  <Link to={`/item/${item.id}`} className={styles.setUp}>
                    Set up
                  </Link>
                )}
              </div>
            ))}
            <button type="button" className={styles.createRow} onClick={startCreate}>
              <span className={styles.createIcon}>
                <Icon name="plus" size={18} strokeWidth={2} />
              </span>
              Create “{title}”
            </button>
          </div>
        )}

        <section className={styles.recent} aria-labelledby="recent-h">
          <h2 id="recent-h" className={styles.sectionLabel}>
            Recent &amp; frequent
          </h2>
          {data && data.recent.length > 0 ? (
            <>
              <div className={styles.grid}>
                {data.recent.map((item) => {
                  const n = added[item.id] ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.tile}
                      data-added={n > 0}
                      aria-label={`Add one to ${item.name}, ${n ? `${n} added` : formatAmount(item)}`}
                      onClick={() => void plusOne(item)}
                    >
                      <span className={styles.tileName}>{item.name}</span>
                      <span className={styles.tileBadge}>{n ? `+${n} added` : formatAmount(item)}</span>
                    </button>
                  );
                })}
              </div>
              <span className={styles.caption}>Each tap adds one unit to what's on hand.</span>
            </>
          ) : (
            data && <span className={styles.caption}>Items you tap and edit will show up here.</span>
          )}
        </section>
      </ScreenBody>

      {creating !== null && (
        <CreateItemSheet
          initialName={creating}
          presetLocationId={presetLocationId}
          onClose={() => setCreating(null)}
          onCreated={({ name, done }) => {
            setCreating(null);
            if (done) {
              navigate('/');
              return;
            }
            setQuery('');
            setAnnounce(`Added ${name}`);
            search.current?.focus();
          }}
        />
      )}
    </>
  );
}
