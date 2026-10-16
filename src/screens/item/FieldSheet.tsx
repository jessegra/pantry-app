import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCategories } from '../../app/categories';
import { useNag } from '../../app/nag';
import { useLocations, useStores } from '../../data/hooks';
import { repo, type ItemPatch } from '../../data/repo';
import { effectiveThreshold, formatQuantity, pluralUnit } from '../../domain/rules';
import type { ID, Item } from '../../domain/types';
import { ITEM_UNITS, PACKAGE_UNITS, withUnit } from '../../domain/units';
import { Button } from '../../ui/Button';
import { CATEGORY_ICONS } from '../../ui/icons';
import { Icon } from '../../ui/Icon';
import { LocationPicker, Stepper, StorePicker, UnitPicker } from '../../ui/pickers';
import { Sheet } from '../../ui/Sheet';
import sheetStyles from '../../ui/Sheet.module.css';
import styles from './ItemDetail.module.css';

export type EditableField =
  | 'name'
  | 'category'
  | 'unit'
  | 'packageSize'
  | 'par'
  | 'lowThreshold'
  | 'location'
  | 'preferredStore'
  | 'secondaryStore';

interface Props {
  item: Item;
  field: EditableField;
  onClose: () => void;
}

/** One edit sheet per field row on item detail (SPEC §4.2). */
export function FieldSheet({ item, field, onClose }: Props) {
  const nag = useNag();
  const save = async (patch: ItemPatch) => {
    nag.report(item.id, await repo.updateItem(item.id, patch));
    onClose();
  };
  const props = { item, onClose, save };
  switch (field) {
    case 'name':
      return <NameSheet {...props} />;
    case 'category':
      return <CategorySheet {...props} />;
    case 'unit':
      return <UnitSheet {...props} />;
    case 'packageSize':
      return <PackageSheet {...props} />;
    case 'par':
      return <ParSheet {...props} />;
    case 'lowThreshold':
      return <ThresholdSheet {...props} />;
    case 'location':
      return <LocationSheet {...props} />;
    case 'preferredStore':
    case 'secondaryStore':
      return <StoreSheet {...props} which={field} />;
  }
}

interface SheetProps {
  item: Item;
  onClose: () => void;
  save: (patch: ItemPatch) => Promise<void>;
}

function EditSheet({
  title,
  description,
  onClose,
  onSave,
  canSave = true,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  onSave: () => void;
  canSave?: boolean;
  children: ReactNode;
}) {
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
          <Button onClick={onSave} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      {children}
    </Sheet>
  );
}

function NameSheet({ item, onClose, save }: SheetProps) {
  const [name, setName] = useState(item.name);
  return (
    <EditSheet title="Name" onClose={onClose} onSave={() => void save({ name })} canSave={!!name.trim()}>
      <input
        className={sheetStyles.textInput}
        aria-label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-autofocus
      />
    </EditSheet>
  );
}

function CategorySheet({ item, onClose, save }: SheetProps) {
  const { list } = useCategories();
  const [category, setCategory] = useState<ID>(item.category);
  return (
    <EditSheet
      title="Category"
      description="Only picks the icon."
      onClose={onClose}
      onSave={() => void save({ category })}
    >
      <div role="radiogroup" aria-label="Category" className={styles.categoryGrid}>
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            className={styles.categoryTile}
            onClick={() => setCategory(c.id)}
          >
            <Icon path={CATEGORY_ICONS[c.icon]} size={24} strokeWidth={1.6} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <Link to="/settings/categories" className={styles.manageLink}>
        Add or edit categories
      </Link>
    </EditSheet>
  );
}

function UnitSheet({ item, onClose, save }: SheetProps) {
  const [unit, setUnit] = useState(item.unit);
  return (
    <EditSheet title="Unit" description="What one tap on the bar counts." onClose={onClose} onSave={() => void save({ unit })}>
      <UnitPicker value={unit} options={withUnit(ITEM_UNITS, item.unit)} onChange={setUnit} />
    </EditSheet>
  );
}

