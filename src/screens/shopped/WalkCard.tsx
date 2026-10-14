import { useId } from 'react';
import { formatNumber, pluralUnit } from '../../domain/rules';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import styles from './Shopped.module.css';

interface Props {
  /** Store (list walk) or location (house walk). */
  eyebrow: string;
  name: string;
  /** "List asked for 3 lb" */
  subtitle?: string;
  question: string;
  quantity: number;
  onQuantity: (q: number) => void;
  unit?: string;
  step: number;
  /** "On hand after: 4 lb" */
  consequence: string;
  onSkip: () => void;
  onConfirm: () => void;
  busy: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** One item at a time: big name, 72px stepper, Skip / Confirm (Shopped.dc.html). */
export function WalkCard(p: Props) {
  const qId = useId();
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.eyebrow}>{p.eyebrow}</span>
        <h1 className={styles.bigName}>{p.name}</h1>
        {p.subtitle && <span className={styles.subtitle}>{p.subtitle}</span>}
      </div>

      <div className={styles.qtyBlock}>
        <span id={qId} className={styles.question}>
          {p.question}
        </span>
        <div role="group" aria-labelledby={qId} className={styles.bigStepper}>
          <button
            type="button"
            aria-label="One fewer"
            onClick={() => p.onQuantity(Math.max(0, round(p.quantity - p.step)))}
          >
            <Icon name="minus" size={24} strokeWidth={2.4} />
          </button>
          <output className={styles.bigValue} aria-live="polite">
            <span className={styles.bigNumber}>{formatNumber(p.quantity)}</span>
            {p.unit && <span className={styles.bigUnit}>{pluralUnit(p.unit, p.quantity)}</span>}
          </output>
          <button type="button" aria-label="One more" onClick={() => p.onQuantity(round(p.quantity + p.step))}>
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </button>
        </div>
        <span className={styles.consequence}>{p.consequence}</span>
      </div>

      <div className={styles.grow} />

      <div className={styles.decide}>
        <Button variant="neutral" size={56} onClick={p.onSkip} disabled={p.busy}>
          Skip
        </Button>
        <Button size={56} onClick={p.onConfirm} disabled={p.busy}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
