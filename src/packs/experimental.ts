/** Enabled experimental pack ids. JSON string array in localStorage. */
export const EXPERIMENTAL_PACKS_KEY = 'revforge.packs.experimental';

function readList(): string[] {
  try {
    const raw = localStorage.getItem(EXPERIMENTAL_PACKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

function writeList(ids: string[]) {
  try {
    localStorage.setItem(EXPERIMENTAL_PACKS_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* session-only */
  }
}

export function listEnabledExperimentalPacks(): string[] {
  return readList();
}

export function isExperimentalPackEnabled(packId: string): boolean {
  return readList().includes(packId);
}

export function setExperimentalPackEnabled(packId: string, enabled: boolean): void {
  const cur = readList();
  if (enabled) {
    if (!cur.includes(packId)) writeList([...cur, packId]);
  } else {
    writeList(cur.filter((id) => id !== packId));
  }
  try {
    window.dispatchEvent(
      new CustomEvent('revforge:experimental-packs', { detail: { packId, enabled } }),
    );
  } catch {
    /* non-DOM */
  }
}