function PackageSheet({ item, onClose, save }: SheetProps) {
  const [amount, setAmount] = useState(item.packageSize?.amount);
  const [unit, setUnit] = useState(item.packageSize?.unit ?? 'oz');
  return (
    <EditSheet
      title="Package size"
      description={`How much is in one ${item.unit ?? 'package'}. Used to add leftovers to the total.`}
      onClose={onClose}
      onSave={() => void save({ packageSize: amount ? { amount, unit } : undefined })}
    >
      <Stepper label={`1 ${item.unit ?? 'package'} =`} value={amount} onChange={setAmount} suffix={unit} />
      <UnitPicker label="Measured in" value={unit} options={withUnit(PACKAGE_UNITS, item.packageSize?.unit)} onChange={(u) => setUnit(u ?? 'oz')} />
    </EditSheet>
  );
}

function ParSheet({ item, onClose, save }: SheetProps) {
  const [par, setPar] = useState(item.par);
  return (
    <EditSheet
      title="Par"
      description="A full stock: the right end of the bar. Clear it to stop tracking an amount."
      onClose={onClose}
      onSave={() => void save({ par: par && par > 0 ? par : undefined })}
    >
      <Stepper label="Par" value={par} onChange={setPar} suffix={item.unit ? pluralUnit(item.unit, 2) : undefined} />
    </EditSheet>
  );
}

function ThresholdSheet({ item, onClose, save }: SheetProps) {
  const [value, setValue] = useState(item.lowThreshold);
  const fallback = effectiveThreshold({ par: item.par });
  return (
    <EditSheet
      title="Low threshold"
      description={
        fallback != null
          ? `At or below this, ${item.name} goes on the list. Default is 25% of par (${formatQuantity(fallback, item.unit)}).`
          : 'Default is 25% of par. Set a par first.'
      }
      onClose={onClose}
      onSave={() => void save({ lowThreshold: value })}
    >
      <Stepper
        key={value === undefined ? 'default' : 'custom'}
        label="Low at"
        value={value ?? fallback}
        onChange={setValue}
        step={item.par === 1 ? 0.1 : 1}
        suffix={item.unit ? pluralUnit(item.unit, 2) : undefined}
      />
      <Button variant="secondary" onClick={() => setValue(undefined)} disabled={value === undefined}>
        Use the default (25% of par)
      </Button>
    </EditSheet>
  );
}

function LocationSheet({ item, onClose, save }: SheetProps) {
  const data = useLocations();
  const [locationId, setLocationId] = useState<ID | null>(item.locationId);
  return (
    <EditSheet title="Location" onClose={onClose} onSave={() => void save({ locationId })}>
      <LocationPicker
        value={locationId}
        onChange={setLocationId}
        locations={data?.locations ?? []}
        groups={data?.groups ?? []}
        onCreate={(name) => repo.addLocation(name, null, { anyGroup: true })}
      />
    </EditSheet>
  );
}

function StoreSheet({ item, onClose, save, which }: SheetProps & { which: 'preferredStore' | 'secondaryStore' }) {
  const stores = useStores() ?? [];
  const key = which === 'preferredStore' ? 'preferredStoreId' : 'secondaryStoreId';
  const [storeId, setStoreId] = useState<ID | undefined>(item[key]);
  const title = which === 'preferredStore' ? 'Preferred store' : 'Secondary store';
  return (
    <EditSheet
      title={title}
      description={which === 'secondaryStore' ? 'Lets you move it on the list while shopping.' : undefined}
      onClose={onClose}
      onSave={() => void save({ [key]: storeId })}
    >
      <StorePicker label={title} value={storeId} onChange={setStoreId} stores={stores} allowNone onCreate={(n) => repo.addStore(n)} />
    </EditSheet>
  );
}
