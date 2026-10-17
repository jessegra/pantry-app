import { useEffect } from 'react';
import { matchPath, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lastListLocation, rememberListLocation } from './listMemory';
import { Icon } from '../ui/Icon';
import { useWide } from '../ui/useMediaQuery';
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
import { RecipeScreen } from '../screens/recipes/RecipeScreen';
import { RecipesScreen } from '../screens/recipes/RecipesScreen';

/** Top-level screens: content above the bottom tab bar. */
function TabLayout() {
  const listCount = useShoppingList()?.remaining ?? 0;
  return (
    <div className={styles.frame}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <TabBar listCount={listCount} />
    </div>
  );
}

/** Pushed screens (item detail, just shopped): no tab bar. */
function StackLayout() {
  return (
    <div className={styles.frame}>
      <main className={styles.content}>
        <Outlet />
      </main>
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
  return useWide() ? <WideRoutes /> : <PhoneRoutes />;
}

const topLevelRoutes = (
  <>
    <Route index element={<InventoryScreen />} />
    <Route path="list" element={<ShoppingListScreen />} />
    <Route path="recipes" element={<RecipesScreen />} />
    <Route path="add" element={<QuickAddScreen />} />
    <Route path="settings" element={<Navigate to="/settings/locations" replace />} />
    <Route path="settings/:section" element={<SettingsScreen />} />
  </>
);

function PhoneRoutes() {
  return (
    <Routes>
      <Route element={<TabLayout />}>{topLevelRoutes}</Route>
      <Route element={<StackLayout />}>
        <Route path="item/:id" element={<ItemDetailScreen />} />
        <Route path="recipe/:id" element={<RecipeScreen />} />
        <Route path="shopped" element={<JustShoppedScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Tablet (≥ 768px, SPEC §4.8): rail | list pane (Inventory, List, Add, Settings) |
 * detail pane (item detail, or "Select an item"). Opening an item keeps the list
 * that opened it on the left. Just shopped takes the whole screen.
 */
function WideRoutes() {
  const location = useLocation();
  const isDetail =
    matchPath('/item/:id', location.pathname) !== null || matchPath('/recipe/:id', location.pathname) !== null;
  useEffect(() => {
    if (!isDetail) rememberListLocation(location);
  }, [isDetail, location]);

  if (location.pathname === '/shopped') {
    return (
      <div className={styles.frame} data-centered="true">
        <main className={styles.content}>
          <JustShoppedScreen />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.wide}>
      {/* The rail and list pane see the list's location, so the rail highlights its section. */}
      <Routes location={isDetail ? lastListLocation() : location}>
        <Route element={<ListPane />}>{topLevelRoutes}</Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <section className={styles.detailPane} aria-label="Item details">
        <Routes>
          <Route path="item/:id" element={<ItemDetailScreen />} />
          <Route path="recipe/:id" element={<RecipeScreen />} />
          <Route path="*" element={<SelectItem />} />
        </Routes>
      </section>
    </div>
  );
}

function ListPane() {
  const listCount = useShoppingList()?.remaining ?? 0;
  return (
    <>
      <TabBar listCount={listCount} />
      <main className={styles.listPane}>
        <Outlet />
      </main>
    </>
  );
}

function SelectItem() {
  return (
    <div className={styles.selectItem}>
      <Icon name="inventory" size={32} strokeWidth={1.6} />
      <p>Select an item to see its details.</p>
    </div>
  );
}
