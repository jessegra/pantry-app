import { useState } from 'react';
import { useNag } from '../../app/nag';
import { useShoppingList, useStores } from '../../data/hooks';
import { repo } from '../../data/repo';
import { parseListInput } from '../../domain/list';
import { matchItems } from '../../domain/quickAdd';
import type { ID, Item } from '../../domain/types';
import { Button, ButtonLink } from '../../ui/Button';
import { ScreenBody } from '../../ui/Screen';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import { EntrySheet } from './EntrySheet';
import { ListRow } from './ListRow';
import styles from './List.module.css';

/** ShoppingList.dc.html / SPEC §4.5. One scrolling list under store headers, no filtering. */
export function ShoppingListScreen() {
  const data = useShoppingList();
  const stores = useStores() ?? [];
  const nag = useNag();
  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<ID | null>(null);
  const [exportNote, setExportNote] = useState(false);

  const items = data ? [...data.itemsById.values()].filter((i) => i.archivedAt == null) : [];
  const parsed = parseListInput(text);
  const suggestions = text.trim() ? matchItems(items, parsed.name).slice(0, 3) : [];
  const exact = items.find((i) => i.name.toLocaleLowerCase() === parsed.name.toLocaleLowerCase());

  const [, submit] = useSubmitOnce();
  const add = (item?: Item) =>
    submit(async () => {
      if (!parsed.name) return;
      const { missing } = await repo.addListEntry({
        name: item?.name ?? parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        itemId: item?.id,
      });
      setText('');
      // The nag, case 2: a not-set-up item was put on the list by hand.
      if (item && missing.length) nag.askForMissing(item.id, missing);
    });

  const openEntry = data?.groups.flatMap((g) => g.entries).find((e) => e.id === openId);

  return (
    <>
      <header className={styles.top}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Shopping list</h1>
          <ButtonLink to="/shopped" size={44}>
            I just shopped
          </ButtonLink>
        </div>
        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            void add(exact);
          }}
        >
          <input
            className={styles.addInput}
            aria-label="Add to list"
            placeholder="Add something to the list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="done"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" size={44} disabled={!text.trim()}>
            Add
          </Button>
        </form>
        {suggestions.length > 0 && (
          <div className={styles.suggestions} aria-label="From your pantry">
            {suggestions.map((s) => (
              <button key={s.id} type="button" className={styles.suggestion} onClick={() => void add(s)}>
                Add {s.name}
                {parsed.quantity ? ` × ${parsed.quantity}` : ''}
              </button>
            ))}
          </div>
        )}
      </header>

      <ScreenBody>
        {data?.groups.map((g) => (
          <section key={g.storeId ?? 'unassigned'} aria-labelledby={`store-${g.storeId ?? 'none'}`}>
            <div className={styles.storeHeader}>
              <h2 id={`store-${g.storeId ?? 'none'}`} className={styles.storeName}>
                {g.name}
              </h2>
              <span className={styles.storeCount}>{g.remaining} to get</span>
            </div>
            {g.entries.map((e) => (
              <ListRow
                key={e.id}
                entry={e}
                item={e.itemId ? data.itemsById.get(e.itemId) : undefined}
                stores={stores}
                onOpen={() => setOpenId(e.id)}
              />
            ))}
          </section>
        ))}
        {data && data.groups.length === 0 && (
          <p className={styles.empty}>Nothing on the list. Things you run low on show up here by themselves.</p>
        )}
        <div className={styles.footer}>
          {/* TODO export: placeholder per SPEC §4.5, wired to nothing yet. */}
          <Button variant="neutral" size={44} onClick={() => setExportNote(true)}>
            Export list
          </Button>
          {exportNote && (
            <p className={styles.exportNote} role="status">
              Export isn't built yet.
            </p>
          )}
        </div>
      </ScreenBody>

      {openEntry && (
        <EntrySheet
          entry={openEntry}
          item={openEntry.itemId ? data?.itemsById.get(openEntry.itemId) : undefined}
          stores={stores}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
