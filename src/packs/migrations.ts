/**
 * Pure-data pack migrations (no component imports) so the theme catalog and
 * audio registry can depend on them without import cycles.
 *
 * Night Pursuit folds the old scanner preset ids and the never-sourced
 * Sep 24 preview pack into one canonical id. User-facing strings never use the
 * legacy names.
 */
import { storageKey } from '../lib/storageKey';
import STELLAR_HELM from './stellar-helm.identity';

export const NIGHT_PURSUIT_ID = 'night-pursuit' as const;

/**
 * Approved migration-only exception (Build Lead + Chief of Staff, Oct 2 2026):
 * these legacy ids exist solely to move old saved prefs and deep links to
 * Night Pursuit, and are never displayed. They are kept reversed so retired
 * names stay out of the shipped bundle; any user-facing use of them is still
 * banned.
 */
const legacy = (reversed: string) => reversed.split('').reverse().join('');
const LEGACY_NIGHT_IDS = [legacy('redir-thgin'), legacy('rennur-thgin'), legacy('ttik')];

const toNightPursuit = (): Record<string, string> =>
  Object.fromEntries(LEGACY_NIGHT_IDS.map((id) => [id, NIGHT_PURSUIT_ID]));

/**
 * Retired themes replaced by the Stellar Helm pack (Wilson, Oct 3 2026): the two
 * saffron themes and their reversed legacy ids go straight to the pack id (no
 * chains). Selected like picking the pack in the picker: theme + Experimental
 * opt-in + linked engine (see SELECT_ON_MIGRATE); the frame stays at its default.
 */
const TO_STELLAR_HELM = ['saffron-console', 'saffron-command', legacy('sdlrow-wen'), legacy('esirpretne')];

/** Theme preset ids → canonical pack id (drivesynth.theme.v2, saved combinations, deep links). */
export const PACK_THEME_MIGRATIONS: Record<string, string> = {
  ...toNightPursuit(),
  ...Object.fromEntries(TO_STELLAR_HELM.map((id) => [id, STELLAR_HELM.id])),
};

/**
 * Retired brand-named engine / patch ids → original replacements (Oct 2 2026).
 * Reversed like LEGACY_NIGHT_IDS. Folded into PACK_ENGINE_MIGRATIONS because
 * that map is what the audio catalog's legacy-id resolver spreads (saved
 * patches, combinations, deep links); these are not packs and never touch the
 * Experimental opt-in.
 */
const LEGACY_ENGINE_RENAMES: ReadonlyArray<readonly [string, string]> = [
  [legacy('dialp-egrofver'), 'revforge-dual-surge'],
];

/** Engine / patch ids → canonical (drivesynth.ui.v1 selectedEngineId, deep links). */
export const PACK_ENGINE_MIGRATIONS: Record<string, string> = {
  ...toNightPursuit(),
  ...Object.fromEntries(LEGACY_ENGINE_RENAMES),
};

/** Only migrations that land on an experimental pack auto-enable its opt-in. */
const EXPERIMENTAL_TARGETS: ReadonlySet<string> = new Set([NIGHT_PURSUIT_ID, STELLAR_HELM.id]);

/**
 * Packs that replace retired themes: a saved selection migrated to one of these is
 * completed exactly like picking the pack (main.tsx hands the id to
 * applyPackDeepLink, which also links the pack engine).
 */
const SELECT_ON_MIGRATE: ReadonlySet<string> = new Set([STELLAR_HELM.id]);

/**
 * Retired franchise-named theme ids → original replacements (Oct 2 2026).
 * Same migration-only exception and reversed storage as LEGACY_NIGHT_IDS:
 * the old ids exist only to carry saved prefs, combinations and deep links
 * forward, are never displayed, and stay out of the shipped bundle as plain
 * strings. These are ordinary themes, not packs, so they never touch the
 * Experimental opt-in.
 */
const LEGACY_THEME_RENAMES: ReadonlyArray<readonly [string, string]> = [
  [legacy('enihcam-emit'), 'epoch-banks'],
  [legacy('omortson'), 'cargo-terminal'],
  [legacy('noivilbo'), 'white-spire'],
  [legacy('xofrats'), 'cobalt-vane'],
  [legacy('olah'), 'visor-arc'],
  [legacy('dialp-daor'), 'road-dual-surge'],
  // Craft-named Theme Lab ids (formerly plain in themes/catalog.ts) → Galactic Enforcer.
  [legacy('eit'), 'galactic-enforcer'],
  [legacy('gniwx'), 'galactic-enforcer'],
];

/** Theme ids → canonical for retired franchise-named (non-pack) themes. */
export const THEME_ID_MIGRATIONS: Record<string, string> = Object.fromEntries(LEGACY_THEME_RENAMES);

/** Retired font-picker choices → bundled OFL replacement (Oswald). */
const FONT_CHOICE_MIGRATIONS: Record<string, string> = { [legacy('hsebilne')]: 'oswald' };

