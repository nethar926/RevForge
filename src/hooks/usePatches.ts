import { useCallback, useEffect, useState } from 'react';
import type { EnginePatch } from '../audio';
import { BUILTIN_PATCHES, migrateEnginePatch } from '../audio';
import { storageKey } from '../lib/storageKey';

const KEY = 'drivesynth.patches.v1';
const BUILTIN_IDS = new Set(BUILTIN_PATCHES.map((p) => p.id));

function loadUser(): EnginePatch[] {
  try {
    const raw = localStorage.getItem(storageKey(KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EnginePatch[];
    return Array.isArray(parsed) ? parsed.map(migrateEnginePatch) : [];
  } catch {
    return [];
  }
}

export function usePatches() {
  const [userPatches, setUserPatches] = useState<EnginePatch[]>(() => loadUser());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(KEY), JSON.stringify(userPatches));
    } catch {
      /* ignore */
    }
  }, [userPatches]);

  const savePatch = useCallback((patch: EnginePatch) => {
    const migrated = migrateEnginePatch(patch);
    setUserPatches((list) => {
      const idx = list.findIndex((p) => p.id === migrated.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = migrated;
        return next;
      }
      return [...list, migrated];
    });
  }, []);

  const deletePatch = useCallback((id: string) => {
    if (BUILTIN_IDS.has(id)) return;
    setUserPatches((list) => list.filter((p) => p.id !== id));
  }, []);

  const allPatches = [...BUILTIN_PATCHES, ...userPatches];

  return { userPatches, allPatches, builtins: BUILTIN_PATCHES, savePatch, deletePatch };
}
