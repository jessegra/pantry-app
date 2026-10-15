import type { ReactNode } from 'react';
import styles from './Screen.module.css';

/** Fixed top band. Starts below the safe area. */
export function ScreenHeader({ children }: { children: ReactNode }) {
  return <header className={styles.header}>{children}</header>;
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

/** The scrolling middle band. (The app layout owns the one <main> landmark.) */
export function ScreenBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}