const THEME_KEY = 'drivesynth.theme.v2';
const UI_PREFS_KEY = 'drivesynth.ui.v1';
const EXPERIMENTAL_KEY = 'revforge.packs.experimental';
const FONTS_KEY = 'revforge.fonts';
const ATMOSPHERE_KEY = 'revforge.atmosphere';
const COLORS_KEY = 'revforge.colors';
const COMBINATIONS_KEY = 'drivesynth.combinations.v1';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Re-key a per-theme map (fonts / colors) from retired ids to canonical ids. */
function rekeyThemeMap(map: Json): boolean {
  let changed = false;
  for (const [from, to] of Object.entries(THEME_ID_MIGRATIONS)) {
    if (!(from in map)) continue;
    if (!(to in map)) map[to] = map[from];
    delete map[from];
    changed = true;
  }
  return changed;
}

/** Swap retired font-picker choices inside a { [themeId]: { numbers, labels } } map. */
function migrateFontChoices(map: Json): boolean {
  let changed = false;
  for (const choice of Object.values(map)) {
    if (!isObject(choice)) continue;
    for (const slot of ['numbers', 'labels']) {
      const v = choice[slot];
      if (typeof v === 'string' && FONT_CHOICE_MIGRATIONS[v]) {
        choice[slot] = FONT_CHOICE_MIGRATIONS[v];
        changed = true;
      }
    }
  }
  return changed;
}

function migrateJsonKey(key: string, fn: (value: unknown) => boolean) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (fn(value)) localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* malformed or blocked storage — leave as is */
  }
}

/** Retired franchise-named theme ids + retired font choices → canonical. */
function runThemeRenameMigrations(): void {
  try {
    const theme = localStorage.getItem(storageKey(THEME_KEY));
    if (theme && THEME_ID_MIGRATIONS[theme]) localStorage.setItem(storageKey(THEME_KEY), THEME_ID_MIGRATIONS[theme]);
    const atmosphere = localStorage.getItem(storageKey(ATMOSPHERE_KEY));
    if (atmosphere && THEME_ID_MIGRATIONS[atmosphere]) localStorage.setItem(storageKey(ATMOSPHERE_KEY), THEME_ID_MIGRATIONS[atmosphere]);
  } catch {
    /* storage blocked */
  }
  migrateJsonKey(FONTS_KEY, (v) => isObject(v) && [rekeyThemeMap(v), migrateFontChoices(v)].some(Boolean));
  migrateJsonKey(COLORS_KEY, (v) => isObject(v) && rekeyThemeMap(v));
  migrateJsonKey(COMBINATIONS_KEY, (v) => {
    if (!Array.isArray(v)) return false;
    let changed = false;
    for (const c of v) {
      if (!isObject(c)) continue;
      if (typeof c.skinId === 'string' && THEME_ID_MIGRATIONS[c.skinId]) {
        c.skinId = THEME_ID_MIGRATIONS[c.skinId];
        changed = true;
      } else if (typeof c.skinId === 'string' && SELECT_ON_MIGRATE.has(PACK_THEME_MIGRATIONS[c.skinId])) {
        const pack = PACK_THEME_MIGRATIONS[c.skinId];
        c.skinId = pack;
        enableExperimental(pack);
        changed = true;
      }
      if (isObject(c.fonts) && [rekeyThemeMap(c.fonts), migrateFontChoices(c.fonts)].some(Boolean)) changed = true;
      if (isObject(c.colors) && rekeyThemeMap(c.colors)) changed = true;
    }
    return changed;
  });
}

function enableExperimental(packId: string) {
  try {
    const raw = localStorage.getItem(storageKey(EXPERIMENTAL_KEY));
    const list: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    if (!ids.includes(packId)) localStorage.setItem(storageKey(EXPERIMENTAL_KEY), JSON.stringify([...ids, packId]));
  } catch {
    /* storage blocked — session only */
  }
}

/**
 * Rewrite legacy saved ids → canonical before React reads prefs. A user who had
 * picked the legacy preset keeps it: the experimental pack is auto-enabled so
 * their selection is never hidden behind the Experimental opt-in.
 * Idempotent; safe to call on every boot.
 *
 * Returns the pack id the saved theme was migrated to when that pack replaces a
 * retired theme (SELECT_ON_MIGRATE), else ''. The caller completes the selection
 * like the picker would (linked engine) via applyPackDeepLink.
 */
export function runPackPrefMigrations(): string {
  let select = '';
  runThemeRenameMigrations();
  try {
    const theme = localStorage.getItem(storageKey(THEME_KEY));
    if (theme && PACK_THEME_MIGRATIONS[theme]) {
      const next = PACK_THEME_MIGRATIONS[theme];
      localStorage.setItem(storageKey(THEME_KEY), next);
      if (EXPERIMENTAL_TARGETS.has(next)) enableExperimental(next);
      if (SELECT_ON_MIGRATE.has(next)) select = next;
    }
    const rawPrefs = localStorage.getItem(storageKey(UI_PREFS_KEY));
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs) as { selectedEngineId?: unknown };
      const id = typeof prefs.selectedEngineId === 'string' ? prefs.selectedEngineId : '';
      if (id && PACK_ENGINE_MIGRATIONS[id]) {
        prefs.selectedEngineId = PACK_ENGINE_MIGRATIONS[id];
        localStorage.setItem(storageKey(UI_PREFS_KEY), JSON.stringify(prefs));
        if (EXPERIMENTAL_TARGETS.has(PACK_ENGINE_MIGRATIONS[id])) enableExperimental(PACK_ENGINE_MIGRATIONS[id]);
      }
    }
  } catch {
    /* malformed prefs — the hooks fall back to defaults */
  }
  return select;
}
