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

/**
 * Build-time override for a single preview (Oct 8 2026): `VITE_FORCE_VISIBLE` = comma-separated
 * ids, matched against both theme ids and engine ids, e.g. `ion-twin` or
 * `carrier-jet,aerospace-f14`. Forced ids join both allowlists below (so they are listed,
 * selectable, deep-linkable and exempt from the hidden → Night Pursuit migration on that build).
 * An id that is neither a theme nor an engine changes nothing: every list filters real items,
 * catalog.resolveThemeId drops non-themes, and only built-in engines are ever migrated.
 * Unset / empty = exactly the base allowlists (root and every other preview).
 */
export const parseForcedIds = (raw: unknown): string[] => [...new Set(String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

function readForcedEnv(): string {
  try {
    return String(import.meta.env.VITE_FORCE_VISIBLE ?? '');
  } catch {
    // Non-Vite runtimes (node tests) have no import.meta.env.
    return '';
  }
}

/** Raw forced ids for this build (catalog / registry derive the ones that actually match). */
export const FORCED_VISIBLE_IDS: readonly string[] = parseForcedIds(readForcedEnv());

const withForced = (base: readonly string[]): readonly string[] => [...base, ...FORCED_VISIBLE_IDS.filter((id) => !base.includes(id))];

/** Saved picks / deep links to a hidden theme land here (and fresh users start here). */
export const FALLBACK_THEME_ID = 'night-pursuit';

/** Base theme allowlist: the only theme ids any picker, selector, deep link or migration may surface. */
export const BASE_VISIBLE_THEME_IDS: readonly string[] = [CHRONO_COUPE.id, FALLBACK_THEME_ID, STELLAR_HELM.id];

/** Effective theme allowlist = base ∪ VITE_FORCE_VISIBLE (identical to base when unset). */
export const VISIBLE_THEME_IDS: readonly string[] = withForced(BASE_VISIBLE_THEME_IDS);

const VISIBLE = new Set(VISIBLE_THEME_IDS);

/**
 * Visible engine allowlist (Wilson, Oct 8 2026; replaces the earlier pack-engine default).
 * Revs, the Engines page, the Experience Builder sound picker, EngineForge's layer source
 * picker, deep links and saved picks only surface these built-in engines, all selectable
 * with no Experimental opt-in: each catalogue pack's dedicated engine (identity
 * engine.preferred). The Chrono Coupe and Stellar Helm engines are listed by id so they show as
 * soon as Audio registers them. Every other built-in engine is hidden, not deleted.
 * User-built synths (drivesynth.patches.v1 / user-* ids) are never hidden or migrated.
 */
export const FALLBACK_ENGINE_ID = 'night-pursuit';
export const BASE_VISIBLE_ENGINE_IDS: readonly string[] = [FALLBACK_ENGINE_ID, CHRONO_COUPE.engine.preferred, STELLAR_HELM.engine.preferred];

/** Effective engine allowlist = base ∪ VITE_FORCE_VISIBLE (identical to base when unset). */
export const VISIBLE_ENGINE_IDS: readonly string[] = withForced(BASE_VISIBLE_ENGINE_IDS);

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
