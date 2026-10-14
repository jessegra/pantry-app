import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../data/hooks';
import { repo } from '../../data/repo';
import { formatQuantity, isSetUp } from '../../domain/rules';
import type { tripOrder, TripResult } from '../../domain/trip';
import type { Item } from '../../domain/types';
import { Button } from '../../ui/Button';
import { TripDone } from './TripDone';
import { WalkCard } from './WalkCard';
import styles from './Shopped.module.css';

type Plan = ReturnType<typeof tripOrder>;
type House = Awaited<ReturnType<typeof repo.housePlan>>;
type Phase = 'loading' | 'list' | 'end' | 'house' | 'done';

/** Shopped.dc.html + ShoppedDone.dc.html / SPEC §4.6. */
export function JustShoppedScreen() {
  const navigate = useNavigate();
  const inventory = useInventory();
  const itemsById = new Map((inventory?.items ?? []).map((i) => [i.id, i]));

  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<Plan>([]);
  const [i, setI] = useState(0);
  const [qty, setQty] = useState(0);
  const [results, setResults] = useState<TripResult[]>([]);
  const [house, setHouse] = useState<House>([]);
  const [houseUpdates, setHouseUpdates] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void repo.tripPlan().then((p) => {
      setPlan(p);
      setQty(p[0]?.quantity ?? 0);
      setPhase(p.length ? 'list' : 'end');
    });
  }, []);

  const step = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const finish = () =>
    step(async () => {
      await repo.finishTrip();
      setPhase('done');
    });

  // ---- list walk ----
  const advanceList = (result: TripResult) => {
    setResults((r) => [...r, result]);
    if (i + 1 < plan.length) {
      setI(i + 1);
      setQty(plan[i + 1].quantity);
    } else {
      setPhase('end');
    }
  };

  const confirmEntry = () =>
    step(async () => {
      const e = plan[i];
      await repo.logPurchase(e.id, qty);
      advanceList(
        qty > 0
          ? { kind: 'bought', entryId: e.id, name: e.name, quantity: qty, unit: e.unit, itemId: e.itemId }
          : { kind: 'skipped', entryId: e.id, name: e.name },
      );
    });

  const skipEntry = () =>
    step(async () => {
      const e = plan[i];
      await repo.skipEntry(e.id);
      advanceList({ kind: 'skipped', entryId: e.id, name: e.name });
    });

  // ---- house walk ----
  const startHouse = () =>
    step(async () => {
      const bought = new Set(results.flatMap((r) => (r.kind === 'bought' && r.itemId ? [r.itemId] : [])));
      const h = await repo.housePlan(bought);
      if (!h.length) {
        await repo.finishTrip();
        setPhase('done');
        return;
      }
      setHouse(h);
      setI(0);
      setQty(h[0].item.amount);
      setPhase('house');
    });

  const advanceHouse = async () => {
    if (i + 1 < house.length) {
      setI(i + 1);
      setQty(house[i + 1].item.amount);
    } else {
      await repo.finishTrip();
      setPhase('done');
    }
  };

  const confirmHouse = () =>
    step(async () => {
      const { item } = house[i];
      if (qty !== item.amount) {
        await repo.setAmount(item.id, qty);
        setHouseUpdates((n) => n + 1);
      }
      await advanceHouse();
    });

  // ---- render ----
  if (phase === 'done') {
    return <TripDone results={results} houseUpdates={houseUpdates} itemsById={itemsById} />;
  }

  const total = phase === 'house' ? house.length : plan.length;
  const at = phase === 'list' || phase === 'house' ? i : total;
  const segments = Array.from({ length: total }, (_, k) => {
    if (k === at) return 'current';
    if (k > at) return 'todo';
    if (phase === 'house') return 'done';
    return results[k]?.kind === 'skipped' ? 'skipped' : 'done';
  });

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          {/* Close leaves; logged entries stay checked on the list until a trip is finished. */}
          {phase !== 'house' ? (
            <button type="button" className={styles.close} onClick={() => navigate('/list')}>
              Close
            </button>
          ) : (
            <button type="button" className={styles.close} onClick={() => void finish()} disabled={busy}>
              Finish
            </button>
          )}
          <span className={styles.headerTitle}>{phase === 'house' ? 'Around the house' : 'Just shopped'}</span>
          <span className={styles.progressText}>{total > 0 && `${Math.min(at + 1, total)} of ${total}`}</span>
        </div>
        {total > 0 && (
          <div
            role="progressbar"
            aria-label={phase === 'house' ? 'Items checked' : 'Items logged'}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(at, total)}
            className={styles.segments}
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {segments.map((s, k) => (
              <span key={k} className={styles.segment} data-state={s} />
            ))}
          </div>
        )}
      </header>

      {phase === 'list' && plan[i] && (
        <WalkCard
          key={plan[i].id}
          eyebrow={plan[i].storeName}
          name={plan[i].name}
          subtitle={`List asked for ${formatQuantity(plan[i].quantity, plan[i].unit)}`}
          question="How many did you buy?"
          quantity={qty}
          onQuantity={setQty}
          unit={plan[i].unit}
          step={1}
          consequence={consequence(plan[i].itemId ? itemsById.get(plan[i].itemId!) : undefined, qty)}
          onSkip={() => void skipEntry()}
          onConfirm={() => void confirmEntry()}
          busy={busy}
        />
      )}

      {phase === 'house' && house[i] && (
        <WalkCard
          key={house[i].item.id}
          eyebrow={house[i].where}
          name={house[i].item.name}
          question="Have now"
          quantity={qty}
          onQuantity={setQty}
          unit={house[i].item.unit}
          step={house[i].item.par === 1 ? 0.1 : 1}
          consequence={`Par is ${formatQuantity(house[i].item.par!, house[i].item.unit)}`}
          onSkip={() => void step(advanceHouse)}
          onConfirm={() => void confirmHouse()}
          busy={busy}
        />
      )}

      {phase === 'end' && (
        <div className={styles.card}>
          <h1 className={styles.endTitle}>{plan.length ? "That's the whole list." : 'The list is empty.'}</h1>
          <p className={styles.subtitle}>
            Bought anything that wasn't on it? Walk through the rest of the house and log it the same way.
          </p>
          <div className={styles.grow} />
          <div className={styles.endActions}>
            <Button size={56} onClick={() => void finish()} disabled={busy}>
              Finish
            </Button>
            <Button variant="secondary" size={56} onClick={() => void startHouse()} disabled={busy}>
              Continue through the house
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function consequence(item: Item | undefined, qty: number): string {
  if (!item) return 'Not tracked in inventory';
  if (!isSetUp(item)) return `${item.name} has no amount tracked yet`;
  const after = Math.round((item.amount + qty) * 100) / 100;
  return `On hand after: ${formatQuantity(after, item.unit)}`;
}
