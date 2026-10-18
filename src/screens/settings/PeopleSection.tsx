import { useState } from 'react';
import { getSync, useSyncStatus } from '../../data/sync';
import { SyncError, type Code, type PersonWithDevices } from '../../data/sync/api';
import { relativeTime } from '../../domain/text';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import { useSubmitOnce } from '../../ui/useSubmitOnce';
import styles from './Settings.module.css';

const SITE = typeof location === 'undefined' ? 'this site' : location.origin;

const errorText = (e: unknown) =>
  e instanceof SyncError && e.kind === 'offline'
    ? 'Can’t reach the server. Try again when you’re online.'
    : e instanceof Error
      ? e.message
      : 'Something went wrong. Try again.';

function devicesText(p: PersonWithDevices, now: number): string {
  if (!p.devices.length) return 'Not signed in anywhere';
  const names = p.devices.map((d) => d.name).join(', ');
  return `${names} · seen ${relativeTime(p.devices[0].lastSeen, now)}`;
}

type Sheet_ =
  | { kind: 'invite' }
  | { kind: 'code'; code: Code; isNew: boolean; isMe?: boolean }
  | { kind: 'manage'; person: PersonWithDevices }
  | { kind: 'rename'; person: PersonWithDevices }
  | { kind: 'signOut'; person: PersonWithDevices }
  | { kind: 'remove'; person: PersonWithDevices }
  | null;

