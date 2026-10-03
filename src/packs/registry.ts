import { NightPursuitMount } from './mounts/NightPursuitMount';
import { isExperimentalPackEnabled } from './experimental';
import { NIGHT_PURSUIT_ID, PACK_ENGINE_MIGRATIONS, PACK_THEME_MIGRATIONS } from './migrations';
import type { ThemePack } from './types';

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
  const pack = packForThemeId(themeId);
  return !pack || isPackVisible(pack);
}

/** Engine list filter (Garage / Engines page): pack engines follow the opt-in. */
export function isEngineIdVisible(engineId: string): boolean {
  const pack = packForEngineId(engineId);
  return !pack || isPackVisible(pack);
}

export const listExperimentalPacks = () => THEME_PACKS.filter((p) => p.experimental);
