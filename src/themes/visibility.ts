/**
 * Visible catalogue allowlist (Wilson, Oct 8 2026): every other visual theme / HUD skin
 * is deprecated and hidden, not deleted — its code, files and routes stay compilable so
 * it can come back by adding its id here. Engine sound packs are not affected.
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
