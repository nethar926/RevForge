/**
 * Every localStorage / sessionStorage key goes through `storageKey()`.
 *
 * All gh-pages builds share one origin (root + `/preview/<slug>/`), so a
 * preview's saved theme/engine/pack prefs would otherwise leak into the main
 * site and into the other previews. Preview builds namespace their keys as
 * `rf.preview.<slug>.<key>`, where slug = `VITE_PREVIEW_SLUG` (any preview,
 * e.g. gauges / hig / gradient; does NOT turn a pack on) || `VITE_PREVIEW_PACK`
 * (pack previews; also opens the pack). Root/main builds (neither set) return
 * the key unchanged so existing saved settings keep working.
 */
function previewSlug(): string {
  try {
    return String(import.meta.env.VITE_PREVIEW_SLUG || import.meta.env.VITE_PREVIEW_PACK || '').trim();
  } catch {
    // Non-Vite runtimes (node tests) have no import.meta.env.
    return '';
  }
}

const SLUG = previewSlug();

/** True on preview builds (VITE_PREVIEW_SLUG or VITE_PREVIEW_PACK set). */
export const IS_PREVIEW_BUILD = SLUG !== '';

/** True on pack preview builds only (VITE_PREVIEW_PACK set: the pack opens by default). */
export const IS_PACK_PREVIEW_BUILD = (() => {
  try {
    return String(import.meta.env.VITE_PREVIEW_PACK ?? '').trim() !== '';
  } catch {
    return false;
  }
})();

/** Namespaced storage key: `rf.preview.<slug>.<k>` on preview builds, `k` on root. */
export function storageKey(k: string): string {
  return SLUG ? `rf.preview.${SLUG}.${k}` : k;
}
