import { useState } from 'react';
import { useLocations } from '../../data/hooks';
import { repo } from '../../data/repo';
import type { ID } from '../../domain/types';
import { Button } from '../../ui/Button';
import { LocationPicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';

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
  onCreated: (result: { name: string; locationId: ID; done: boolean }) => void;
  onClose: () => void;
}

/** QuickAddNew.dc.html: name and location only. Category is guessed from the name. */
export function CreateItemSheet({ initialName, presetLocationId, onCreated, onClose }: Props) {
  const data = useLocations();
  const [name, setName] = useState(initialName);
  const [picked, setPicked] = useState<ID | null>(null);
  const [busy, setBusy] = useState(false);

  const locations = data?.locations ?? [];
  const exists = (id: ID | null | undefined) => !!id && locations.some((l) => l.id === id);
  // Preselect: the link's location, else the last one used, else the first.
  const fallback = [presetLocationId, readLastLocation(), locations[0]?.id].find(exists) ?? null;
  const locationId = picked ?? fallback;
  const canSave = !!name.trim() && locationId != null && !busy;

  const create = async (done: boolean) => {
    if (!canSave || !locationId) return;
    setBusy(true);
    try {
      await repo.createItem({ name, locationId });
      try {
        localStorage.setItem(LAST_LOCATION_KEY, locationId);
      } catch {
        // fine: next time just preselects the first location
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
      <LocationPicker value={locationId} onChange={setPicked} locations={locations} groups={data?.groups ?? []} />
    </Sheet>
  );
}
