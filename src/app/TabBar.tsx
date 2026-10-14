import { NavLink } from 'react-router-dom';
import { Icon, type UiIconName } from '../ui/Icon';
import styles from './TabBar.module.css';

interface Tab {
  to: string;
  label: string;
  icon: UiIconName;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Inventory', icon: 'inventory', end: true },
  { to: '/list', label: 'List', icon: 'cart' },
  { to: '/add', label: 'Add', icon: 'addCircle' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

interface TabBarProps {
  /** Unchecked shopping-list entries. Badge hidden at 0. */
  listCount: number;
}

export function TabBar({ listCount }: TabBarProps) {
  return (
    <nav aria-label="Main" className={styles.bar}>
      {TABS.map((t) => {
        const badge = t.to === '/list' && listCount > 0 ? listCount : 0;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={styles.tab}
            aria-label={badge ? `${t.label}, ${badge} to get` : undefined}
          >
            <Icon name={t.icon} size={22} strokeWidth={1.9} />
            {t.label}
            {badge > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