/** Settings → More → Sync → People (docs/USERS_PLAN.md). Anyone signed in can manage. */
export function PeopleSection() {
  const status = useSyncStatus();
  const sync = getSync();
  const [sheet, setSheet] = useState<Sheet_>(null);
  const [error, setError] = useState('');
  const close = () => setSheet(null);
  const people = status.people ?? [];
  const me = status.user?.id;
  // When this section opened: "seen 5 minutes ago" doesn't need to tick.
  const [now] = useState(() => Date.now());

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className={styles.people} aria-labelledby="people-h">
      <h3 id="people-h" className={styles.subLabel}>
        People
      </h3>
      {status.user?.name === 'Owner' && (
        <p className={styles.footnoteTight}>
          You’re listed as “Owner”. Tap your name to put in your own, so others see who did what.
        </p>
      )}
      <ul className={styles.peopleList}>
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={styles.personRow}
              aria-label={`${p.name}${p.id === me ? ' (you)' : ''}, manage`}
              aria-description={devicesText(p, now)}
              onClick={() => setSheet({ kind: 'manage', person: p })}
            >
              <span className={styles.personName}>
                {p.name}
                {p.id === me && <span className={styles.metaLine}> (you)</span>}
              </span>
              <span className={styles.metaLine}>{devicesText(p, now)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className={styles.error} data-flush="true" role="alert">
          {error}
        </p>
      )}
      <Button variant="secondary" onClick={() => setSheet({ kind: 'invite' })}>
        Invite someone
      </Button>

      {sheet?.kind === 'invite' && (
        <NameSheet
          title="Invite someone"
          description="They’ll get a one-time code to join this pantry and choose their own password."
          label="Their name"
          action="Get a code"
          onSave={async (name) => setSheet({ kind: 'code', code: await sync.invite(name), isNew: true })}
          onClose={close}
        />
      )}
      {sheet?.kind === 'code' && <CodeSheet code={sheet.code} isNew={sheet.isNew} isMe={sheet.isMe} onClose={close} />}
      {sheet?.kind === 'manage' && (
        <ManageSheet
          // Fresh from the latest list, so a removed device disappears from the sheet.
          person={people.find((p) => p.id === sheet.person.id) ?? sheet.person}
          isMe={sheet.person.id === me}
          now={now}
          onRemoveDevice={(id) => act(() => sync.removeDevice(id))}
          onPick={(kind) => {
            if (kind === 'code') {
              const person = sheet.person;
              close();
              void act(async () =>
                setSheet({ kind: 'code', code: await sync.newCode(person.id), isNew: false, isMe: person.id === me }),
              );
            } else setSheet({ kind, person: sheet.person });
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'rename' && (
        <NameSheet
          title={`Rename ${sheet.person.name}`}
          label="Name"
          action="Save"
          initial={sheet.person.name}
          onSave={async (name) => {
            await sync.renamePerson(sheet.person.id, name);
            close();
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'signOut' && (
        <ConfirmSheet
          title={sheet.person.id === me ? 'Sign out all your devices?' : `Sign ${sheet.person.name} out?`}
          consequence={
            sheet.person.id === me
              ? 'Every device signed in as you, this one included, needs your password again. Nothing on them is lost.'
              : `Every device signed in as ${sheet.person.name} needs their password again. Nothing on them is lost.`
          }
          confirmLabel="Sign out"
          onConfirm={() => act(() => sync.signOutPerson(sheet.person.id))}
          onClose={close}
        />
      )}
      {sheet?.kind === 'remove' && (
        <ConfirmSheet
          title={`Remove ${sheet.person.name}?`}
          consequence={`${sheet.person.name} can’t sign in any more, and their devices stop syncing. What they added or changed stays. You can invite them again later.`}
          confirmLabel="Remove"
          onConfirm={() => act(() => sync.removePerson(sheet.person.id))}
          onClose={close}
        />
      )}
    </section>
  );
}

function ManageSheet({
  person,
  isMe,
  now,
  onRemoveDevice,
  onPick,
  onClose,
}: {
  person: PersonWithDevices;
  isMe: boolean;
  now: number;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  onPick: (kind: 'rename' | 'code' | 'signOut' | 'remove') => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={isMe ? `${person.name} (you)` : person.name}
      description={devicesText(person, now)}
      actions={
        <Button variant="neutral" onClick={onClose} className={styles.spanBoth}>
          Done
        </Button>
      }
    >
      {person.devices.length > 0 && (
        <ul className={styles.deviceList} aria-label="Devices">
          {person.devices.map((d) => (
            <li key={d.id} className={styles.deviceRow}>
              <span className={styles.deviceText}>
                <span>
                  {d.name}
                  {d.current && ' (this device)'}
                </span>
                <span className={styles.metaLine}>Seen {relativeTime(d.lastSeen, now)}</span>
              </span>
              {!d.current && (
                <button
                  type="button"
                  className={styles.delete}
                  aria-label={`Remove device ${d.name}, seen ${relativeTime(d.lastSeen, now)}`}
                  onClick={() => void onRemoveDevice(d.id)}
                >
                  <Icon name="trash" size={18} strokeWidth={1.8} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.manageList}>
        <Button variant="secondary" onClick={() => onPick('rename')}>
          Rename
        </Button>
        <Button variant="secondary" onClick={() => onPick('code')}>
          {isMe ? 'Get a sign-in code' : 'New sign-in code'}
        </Button>
        {isMe && (
          <p className={styles.footnoteTight}>
            Forgot your password, or signing in on a new device? A code lets you choose a new password there. Your other
            devices stay signed in.
          </p>
        )}
        {person.devices.length > 0 && (
          <Button variant="secondary" onClick={() => onPick('signOut')}>
            {isMe ? 'Sign out all my devices' : 'Sign out their devices'}
          </Button>
        )}
        {!isMe && (
          <Button variant="danger" onClick={() => onPick('remove')}>
            Remove {person.name}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function NameSheet({
  title,
  description,
  label,
  action,
  initial = '',
  onSave,
  onClose,
}: {
  title: string;
  description?: string;
  label: string;
  action: string;
  initial?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const [busy, submit] = useSubmitOnce();
  const save = () =>
    submit(async () => {
      if (!name.trim()) return;
      setError('');
      try {
        await onSave(name.trim());
      } catch (e) {
        setError(errorText(e));
      }
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      description={description}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>
            {action}
          </Button>
        </>
      }
    >
      <label className={sheetStyles.field}>
        <span className={sheetStyles.label}>{label}</span>
        <input
          className={sheetStyles.textInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          autoComplete="off"
          data-autofocus
        />
      </label>
      {error && (
        <p className={styles.error} data-flush="true" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** The code, big, with how to use it and a way to send it. */
function CodeSheet({
  code,
  isNew,
  isMe = false,
  onClose,
}: {
  code: Code;
  isNew: boolean;
  isMe?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState('');
  const until = new Date(code.expiresAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const steps = isNew
    ? `Open ${SITE}, go to Settings → More → Sync, tap “I have a code”, enter ${code.code}, and choose a password.`
    : isMe
      ? `On the other device, open ${SITE}, go to Settings → More → Sync, tap “I have a code”, enter ${code.code}, and choose a new password. This device stays signed in.`
      : `For a forgotten password. Go to Settings → More → Sync, tap “I have a code”, enter ${code.code}, and choose a new password.`;
  const message = isNew ? `Join our pantry: ${steps}` : `A new Pantry password: ${steps}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text: message });
      else {
        await navigator.clipboard.writeText(message);
        setCopied('Copied. Paste it in a message.');
      }
    } catch {
      // Share sheet closed: nothing to do.
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? `Invite code for ${code.name}` : isMe ? 'Your sign-in code' : `Sign-in code for ${code.name}`}
      description={`Works once, until ${until}.`}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Done
          </Button>
          <Button onClick={() => void share()}>Send it</Button>
        </>
      }
    >
      <p className={styles.code}>{code.code}</p>
      <p className={styles.footnoteTight}>{steps}</p>
      {copied && (
        <p className={styles.footnoteTight} role="status">
          {copied}
        </p>
      )}
    </Sheet>
  );
}
