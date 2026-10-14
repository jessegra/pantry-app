import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { TabBar } from './TabBar';
import styles from './App.module.css';
import { InventoryScreen } from '../screens/InventoryScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { QuickAddScreen } from '../screens/QuickAddScreen';
import { ShoppingListScreen } from '../screens/ShoppingListScreen';
import { JustShoppedScreen } from '../screens/JustShoppedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

/** Top-level screens: content above the bottom tab bar. */
function TabLayout() {
  // TODO(M2): read the unchecked entry count from useShoppingList().
  const listCount = 0;
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
