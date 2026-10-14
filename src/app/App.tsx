import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { TabBar } from './TabBar';
import { useInitialized, useShoppingList } from '../data/hooks';
import { FirstRunScreen } from '../screens/FirstRunScreen';
import { NagProvider } from './NagProvider';
import styles from './App.module.css';
import { InventoryScreen } from '../screens/inventory/InventoryScreen';
import { ItemDetailScreen } from '../screens/item/ItemDetailScreen';
import { QuickAddScreen } from '../screens/add/QuickAddScreen';
import { ShoppingListScreen } from '../screens/list/ShoppingListScreen';
import { JustShoppedScreen } from '../screens/JustShoppedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

/** Top-level screens: content above the bottom tab bar. */
function TabLayout() {
  const listCount = useShoppingList()?.remaining ?? 0;
  return (
    <div className={styles.frame}>
      <div className={styles.content}>
        <Outlet />
      </div>
      <TabBar listCount={listCount} />
    </div>
  );
}

/** Pushed screens (item detail, just shopped): no tab bar. */
function StackLayout() {
  return (
    <div className={styles.frame}>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}

export function App() {
  const initialized = useInitialized();
  if (initialized === undefined) return null; // first IndexedDB read: a few ms
  if (!initialized) return <FirstRunScreen />;
  return (
    <NagProvider>
      <AppRoutes />
    </NagProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<TabLayout />}>
        <Route index element={<InventoryScreen />} />
        <Route path="list" element={<ShoppingListScreen />} />
        <Route path="add" element={<QuickAddScreen />} />
        <Route path="settings" element={<Navigate to="/settings/locations" replace />} />
        <Route path="settings/:section" element={<SettingsScreen />} />
      </Route>
      <Route element={<StackLayout />}>
        <Route path="item/:id" element={<ItemDetailScreen />} />
        <Route path="shopped" element={<JustShoppedScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
