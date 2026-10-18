import { setTextSize, TEXT_SIZES, useTextSize } from '../../app/textSize';
import { Chip } from '../../ui/Chip';
import styles from './Settings.module.css';

/** Settings → More → Text size. Just for this device. */
export function TextSizeSection() {
  const size = useTextSize();
  return (
    <section className={styles.section} aria-labelledby="text-size-h">
      <h2 id="text-size-h" className={styles.sectionLabel}>
        Text size
      </h2>
      <div className={styles.syncBox}>
        <div className={styles.textSizes} role="radiogroup" aria-labelledby="text-size-h">
          {TEXT_SIZES.map((s) => (
            <Chip key={s.key} kind="radio" selected={size === s.key} onClick={() => setTextSize(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <p className={styles.footnoteTight}>Bigger text everywhere in the app, on this device only.</p>
      </div>
    </section>
  );
}
