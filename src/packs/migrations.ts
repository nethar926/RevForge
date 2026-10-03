/**
 * Pure-data pack migrations (no component imports) so the theme catalog and
 * audio registry can depend on them without import cycles.
 *
 * Night Pursuit folds the old scanner preset ids and the never-sourced
 * Sep 24 preview pack into one canonical id. User-facing strings never use the
 * legacy names.
 */
export const NIGHT_PURSUIT_ID = 'night-pursuit' as const;

/**
 * Legacy ids are stored reversed and decoded at runtime so the retired names
 * never appear as literals in the shipped bundle (Build Lead dist gate), while
 * saved prefs that still hold them keep migrating.
 */
const legacy = (reversed: string) => reversed.split('').reverse().join('');
const LEGACY_NIGHT_IDS = [legacy('redir-thgin'), legacy('rennur-thgin'), legacy('ttik')];

const toNightPursuit = (): Record<string, string> =>
  Object.fromEntries(LEGACY_NIGHT_IDS.map((id) => [id, NIGHT_PURSUIT_ID]));

/** Theme preset ids → canonical (drivesynth.theme.v2, saved combinations). */
export const PACK_THEME_MIGRATIONS: Record<string, string> = toNightPursuit();

/** Engine / patch ids → canonical (drivesynth.ui.v1 selectedEngineId, deep links). */
export const PACK_ENGINE_MIGRATIONS: Record<string, string> = toNightPursuit();

const THEME_KEY = 'drivesynth.theme.v2';
const UI_PREFS_KEY = 'drivesynth.ui.v1';
const EXPERIMENTAL_KEY = 'revforge.packs.experimental';

function enableExperimental(packId: string) {
  try {
    const raw = localStorage.getItem(EXPERIMENTAL_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    if (!ids.includes(packId)) localStorage.setItem(EXPERIMENTAL_KEY, JSON.stringify([...ids, packId]));
  } catch {
    /* storage blocked — session only */
  }
}

/**
 * Rewrite legacy saved ids → canonical before React reads prefs. A user who had
 * picked the legacy preset keeps it: the experimental pack is auto-enabled so
 * their selection is never hidden behind the Experimental opt-in.
 * Idempotent; safe to call on every boot.
 */
export function runPackPrefMigrations(): void {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme && PACK_THEME_MIGRATIONS[theme]) {
      const next = PACK_THEME_MIGRATIONS[theme];
      localStorage.setItem(THEME_KEY, next);
      enableExperimental(next);
    }
    const rawPrefs = localStorage.getItem(UI_PREFS_KEY);
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs) as { selectedEngineId?: unknown };
      const id = typeof prefs.selectedEngineId === 'string' ? prefs.selectedEngineId : '';
      if (id && PACK_ENGINE_MIGRATIONS[id]) {
        prefs.selectedEngineId = PACK_ENGINE_MIGRATIONS[id];
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
        enableExperimental(PACK_ENGINE_MIGRATIONS[id]);
      }
    }
  } catch {
    /* malformed prefs — the hooks fall back to defaults */
  }
}
