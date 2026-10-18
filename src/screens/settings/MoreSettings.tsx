import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUILD, checkForUpdate } from '../../app/updates';
import { useArchived } from '../../data/hooks';
import { BackupError, repo, validateBackup, type Backup } from '../../data/repo';
import { plural } from '../../domain/text';
import type { Item } from '../../domain/types';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Icon } from '../../ui/Icon';
import { getSync, useSyncStatus } from '../../data/sync';
import { downloadBackup } from './downloadBackup';
import { SyncSection } from './SyncSection';
import { TextSizeSection } from './TextSizeSection';
import styles from './Settings.module.css';

const day = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type Confirm =
  { kind: 'import'; backup: Backup } | { kind: 'delete'; item: Item } | { kind: 'sample' } | { kind: 'erase' } | null;

/** Not in the mockups: archived items, backup, reset (for testing) and build info. */
export function MoreSettings() {
  const archived = useArchived();
  const file = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [updateText, setUpdateText] = useState('');

  const sync = useSyncStatus();
  const syncing = sync.phase !== 'disconnected';
  const SIGNS_OUT =
    ' This device will also stop syncing (sign in again afterwards), so the shared copy isn’t replaced.';

  const exportData = async () => setMessage({ kind: 'ok', text: `Saved ${await downloadBackup()}.` });

  /** Reset, Erase and Import replace this device's data: never push that to the shared copy. */
  const replaceLocal = async (work: () => Promise<void>) => {
    if (syncing) await getSync().signOut();
    await work();
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setMessage(null);
    try {
      setConfirm({ kind: 'import', backup: validateBackup(JSON.parse(await f.text())) });
    } catch (e) {
      setMessage({
        kind: 'error',
        text: e instanceof BackupError ? e.message : 'That file couldn’t be read as a backup.',
      });
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const update = async () => {
    setUpdateText('Checking…');
    const r = await checkForUpdate();
    setUpdateText(
      r === 'updating'
        ? 'A new version is downloading. The app will reload by itself.'
        : r === 'current'
          ? 'You have the latest version.'
          : r === 'offline'
            ? 'Couldn’t check: you seem to be offline.'
            : 'Updates aren’t available in this browser.',
    );
  };

  return (
    <>
      <TextSizeSection />
      <SyncSection />

      <section className={styles.section} aria-labelledby="archived-h">
        <h2 id="archived-h" className={styles.sectionLabel}>
          Archived items
        </h2>
        {archived && archived.length === 0 && <p className={styles.empty}>Nothing archived.</p>}
        <div className={styles.list}>
          {archived?.map((item) => (
            <div key={item.id} className={styles.row} data-tall="true">
              <span className={styles.stack} data-pad="true">
                <Link to={`/item/${item.id}`} className={styles.linkName}>
                  {item.name}
                </Link>
                <span className={styles.metaLine}>Archived {day(item.archivedAt!)}</span>
              </span>
              <Button variant="secondary" size={44} onClick={() => void repo.restoreItem(item.id)}>
                Restore
              </Button>
              <button
                type="button"
                className={styles.delete}
                aria-label={`Delete ${item.name} permanently`}
                onClick={() => setConfirm({ kind: 'delete', item })}
              >
                <Icon name="trash" size={18} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="backup-h">
        <h2 id="backup-h" className={styles.sectionLabel}>
          Backup
        </h2>
        <p className={styles.footnote}>
          {syncing
            ? 'Sync keeps a copy on the server too. A backup file is still handy before big changes.'
            : 'Everything lives on this device. Save a backup file now and then, and import it on a new phone.'}
        </p>
        <div className={styles.addButtons}>
          <Button variant="secondary" onClick={() => void exportData()}>
            Export data
          </Button>
          <Button variant="neutral" onClick={() => file.current?.click()}>
            Import data
          </Button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-label="Backup file to import"
          tabIndex={-1}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {message && (
          <p
            className={message.kind === 'error' ? styles.error : styles.ok}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="reset-h">
        <h2 id="reset-h" className={styles.sectionLabel}>
          Reset data
        </h2>
        <p className={styles.footnote}>For trying things out. Export a backup first if you want to keep anything.</p>
        <div className={styles.addButtons}>
          <Button variant="neutral" onClick={() => setConfirm({ kind: 'sample' })}>
            Reset to sample data
          </Button>
          <Button variant="neutral" onClick={() => setConfirm({ kind: 'erase' })}>
            Erase everything
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="about-h">
        <h2 id="about-h" className={styles.sectionLabel}>
          About
        </h2>
        <p className={styles.footnote}>
          Version {BUILD.version} · build {BUILD.sha} · {stamp(BUILD.time)}
        </p>
        <div className={styles.addOne}>
          <Button variant="secondary" onClick={() => void update()}>
            Check for updates
          </Button>
        </div>
        {updateText && (
          <p className={styles.footnote} role="status">
            {updateText}
          </p>
        )}
      </section>

      {confirm?.kind === 'import' && (
        <ConfirmSheet
          title="Replace everything with this backup?"
          consequence={`Saved ${day(confirm.backup.exportedAt)}: ${plural(confirm.backup.tables.items.length, 'item')}, ${plural(
            confirm.backup.tables.locations.length,
            'location',
          )}, ${plural(confirm.backup.tables.stores.length, 'store')}. What's in the app now will be replaced.${syncing ? SIGNS_OUT : ''}`}
          confirmLabel="Replace"
          onConfirm={async () => {
            await replaceLocal(() => repo.importData(confirm.backup));
            setMessage({ kind: 'ok', text: 'Backup imported.' });
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmSheet
          title={`Delete ${confirm.item.name} for good?`}
          consequence="It can't be restored afterwards. Any leftovers made from it stay in your pantry."
          onConfirm={() => repo.deleteItem(confirm.item.id)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'sample' && (
        <ConfirmSheet
          title="Reset to sample data?"
          consequence={`Everything in the app is replaced with the example kitchen.${syncing ? SIGNS_OUT : ''}`}
          confirmLabel="Reset"
          onConfirm={() => replaceLocal(() => repo.loadSampleData())}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'erase' && (
        <ConfirmSheet
          title="Erase everything?"
          consequence={`All items, locations, stores and the shopping list are deleted. You start blank.${syncing ? SIGNS_OUT : ''}`}
          confirmLabel="Erase"
          onConfirm={() => replaceLocal(() => repo.startEmpty())}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
