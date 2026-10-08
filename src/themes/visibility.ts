/**
 * Visible catalogue allowlist (Wilson, Oct 8 2026): every other visual theme / HUD skin
 * is deprecated and hidden, not deleted — its code, files and routes stay compilable so
 * it can come back by adding its id here. Engines have their own allowlist below.
 *
 * Pure data (no component imports) so packs/migrations.ts, the theme catalog and the
 * node tests can all depend on it without import cycles.
 */
import CHRONO_COUPE from '../packs/chrono-coupe.identity';
import STELLAR_HELM from '../packs/stellar-helm.identity';

/** Saved picks / deep links to a hidden theme land here (and fresh users start here). */
export const FALLBACK_THEME_ID = 'night-pursuit';

/** The only theme ids any picker, selector, deep link or migration may surface. */
export const VISIBLE_THEME_IDS: readonly string[] = [CHRONO_COUPE.id, FALLBACK_THEME_ID, STELLAR_HELM.id];

const VISIBLE = new Set(VISIBLE_THEME_IDS);

/**
 * Visible engine allowlist (Wilson, Oct 8 2026; replaces the earlier pack-engine default).
 * Revs, the Engines page, the Experience Builder sound picker, EngineForge's layer source
 * picker, deep links and saved picks only surface these built-in engines, all selectable
 * with no Experimental opt-in: each catalogue pack's dedicated engine (identity
 * engine.preferred). 'chrono-coupe' and 'stellar-helm' are listed by id so they show as
 * soon as Audio registers them. Every other built-in engine is hidden, not deleted.
 * User-built synths (drivesynth.patches.v1 / user-* ids) are never hidden or migrated.
 */
export const FALLBACK_ENGINE_ID = 'night-pursuit';
export const VISIBLE_ENGINE_IDS: readonly string[] = [FALLBACK_ENGINE_ID, CHRONO_COUPE.engine.preferred, STELLAR_HELM.engine.preferred];

const VISIBLE_ENGINES = new Set(VISIBLE_ENGINE_IDS);

/** True when the built-in engine id is in the visible allowlist. */
export const isEngineListed = (id: string | null | undefined): boolean => !!id && VISIBLE_ENGINES.has(id);

/**
 * Saved / deep-linked engine id → visible id. `isBuiltin` says whether the id is a built-in
 * engine; only hidden built-ins move (to Night Pursuit's engine). Listed ids, user synths and
 * ids the audio registry does not know (e.g. a pack engine not merged yet) pass through.
 */
export function resolveListedEngineId(id: string, isBuiltin: (id: string) => boolean): string {
  return id && isBuiltin(id) && !isEngineListed(id) ? FALLBACK_ENGINE_ID : id;
}

/** True when the theme id is in the visible catalogue. */
export const isThemeListed = (id: string | null | undefined): boolean => !!id && VISIBLE.has(id);

/**
 * Saved / deep-linked theme id → visible id. Retired ids are canonicalised first
 * (`retired`, e.g. saffron-* → stellar-helm), so existing pack migrations keep winning;
 * anything still hidden or unknown resolves to Night Pursuit. Visible ids pass through.
 */
export function resolveListedThemeId(id: string | null | undefined, retired: Readonly<Record<string, string>> = {}): string {
  if (!id) return FALLBACK_THEME_ID;
  const canonical = retired[id] ?? id;
  return isThemeListed(canonical) ? canonical : FALLBACK_THEME_ID;
}
