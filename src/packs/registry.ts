import { NightPursuitMount } from './mounts/NightPursuitMount';
import { isExperimentalPackEnabled } from './experimental';
import { NIGHT_PURSUIT_ID, PACK_ENGINE_MIGRATIONS, PACK_THEME_MIGRATIONS } from './migrations';
import type { ThemePack } from './types';
import { BUILTIN_PATCHES, getBuiltin } from '../audio/builtins';
import type { EnginePatch } from '../audio/types';
import { FALLBACK_ENGINE_ID, FORCED_VISIBLE_IDS, isEngineListed, isThemeListed, resolveListedEngineId } from '../themes/visibility';

/**
 * Glob-registered packs: each `src/packs/<id>.pack.ts` default-exports a ThemePack.
 * Adding a pack never edits this list (keeps per-pack commits independent).
 */
const GLOB_PACKS: ThemePack[] = Object.values(
  import.meta.glob<{ default: ThemePack }>('./*.pack.ts', { eager: true }),
)
  .map((m) => m.default)
  .filter((p): p is ThemePack => !!p && typeof p.id === 'string')
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

/**
 * Theme-pack registry. Minimal + additive: only packs listed here get the
 * bound theme+engine behaviour; every other theme/engine is untouched.
 */
export const THEME_PACKS: readonly ThemePack[] = [
  {
    id: NIGHT_PURSUIT_ID,
    displayName: 'Night Pursuit',
    tagline: 'Scanner-era pursuit dash · cross-plane 5.0 V8',
    experimental: true,
    themeId: NIGHT_PURSUIT_ID,
    Hud: NightPursuitMount,
    engineId: NIGHT_PURSUIT_ID,
    engineKind: 'ice',
    migrations: { theme: PACK_THEME_MIGRATIONS, engine: PACK_ENGINE_MIGRATIONS },
    reducedMotion: 'static-glow',
  },
  ...GLOB_PACKS,
];

const BY_ID = new Map(THEME_PACKS.map((p) => [p.id, p]));
const BY_THEME = new Map(THEME_PACKS.map((p) => [p.themeId, p]));
// Only packs that own their engine bind it (shared presets keep their normal behaviour).
const BY_ENGINE = new Map(THEME_PACKS.filter((p) => p.ownsEngine !== false).map((p) => [p.engineId, p]));

export const getPack = (id: string) => BY_ID.get(id);
export const packForThemeId = (themeId: string) => BY_THEME.get(themeId);
export const packForEngineId = (engineId: string) => BY_ENGINE.get(engineId);

export function isPackVisible(pack: ThemePack): boolean {
  return !pack.experimental || isExperimentalPackEnabled(pack.id);
}

/** Theme picker filter: non-pack themes always visible; pack themes follow the opt-in. */
export function isThemeIdVisible(themeId: string): boolean {
  // Catalogue trim (Oct 8 2026): hidden themes stay hidden whatever the Experimental opt-in says.
  if (!isThemeListed(themeId)) return false;
  const pack = packForThemeId(themeId);
  return !pack || isPackVisible(pack);
}

/**
 * Engine list filter (Revs / Engines page / sound pickers) for built-in engines: only the
 * visible engine allowlist (visibility.ts VISIBLE_ENGINE_IDS), no Experimental opt-in.
 * User-built synths are not built-ins and are never filtered.
 */
export function isEngineIdVisible(engineId: string): boolean {
  return isEngineListed(engineId);
}

const isBuiltinEngine = (id: string) => !!getBuiltin(id);

/** VITE_FORCE_VISIBLE ids that matched a built-in engine on this build (empty when unset). */
export const FORCED_ENGINE_IDS: readonly string[] = FORCED_VISIBLE_IDS.filter(isBuiltinEngine);

/** Saved / deep-linked engine id → visible id (hidden built-ins → Night Pursuit's engine). */
export const resolveVisibleEngineId = (id: string): string => resolveListedEngineId(id, isBuiltinEngine);

/**
 * Patch about to be loaded (saved skin+sound combination, deep link) → visible patch.
 * A hidden built-in, or a combination snapshot that is an untouched copy of a hidden built-in
 * (same name + params), becomes Night Pursuit's engine (combination keeps its own id).
 * Anything edited by the user (custom synths, tuned copies) is left alone.
 */
export function resolveVisibleEnginePatch(patch: EnginePatch): EnginePatch {
  const np = getBuiltin(FALLBACK_ENGINE_ID);
  if (!np || isEngineListed(patch.id)) return patch;
  if (getBuiltin(patch.id)) return structuredClone(np);
  const twin = BUILTIN_PATCHES.find((b) => b.name === patch.name && !isEngineListed(b.id));
  if (twin && patch.id.startsWith('user-combination-') && JSON.stringify(twin.params) === JSON.stringify(patch.params)) {
    return { ...structuredClone(np), id: patch.id };
  }
  return patch;
}

export const listExperimentalPacks = () => THEME_PACKS.filter((p) => p.experimental);
