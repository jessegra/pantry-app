// Chip pickers and the number stepper used across sheets.
import { useId, useState } from 'react';
import type { ID, Location, LocationGroup, Store } from '../domain/types';
import { Chip } from './Chip';
import { Icon } from './Icon';
import sheetStyles from './Sheet.module.css';
import styles from './pickers.module.css';

interface ChoiceProps<T> {
  label?: string;
  value: T;
  onChange: (v: T) => void;
}

/** Unit chips plus an "Other" free-text entry. */
export function UnitPicker({ label = 'Unit', value, options, onChange }: ChoiceProps<string | undefined> & { label?: string; options: string[] }) {
  const id = useId();
  const custom = value && !options.includes(value) ? value : '';
  const [other, setOther] = useState(custom);
  return (
    <div className={sheetStyles.field}>
      <span id={id} className={sheetStyles.label}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className={sheetStyles.chips}>
        {options.map((o) => (
          <Chip
            key={o}
            kind="radio"
            selected={value === o}
            onClick={() => {
              setOther('');
              onChange(o);
            }}
          >
            {o}
          </Chip>
        ))}
      </div>
      <input
        className={sheetStyles.textInput}
        aria-label={`Other ${label.toLowerCase()}`}
        placeholder="Other…"
        value={other}
        autoCapitalize="none"
        onChange={(e) => {
          setOther(e.target.value);
          const v = e.target.value.trim().toLowerCase();
          if (v) onChange(v);
        }}
      />
    </div>
  );
}

/** Location chips: ungrouped first, then each group under its label (SPEC §4.4). */
export function LocationPicker({
  value,
  onChange,
  locations,
  groups,
}: ChoiceProps<ID | null> & { locations: Location[]; groups: LocationGroup[] }) {
  const id = useId();
  const groupIds = new Set(groups.map((g) => g.id));
  const sets = [
    { key: '', name: '', locs: locations.filter((l) => !l.groupId || !groupIds.has(l.groupId)) },
    ...groups.map((g) => ({ key: g.id, name: g.name, locs: locations.filter((l) => l.groupId === g.id) })),
  ].filter((s) => s.locs.length);
  return (
    <div className={sheetStyles.field}>
      <span id={id} className={sheetStyles.label}>
        Location
      </span>
      <div role="radiogroup" aria-labelledby={id} className={styles.locationSets}>
        {sets.map((s) => (
          <div key={s.key} className={styles.locationSet}>
            {s.name && <span className={sheetStyles.groupLabel}>{s.name}</span>}
            <div className={sheetStyles.chips}>
              {s.locs.map((l) => (
                <Chip key={l.id} kind="radio" selected={value === l.id} onClick={() => onChange(l.id)}>
                  {l.name}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        {sets.length === 0 && <p className={styles.hint}>No locations yet. Add some in Settings.</p>}
      </div>
    </div>
  );
}

/** Store chips, optional "None", and an inline "New store" entry so the nag never dead-ends. */
export function StorePicker({
  label,
  value,
  onChange,
  stores,
  allowNone,
  onCreate,
}: ChoiceProps<ID | undefined> & {
  stores: Store[];
  allowNone?: boolean;
  onCreate: (name: string) => Promise<ID>;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const create = async () => {
    const name = draft.trim();
    if (!name) return;
    onChange(await onCreate(name));
    setDraft('');
  };
  return (
    <div className={sheetStyles.field}>
      <span id={id} className={sheetStyles.label}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className={sheetStyles.chips}>
        {stores.map((s) => (
          <Chip key={s.id} kind="radio" selected={value === s.id} onClick={() => onChange(s.id)}>
            {s.name}
          </Chip>
        ))}
        {allowNone && (
          <Chip kind="radio" selected={value === undefined} onClick={() => onChange(undefined)}>
            None
          </Chip>
        )}
      </div>
      <div className={styles.inline}>
        <input
          className={sheetStyles.textInput}
          aria-label="New store name"
          placeholder="New store"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
          }}
        />
        <button type="button" className={styles.inlineAdd} onClick={() => void create()} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

/** Number field with − / + buttons (44px). Typing allows decimals. */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : String(value));
  const set = (v: number | undefined) => {
    onChange(v);
    setText(v == null ? '' : String(v));
  };
  const n = value ?? 0;
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className={sheetStyles.field}>
      <label htmlFor={id} className={sheetStyles.label}>
        {label}
      </label>
      <div className={styles.stepper}>
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => set(Math.max(min, round(n - step)))}>
          <Icon name="minus" size={20} strokeWidth={2.2} />
        </button>
        <span className={styles.stepperValue}>
          <input
            id={id}
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = parseFloat(e.target.value.replace(',', '.'));
              onChange(Number.isFinite(v) ? Math.max(min, v) : undefined);
            }}
          />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(round(n + step))}>
          <Icon name="plus" size={20} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
