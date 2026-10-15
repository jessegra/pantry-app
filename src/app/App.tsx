import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { TabBar } from './TabBar';
import { useInitialized, useShoppingList } from '../data/hooks';
import { repo } from '../data/repo';
import { NagProvider } from './NagProvider';
import { CategoriesProvider } from './CategoriesProvider';
import styles from './App.module.css';
import { InventoryScreen } from '../screens/inventory/InventoryScreen';
import { ItemDetailScreen } from '../screens/item/ItemDetailScreen';
import { QuickAddScreen } from '../screens/add/QuickAddScreen';
import { ShoppingListScreen } from '../screens/list/ShoppingListScreen';
import { JustShoppedScreen } from '../screens/shopped/JustShoppedScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';

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
  useEffect(() => {
    if (initialized === false) void repo.ensureInitialized();
  }, [initialized]);
  if (!initialized) return null; // first IndexedDB read, or loading sample data: a moment
  return (
    <CategoriesProvider>
      <NagProvider>
        <AppRoutes />
      </NagProvider>
    </CategoriesProvider>
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
