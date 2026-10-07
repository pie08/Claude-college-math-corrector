import { useCallback, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

import { parseUnit, UNIT_KEY } from './units';

export function getCurrentUnit(): string | null {
  try {
    return parseUnit(Storage.getItemSync(UNIT_KEY));
  } catch {
    return null;
  }
}

export function setCurrentUnit(unit: string | null): void {
  if (unit) Storage.setItemSync(UNIT_KEY, unit);
  else Storage.removeItemSync(UNIT_KEY);
}

/** The saved unit plus a setter that persists it. */
export function useCurrentUnit(): [string | null, (unit: string | null) => void] {
  const [unit, setUnit] = useState(getCurrentUnit);
  const update = useCallback((next: string | null) => {
    setCurrentUnit(next);
    setUnit(next);
  }, []);
  return [unit, update];
}
