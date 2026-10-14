import { Navigate, NavLink, useParams } from 'react-router-dom';
import { Placeholder, ScreenBody, ScreenHeader, ScreenTitle } from '../ui/Screen';
import styles from './SettingsScreen.module.css';

const SECTIONS = [
  { key: 'locations', label: 'Locations' },
  { key: 'stores', label: 'Stores' },
] as const;

export function SettingsScreen() {
  const { section } = useParams();
  if (!SECTIONS.some((s) => s.key === section)) return <Navigate to="/settings/locations" replace />;

  return (
    <>
      <ScreenHeader>
        <ScreenTitle>Settings</ScreenTitle>
        <nav aria-label="Settings sections" className={styles.segmented}>
          {SECTIONS.map((s) => (
            <NavLink key={s.key} to={`/settings/${s.key}`} className={styles.segment}>
              {s.label}
            </NavLink>
          ))}
        </nav>
      </ScreenHeader>
      <ScreenBody>
        <Placeholder milestone="Milestone 8">
          {section === 'stores' ? 'Add, rename, reorder and delete stores.' : 'Add, rename, reorder and delete locations and groups.'}
        </Placeholder>
      </ScreenBody>
    </>
  );
}
