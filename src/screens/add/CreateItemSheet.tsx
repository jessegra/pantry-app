import { useState } from 'react';
import { useNag } from '../../app/nag';
import { useLocations, useStores } from '../../data/hooks';
import { repo } from '../../data/repo';
import { pluralUnit } from '../../domain/rules';
import type { ID } from '../../domain/types';
import { ITEM_UNITS } from '../../domain/units';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LocationPicker, Stepper, StorePicker, UnitPicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import styles from './QuickAdd.module.css';

const LAST_LOCATION_KEY = 'pantry.lastLocation';

function readLastLocation(): ID | null {
  try {
    return localStorage.getItem(LAST_LOCATION_KEY);
  } catch {
    return null;
  }
}

interface Props {
  initialName: string;
  /** From /add?location=… (the empty-location "Add item" link). */
  presetLocationId?: ID | null;
  /** "Add another" keeps you in Quick add; "Add & done" goes to Inventory. */
  onCreated: (result: { name: string; locationId: ID | null; done: boolean }) => void;
  onClose: () => void;
}

/**
 * QuickAddNew.dc.html: a name and a place, nothing else required. The place can be
 * Unassigned or a brand-new location. Unit, par and store can be filled in here too,
 * under "Add unit, par and store now", or later when they're needed.
 */
export function CreateItemSheet({ initialName, presetLocationId, onCreated, onClose }: Props) {
  const data = useLocations();
  const stores = useStores() ?? [];
  const nag = useNag();
  const [name, setName] = useState(initialName);
  const [picked, setPicked] = useState<ID | null | undefined>(undefined);
  const [details, setDetails] = useState(false);
  const [unit, setUnit] = useState<string | undefined>();
  const [par, setPar] = useState<number | undefined>();
  const [amount, setAmount] = useState<number | undefined>();
  const [storeId, setStoreId] = useState<ID | undefined>();
  const [busy, setBusy] = useState(false);

  const locations = data?.locations ?? [];
  const exists = (id: ID | null | undefined) => !!id && locations.some((l) => l.id === id);
  // Preselect: the link's location, else the last one used, else the first, else Unassigned.
  const fallback = [presetLocationId, readLastLocation(), locations[0]?.id].find(exists) ?? null;
  const locationId = picked !== undefined ? picked : fallback;
  const canSave = !!name.trim() && !busy;
  const plural = unit ? pluralUnit(unit, 2) : undefined;

  const create = async (done: boolean) => {
    if (!canSave) return;
    setBusy(true);
    try {
      const withPar = details && par != null && par > 0;
      const { id, change } = await repo.createItem({
        name,
        locationId,
        ...(details && {
          unit,
          par: withPar ? par : undefined,
          // A freshly set-up item starts full unless told otherwise.
          amount: withPar ? (amount ?? par) : 0,
          preferredStoreId: storeId,
        }),
      });
      nag.report(id, change);
      if (locationId) {
        try {
          localStorage.setItem(LAST_LOCATION_KEY, locationId);
        } catch {
          // fine: next time just preselects the first location
        }
      }
      onCreated({ name: name.trim(), locationId, done });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New item"
      description="Just a name and a place. Unit, par and store can wait until they're needed."
      actions={
        <>
          <Button variant="secondary" onClick={() => void create(false)} disabled={!canSave}>
            Add another
          </Button>
          <Button onClick={() => void create(true)} disabled={!canSave}>
            Add &amp; done
          </Button>
        </>
      }
    >
      <label className={sheetStyles.field}>
        <span className={sheetStyles.label}>Name</span>
        <input
          className={sheetStyles.textInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create(false);
            }
          }}
          enterKeyHint="next"
          autoCapitalize="sentences"
          data-autofocus
        />
      </label>
      <LocationPicker
        value={locationId}
        onChange={setPicked}
        locations={locations}
        groups={data?.groups ?? []}
        onCreate={(n) => repo.addLocation(n)}
      />

      <button
        type="button"
        className={styles.detailsToggle}
        aria-expanded={details}
        onClick={() => setDetails(!details)}
      >
        <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.detailsChevron} />
        Add unit, par and store now
        <span className={styles.optional}>optional</span>
      </button>
      {details && (
        <>
          <UnitPicker value={unit} options={ITEM_UNITS} onChange={setUnit} />
          <Stepper label="Par (a full stock)" value={par} onChange={setPar} suffix={plural} />
          {par != null && par > 0 && (
            <Stepper label="On hand now" value={amount ?? par} onChange={setAmount} suffix={plural} />
          )}
          <StorePicker
            label="Preferred store"
            value={storeId}
            onChange={setStoreId}
            stores={stores}
            allowNone
            onCreate={(n) => repo.addStore(n)}
          />
        </>
      )}
    </Sheet>
  );
}
