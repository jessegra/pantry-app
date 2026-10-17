import { useEffect, useState } from 'react';
import { guessDeviceName, getSync, useSyncStatus } from '../../data/sync';
import { SyncError } from '../../data/sync/api';
import { plural } from '../../domain/text';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import sheetStyles from '../../ui/Sheet.module.css';
import { Sheet } from '../../ui/Sheet';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import { downloadBackup } from './downloadBackup';
import { syncStatusText } from './syncText';
import styles from './Settings.module.css';

const SITE = typeof location === 'undefined' ? 'this site' : location.host;

/** Plain-language reasons a sign-in failed. */
function signInError(e: unknown): string {
  if (!(e instanceof SyncError)) return 'Something went wrong. Try again.';
  switch (e.kind) {
    case 'wrong-password':
      return 'That password isn’t right.';
    case 'offline':
      return 'Can’t reach the server. Check the connection and try again.';
    case 'rate-limited':
      return 'Too many tries. Wait a few minutes, then try again.';
    case 'not-configured':
      return 'Sync isn’t set up on the server yet.';
    default:
      return e.message;
  }
}

type Choice = { serverEmpty: boolean } | null;
type Confirm = 'signOut' | 'signOutEverywhere' | null;

/** Settings → More → Sync (docs/SYNC_PLAN.md). */
export function SyncSection() {
  const status = useSyncStatus();
  const sync = getSync();
  const [password, setPassword] = useState('');
  const [device, setDevice] = useState(guessDeviceName);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<Choice>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, submit] = useSubmitOnce();
  const [now, setNow] = useState(() => Date.now());

  // Keep "Synced 2 minutes ago" current.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const signedOut = status.phase === 'signed-out';
  const connected = !signedOut && status.phase !== 'disconnected';

  const signIn = () =>
    submit(async () => {
      setError('');
      try {
        const { serverEmpty, resumed } = await sync.signIn(password, device.trim() || guessDeviceName());
        setPassword('');
        if (!resumed) setChoice({ serverEmpty });
      } catch (e) {
        setError(signInError(e));
      }
    });

  return (
    <section className={styles.section} aria-labelledby="sync-h">
      <h2 id="sync-h" className={styles.sectionLabel}>
        Sync
      </h2>

      {connected ? (
        <div className={styles.syncBox}>
          <p className={styles.syncStatus} role="status" data-phase={status.phase}>
            {syncStatusText(status, now)}
          </p>
          {status.device && <p className={styles.footnoteTight}>This device: {status.device}</p>}
          <div className={styles.addButtons} data-flush="true">
            <Button variant="secondary" onClick={() => void sync.syncNow()} disabled={status.phase === 'syncing'}>
              Sync now
            </Button>
            <Button variant="neutral" onClick={() => setConfirm('signOut')}>
              Sign out
            </Button>
          </div>
          <Button variant="text" size={44} className={styles.textLeft} onClick={() => setConfirm('signOutEverywhere')}>
            Sign out all devices…
          </Button>
        </div>
      ) : (
        <form
          className={styles.syncBox}
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <p className={styles.footnoteTight}>
            {signedOut
              ? status.message
              : `Keep this pantry on ${SITE} and in step across your phones. It still works offline.`}
          </p>
          {signedOut && status.pending > 0 && (
            <p className={styles.footnoteTight}>
              {plural(status.pending, 'change')} on this device will sync after signing in.
            </p>
          )}
          <label className={sheetStyles.field}>
            <span className={sheetStyles.label}>Household password</span>
            <input
              className={sheetStyles.textInput}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {!signedOut && (
            <label className={sheetStyles.field}>
              <span className={sheetStyles.label}>Name for this device</span>
              <input className={sheetStyles.textInput} value={device} onChange={(e) => setDevice(e.target.value)} />
            </label>
          )}
          {error && (
            <p className={styles.error} data-flush="true" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!password || busy}>
            {busy ? 'Signing in…' : signedOut ? 'Sign in again' : 'Connect'}
          </Button>
        </form>
      )}

      {choice && <FirstConnection serverEmpty={choice.serverEmpty} onDone={() => setChoice(null)} />}

      {confirm === 'signOut' && (
        <ConfirmSheet
          title="Sign out of sync?"
          consequence="This device stops syncing. Everything on it stays here. Sign in again any time to pick up where it left off."
          confirmLabel="Sign out"
          onConfirm={() => sync.signOut()}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'signOutEverywhere' && (
        <ConfirmSheet
          title="Sign out every device?"
          consequence="For a lost phone. Every device, this one included, needs the household password again. Nothing on any of them is lost."
          confirmLabel="Sign out all"
          onConfirm={async () => {
            try {
              await sync.signOutEverywhere();
            } catch (e) {
              setError(signInError(e));
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

/** After the password: upload this pantry (empty server) or take the server's. */
function FirstConnection({ serverEmpty, onDone }: { serverEmpty: boolean; onDone: () => void }) {
  const sync = getSync();
  const [busy, submit] = useSubmitOnce();
  const [saved, setSaved] = useState('');
  const start = (fn: () => Promise<void>) =>
    submit(async () => {
      await fn();
      onDone();
    });
  const cancel = () => {
    void sync.cancelSignIn();
    onDone();
  };

  if (serverEmpty) {
    return (
      <Sheet
        open
        onClose={cancel}
        title="Upload this pantry?"
        description="Nothing is on the server yet. This device's pantry, list, locations and stores become the shared copy that your other phones use."
        actions={
          <>
            <Button variant="neutral" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={() => void start(() => sync.startWithThisDevice())} disabled={busy}>
              Upload
            </Button>
          </>
        }
      />
    );
  }
  return (
    <Sheet
      open
      onClose={cancel}
      title="Use the pantry on the server?"
      description="The server already has a pantry. This device's own data is replaced by it. Export a backup first if there's anything here to keep."
      actions={
        <>
          <Button variant="neutral" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={() => void start(() => sync.startWithServerData())} disabled={busy}>
            Use the server’s
          </Button>
        </>
      }
    >
      <Button variant="secondary" onClick={async () => setSaved(`Saved ${await downloadBackup()}.`)}>
        Export a backup first
      </Button>
      {saved && (
        <p className={styles.footnoteTight} role="status">
          {saved}
        </p>
      )}
    </Sheet>
  );
}
