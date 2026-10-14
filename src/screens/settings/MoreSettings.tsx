import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useArchived } from '../../data/hooks';
import { BackupError, repo, validateBackup, type Backup } from '../../data/repo';
import { Button } from '../../ui/Button';
import { ConfirmDelete } from './parts';
import { plural } from '../../domain/text';
import styles from './Settings.module.css';

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Not in the mockups: archived items (recoverable, SPEC §3) and JSON backup (SPEC §5). */
export function MoreSettings() {
  const archived = useArchived();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const exportData = async () => {
    const backup = await repo.exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pantry-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: `Saved ${a.download}.` });
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setMessage(null);
    try {
      setPending(validateBackup(JSON.parse(await f.text())));
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof BackupError ? e.message : 'That file couldn’t be read as a backup.' });
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <>
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
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="backup-h">
        <h2 id="backup-h" className={styles.sectionLabel}>
          Backup
        </h2>
        <p className={styles.footnote}>
          Everything lives on this device. Save a backup file now and then, and import it on a new phone.
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
          <p className={message.kind === 'error' ? styles.error : styles.ok} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </section>

      {pending && (
        <ConfirmDelete
          title="Replace everything with this backup?"
          consequence={`Saved ${day(pending.exportedAt)}: ${plural(pending.tables.items.length, 'item')}, ${plural(
            pending.tables.locations.length,
            'location',
          )}, ${plural(pending.tables.stores.length, 'store')}. What's in the app now will be replaced.`}
          confirmLabel="Replace"
          onConfirm={async () => {
            await repo.importData(pending);
            setMessage({ kind: 'ok', text: 'Backup imported.' });
          }}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
