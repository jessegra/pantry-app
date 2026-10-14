import { Navigate, NavLink, useParams } from 'react-router-dom';
import { ScreenBody, ScreenHeader, ScreenTitle } from '../../ui/Screen';
import { LocationsSettings } from './LocationsSettings';
import { MoreSettings } from './MoreSettings';
import { StoresSettings } from './StoresSettings';
import styles from './Settings.module.css';

const SECTIONS = [
  { key: 'locations', label: 'Locations' },
  { key: 'stores', label: 'Stores' },
  // Not in the mockups: archived items and backup.
  { key: 'more', label: 'More' },
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
        {section === 'locations' && <LocationsSettings />}
        {section === 'stores' && <StoresSettings />}
        {section === 'more' && <MoreSettings />}
      </ScreenBody>
    </>
  );
}
