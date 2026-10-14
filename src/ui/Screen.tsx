import type { ReactNode } from 'react';
import styles from './Screen.module.css';

/** Fixed top band. Starts below the safe area. */
export function ScreenHeader({ children }: { children: ReactNode }) {
  return <header className={styles.header}>{children}</header>;
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

/** The scrolling middle band. */
export function ScreenBody({ children }: { children: ReactNode }) {
  return <main className={styles.body}>{children}</main>;
}

/** Stand-in body for screens not built yet. */
export function Placeholder({ milestone, children }: { milestone: string; children: ReactNode }) {
  return (
    <div className={styles.placeholder}>
      <p>{children}</p>
      <p className={styles.caption}>Coming in {milestone}.</p>
    </div>
  );
}
