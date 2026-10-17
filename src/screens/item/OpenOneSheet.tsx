import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNag } from '../../app/nag';
import { useLocations } from '../../data/hooks';
import { repo } from '../../data/repo';
import { formatQuantity } from '../../domain/rules';
import type { ID, Item, Location } from '../../domain/types';
import { LEFTOVER_UNITS, withUnit } from '../../domain/units';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LocationPicker, UnitPicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import styles from './ItemDetail.module.css';

/** Leftovers usually go in the fridge: prefer where earlier leftovers went, then a fridge. */
function defaultLocation(locations: Location[], leftovers: Item[], parent: Item): ID | null {
  const previous = leftovers.find((l) => l.locationId)?.locationId;
  if (previous) return previous;
  const fridge = locations.find((l) => /fridge|refrigerator/i.test(l.name));
  return fridge?.id ?? parent.locationId;
}

interface Props {
  parent: Item;
  leftovers: Item[];
  onClose: () => void;
}

/** OpenOne.dc.html / SPEC §4.3. */
export function OpenOneSheet({ parent, leftovers, onClose }: Props) {
  const navigate = useNavigate();
  const nag = useNag();
  const data = useLocations();
  const [name, setName] = useState(`${parent.name}, opened`);
  const [unit, setUnit] = useState<string | undefined>(parent.packageSize?.unit ?? parent.unit);
  const [locationId, setLocationId] = useState<ID | null | undefined>(undefined);
  const [subtract, setSubtract] = useState(parent.amount > 0);
  const location =
    locationId !== undefined ? locationId : data ? defaultLocation(data.locations, leftovers, parent) : null;

  const parentUnit = parent.unit ?? 'unit';
  const after = Math.max(0, parent.amount - 1);
  const create = async () => {
    const { leftoverId, parentChange } = await repo.openOne(parent.id, {
      name,
      unit,
      locationId: location,
      subtractFromParent: subtract,
    });
    nag.report(parent.id, parentChange);
    onClose();
    navigate(`/item/${leftoverId}`);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Open one"
      description={`Creates a leftover linked to ${parent.name}. Leftovers never go on the list by themselves.`}
      actions={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={!name.trim()}>
            Create leftover
          </Button>
        </>
      }
    >
      <label className={sheetStyles.field}>
        <span className={sheetStyles.label}>Name</span>
        <input className={sheetStyles.textInput} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <UnitPicker
        value={unit}
        options={withUnit(withUnit(LEFTOVER_UNITS, parent.unit), parent.packageSize?.unit)}
        onChange={setUnit}
      />
      <LocationPicker
        value={location}
        onChange={setLocationId}
        locations={data?.locations ?? []}
        groups={data?.groups ?? []}
        onCreate={(name) => repo.addLocation(name, null, { anyGroup: true })}
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={subtract}
        className={styles.checkRow}
        onClick={() => setSubtract(!subtract)}
      >
        <span className={styles.checkBox} data-checked={subtract}>
          {subtract && <Icon name="check" size={16} strokeWidth={3} />}
        </span>
        <span className={styles.checkText}>
          <span className={styles.checkTitle}>
            Take 1 {parentUnit} from {parent.name}
          </span>
          <span className={styles.checkNote}>
            {subtract
              ? `${parent.name} goes from ${formatQuantity(parent.amount, parent.unit)} to ${formatQuantity(after, parent.unit)}`
              : 'For a leftover that didn’t come from tracked stock'}
          </span>
        </span>
      </button>
    </Sheet>
  );
}
