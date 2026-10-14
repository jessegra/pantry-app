import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useItem } from '../data/hooks';
import type { ID } from '../domain/types';
import { ItemSetupSheet, type SetupField } from '../screens/item/ItemSetupSheet';
import { askedThisSession, NagContext, type NagApi } from './nag';

type Prompt = { itemId: ID; fields: SetupField[] };

/**
 * The nag: nothing is asked before it's needed. When an item first reaches the
 * shopping list without a store (or a not-set-up item is added by hand), a
 * non-blocking sheet asks for the missing fields. Skipping is fine.
 */
export function NagProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const ask = useCallback((itemId: ID, fields: SetupField[]) => {
    if (askedThisSession.has(itemId) || fields.length === 0) return;
    askedThisSession.add(itemId);
    setPrompt({ itemId, fields });
  }, []);

  const api = useMemo<NagApi>(
    () => ({
      report: (itemId, change) => {
        if (change.promptForStore) ask(itemId, ['preferredStore']);
      },
      askForMissing: (itemId, missing) => ask(itemId, missing),
    }),
    [ask],
  );

  return (
    <NagContext.Provider value={api}>
      {children}
      {prompt && <NagSheet prompt={prompt} onDone={() => setPrompt(null)} />}
    </NagContext.Provider>
  );
}

function NagSheet({ prompt, onDone }: { prompt: Prompt; onDone: () => void }) {
  const data = useItem(prompt.itemId);
  if (!data) return null;
  const { item } = data;
  const storeOnly = prompt.fields.length === 1 && prompt.fields[0] === 'preferredStore';
  return (
    <ItemSetupSheet
      item={item}
      fields={prompt.fields}
      title={storeOnly ? `Where do you buy ${item.name}?` : `Set up ${item.name}`}
      description={
        storeOnly
          ? 'It’s on the shopping list under Unassigned. Pick a store and it moves there.'
          : 'It’s on the shopping list. These let the list keep it topped up.'
      }
      dismissLabel="Skip"
      onClose={onDone}
    />
  );
}
