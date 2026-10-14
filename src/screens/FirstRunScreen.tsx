import { useState } from 'react';
import { repo } from '../data/repo';
import styles from './FirstRunScreen.module.css';

/** Shown once, on an empty database. No mockup; built from the design system. */
export function FirstRunScreen() {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.screen}>
      <div className={styles.intro}>
        <h1 className={styles.title}>Pantry</h1>
        <p className={styles.lead}>
          See what's on hand, tap a bar when you use something, and the shopping list builds itself.
        </p>
      </div>
      <div className={styles.choices}>
        <button className={styles.primary} disabled={busy} onClick={run(() => repo.startEmpty())}>
          Start empty
        </button>
        <button className={styles.secondary} disabled={busy} onClick={run(() => repo.loadSampleData())}>
          Load sample data
        </button>
        <p className={styles.caption}>Sample data is a small example kitchen with three stores, for trying the app out.</p>
      </div>
    </main>
  );
}
