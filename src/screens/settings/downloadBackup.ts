import { repo } from '../../data/repo';

/** Saves a JSON backup of everything to the device. Returns the file name. */
export async function downloadBackup(): Promise<string> {
  const backup = await repo.exportData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pantry-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return a.download;
}
