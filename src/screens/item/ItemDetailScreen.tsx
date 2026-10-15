import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lastListLocation } from '../../app/listMemory';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { useWide } from '../../ui/useMediaQuery';
import { categoryName, useCategories } from '../../app/categories';
import { categoryIcon } from '../../domain/categories';
import { useNag } from '../../app/nag';
import { useItem, useStores } from '../../data/hooks';
import { repo } from '../../data/repo';
import { useOptimisticAmount } from '../../data/useOptimisticAmount';
import {
  effectiveThreshold,
  formatAmount,
  formatNumber,
  formatQuantity,
  isSetUp,
  isSingleContainer,
} from '../../domain/rules';
import type { Item } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ScreenBody } from '../../ui/Screen';
import { StatusBar } from '../../ui/StatusBar';
import { FieldSheet, type EditableField } from './FieldSheet';
import { ItemSetupSheet } from './ItemSetupSheet';
import { OpenOneSheet } from './OpenOneSheet';
import styles from './ItemDetail.module.css';

type OpenSheet = EditableField | 'setup' | 'openOne' | 'delete' | null;

export function ItemDetailScreen() {
  const { id } = useParams();
  const data = useItem(id);
  const stores = useStores() ?? [];
  const nag = useNag();
  const navigate = useNavigate();
  const categories = useCategories();
  const [sheet, setSheet] = useState<OpenSheet>(null);

  if (data === undefined) return <TopBar />;
  if (data === null) {
    return (
      <>
        <TopBar />
        <ScreenBody>
          <p className={styles.missing}>This item no longer exists.</p>
        </ScreenBody>
      </>
    );
  }

  const { item, leftovers, parent } = data;
  const archived = item.archivedAt != null;
  const storeName = (sid?: string) => stores.find((s) => s.id === sid)?.name;
  const plural = (n: number) => formatQuantity(n, item.unit);

  const thresholdValue =
    item.lowThreshold != null
      ? plural(item.lowThreshold)
      : isSetUp(item)
        ? plural(effectiveThreshold(item)!)
        : '25% of par';

  return (
    <>
      <TopBar onEdit={() => setSheet('name')} />
      <ScreenBody>
        <div className={styles.identity}>
          <span className={styles.iconTileLg}>
            <Icon path={categoryIcon(item.category, categories.byId)} size={28} strokeWidth={1.5} />
          </span>
          <div className={styles.identityText}>
            <h1 className={styles.name}>{item.name}</h1>
            <span className={styles.category}>
              {categoryName(item.category, categories.byId)}{' '}
              <button type="button" className={styles.inlineLink} onClick={() => setSheet('category')}>
                Change
              </button>
            </span>
            {parent && (
              <span className={styles.category}>
                Opened from <Link to={`/item/${parent.id}`}>{parent.name}</Link>
              </span>
            )}
          </div>
        </div>

        {archived && (
          <div className={styles.notice} role="status">
            <span className={styles.noticeTitle}>Archived</span>
            <span className={styles.noticeText}>Hidden from inventory and the list. Restore it to track it again.</span>
          </div>
        )}

        {isSetUp(item) ? (
          <AmountBlock item={item} />
        ) : (
          <div className={styles.notice}>
            <span className={styles.noticeTitle}>Not tracked yet</span>
            <span className={styles.noticeText}>
              Add a unit and par to get a status bar. You'll be asked for the rest when {item.name} first needs to go
              on the list.
            </span>
            <Button className={styles.noticeAction} size={44} onClick={() => setSheet('setup')}>
              Set unit &amp; par
            </Button>
          </div>
        )}

        <div className={styles.spacer} />

        <div>
          <FieldRow label="Unit" value={item.unit} onClick={() => setSheet('unit')} />
          <FieldRow
            label="Package size"
            value={
              item.packageSize &&
              `1 ${item.unit ?? 'package'} = ${formatNumber(item.packageSize.amount)} ${item.packageSize.unit}`
            }
            onClick={() => setSheet('packageSize')}
          />
          <FieldRow label="Par" value={item.par != null ? plural(item.par) : undefined} onClick={() => setSheet('par')} />
          <FieldRow
            label="Low threshold"
            value={thresholdValue}
            note={item.lowThreshold == null && isSetUp(item) ? 'default' : undefined}
            muted={!isSetUp(item)}
            onClick={() => setSheet('lowThreshold')}
          />
          <FieldRow label="Location" value={data.locationLabel} onClick={() => setSheet('location')} />
          {!item.isLeftover && (
            <>
              <FieldRow
                label="Preferred store"
                value={storeName(item.preferredStoreId)}
                onClick={() => setSheet('preferredStore')}
              />
              <FieldRow
                label="Secondary store"
                value={storeName(item.secondaryStoreId)}
                onClick={() => setSheet('secondaryStore')}
              />
            </>
          )}
        </div>

        {leftovers.length > 0 && (
          <div className={styles.leftovers}>
            <h2 className={styles.sectionLabel}>{leftovers.length === 1 ? 'Linked leftover' : 'Linked leftovers'}</h2>
            {leftovers.map((l) => (
              <Link key={l.id} to={`/item/${l.id}`} className={styles.leftoverCard}>
                <span className={styles.leftoverText}>
                  <span className={styles.leftoverName}>{l.name}</span>
                  <LeftoverWhere item={l} />
                </span>
                <span className={styles.leftoverAmount}>{isSetUp(l) ? formatAmount(l) : ''}</span>
                <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.chevron} />
              </Link>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          {!item.isLeftover && isSetUp(item) && !archived && (
            <Button onClick={() => setSheet('openOne')}>Open one</Button>
          )}
          {archived ? (
            <>
              <Button variant="secondary" onClick={async () => nag.report(item.id, await repo.restoreItem(item.id))}>
                Restore
              </Button>
              <Button variant="text" size={44} className={styles.dangerText} onClick={() => setSheet('delete')}>
                Delete permanently
              </Button>
            </>
          ) : (
            <Button variant="text" size={44} onClick={() => void repo.archiveItem(item.id)}>
              Archive item
            </Button>
          )}
        </div>
      </ScreenBody>

      {sheet === 'setup' && (
        <ItemSetupSheet
          item={item}
          fields={['unit', 'par', 'amount']}
          title={`Set up ${item.name}`}
          description="The unit is what one tap counts. Par is a full stock."
          dismissLabel="Cancel"
          onClose={(change) => {
            setSheet(null);
            if (change) nag.report(item.id, change);
          }}
        />
      )}
      {sheet === 'openOne' && <OpenOneSheet parent={item} leftovers={leftovers} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <ConfirmSheet
          title={`Delete ${item.name} for good?`}
          consequence="It can't be restored afterwards. Any leftovers made from it stay in your pantry."
          onConfirm={async () => {
            await repo.deleteItem(item.id);
            navigate('/', { replace: true });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && sheet !== 'setup' && sheet !== 'openOne' && sheet !== 'delete' && (
        <FieldSheet item={item} field={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  );
}

function TopBar({ onEdit }: { onEdit?: () => void }) {
  const wide = useWide();
  const list = lastListLocation();
  return (
    <header className={styles.topBar}>
      {wide ? (
        // Tablet: the list is still on the left; this just empties the detail pane.
        <Link to={`${list.pathname}${list.search}`} className={styles.back}>
          Close
        </Link>
      ) : (
        <Link to="/" className={styles.back}>
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
          Inventory
        </Link>
      )}
      {onEdit && (
        <button type="button" className={styles.edit} onClick={onEdit} aria-label="Edit name">
          Edit
        </button>
      )}
    </header>
  );
}

/** Large bar (22px track, 48px zone) with "3 cans" / "of 8 cans" above it. */
function AmountBlock({ item }: { item: Item }) {
  const nag = useNag();
  const [amount, setAmount] = useOptimisticAmount(item, (change) => nag.report(item.id, change));
  const current = { ...item, amount };
  const single = isSingleContainer(item);
  const unit = item.unit ?? 'unit';
  return (
    <div className={styles.amountBlock}>
      <div className={styles.amountLine}>
        <span className={styles.amountValue}>{formatAmount(current)}</span>
        <span className={styles.amountOf}>of {formatQuantity(item.par!, item.unit)}</span>
      </div>
      <StatusBar item={item} amount={amount} onChange={setAmount} size="large" />
      <span className={styles.hint}>
        Tap a half to step by {single ? '10%' : `one ${unit}`}. Drag to set an exact amount.
      </span>
    </div>
  );
}

function FieldRow({
  label,
  value,
  note,
  muted,
  onClick,
}: {
  label: string;
  value?: string;
  note?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.fieldRow} onClick={onClick}>
      <span className={styles.fieldLabel}>{label}</span>
      {value ? (
        <span className={muted ? styles.fieldMuted : styles.fieldValue}>{value}</span>
      ) : (
        <span className={styles.fieldAdd}>Add</span>
      )}
      {note && <span className={styles.fieldNote}>{note}</span>}
      <Icon name="chevronRight" size={16} strokeWidth={2} className={styles.chevron} />
    </button>
  );
}

function LeftoverWhere({ item }: { item: Item }) {
  const data = useItem(item.id);
  return <span className={styles.leftoverWhere}>{data?.locationLabel ?? ''}</span>;
}
