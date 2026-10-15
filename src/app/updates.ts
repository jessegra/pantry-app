// Service worker update checks. vite-plugin-pwa (autoUpdate) reloads the page by
// itself once a new version is installed; these just make it look more often.
// Installed iPhone apps rarely check on their own, which can leave an old build running.

export const BUILD = { version: __APP_VERSION__, sha: __BUILD_SHA__, time: __BUILD_TIME__ };

async function registration() {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

/** Ask the server for a newer build. 'updating' means it was found and the app will reload. */
export async function checkForUpdate(): Promise<'unsupported' | 'current' | 'updating' | 'offline'> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  return reg.installing || reg.waiting ? 'updating' : 'current';
}

/** Check whenever the app comes back to the foreground. */
export function watchForUpdates() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registration().then((r) => r?.update().catch(() => {}));
  });
}
