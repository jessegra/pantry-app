import { useState } from 'react';
import { useStores } from '../../data/hooks';
import { repo, type ItemChange, type ItemPatch } from '../../data/repo';
import { pluralUnit } from '../../domain/rules';
import type { ID, Item } from '../../domain/types';
import { ITEM_UNITS, withUnit } from '../../domain/units';
import { Button } from '../../ui/Button';
import { Stepper, StorePicker, UnitPicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';

export type SetupField = 'unit' | 'par' | 'amount' | 'preferredStore';

interface Props {
  item: Item;
  fields: SetupField[];
  title: string;
  description?: string;
  /** "Skip" for the nag (skipping is fine), "Cancel" elsewhere. */
  dismissLabel: 'Skip' | 'Cancel';
  onClose: (change?: ItemChange) => void;
}

/**
 * Asks for several fields at once. Used for "Set unit & par" on a new item, the
 * store nag ("Where do you buy…?"), and the full nag when a not-set-up item is
 * added to the list. Built in the Open one sheet's style (SPEC §3: no mockup).
 */
export function ItemSetupSheet({ item, fields, title, description, dismissLabel, onClose }: Props) {
  const stores = useStores() ?? [];
  const [unit, setUnit] = useState(item.unit);
  const [par, setPar] = useState(item.par);
  // A freshly set-up item starts full unless told otherwise, so it doesn't land on the list at once.
  const [amount, setAmount] = useState<number | undefined>(item.par ? item.amount : undefined);
  const [storeId, setStoreId] = useState<ID | undefined>(item.preferredStoreId);

  const has = (f: SetupField) => fields.includes(f);
  const plural = unit ? pluralUnit(unit, 2) : undefined;
  const canSave = (!has('par') || (par != null && par > 0)) && (!has('preferredStore') || storeId != null);

  const save = async () => {
    const patch: ItemPatch = {};
    if (has('unit')) patch.unit = unit;
    if (has('par')) patch.par = par;
    if (has('amount')) patch.amount = amount ?? par ?? 0;
    if (has('preferredStore')) patch.preferredStoreId = storeId;
    onClose(await repo.updateItem(item.id, patch));
  };

  return (
    <Sheet
      open
      onClose={() => onClose()}
      title={title}
      description={description}
      actions={
        <>
          <Button variant="neutral" onClick={() => onClose()}>
            {dismissLabel}
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      {has('unit') && <UnitPicker value={unit} options={withUnit(ITEM_UNITS, item.unit)} onChange={setUnit} />}
      {has('par') && <Stepper label="Par (a full stock)" value={par} onChange={setPar} suffix={plural} />}
      {has('amount') && <Stepper label="On hand now" value={amount ?? par} onChange={setAmount} suffix={plural} />}
      {has('preferredStore') && (
        <StorePicker
          label="Preferred store"
          value={storeId}
          onChange={setStoreId}
          stores={stores}
          onCreate={(name) => repo.addStore(name)}
        />
      )}
    </Sheet>
  );
}
