/**
 * Every localStorage / sessionStorage key goes through `storageKey()`.
 *
 * All gh-pages builds share one origin (root + `/preview/<slug>/`), so a pack
 * preview's saved theme/engine/pack prefs would otherwise leak into the main
 * site and into the other previews. Preview builds (`VITE_PREVIEW_PACK=<slug>`)
 * namespace their keys as `rf.preview.<slug>.<key>`; root/main builds (env
 * unset) return the key unchanged so existing saved settings keep working.
 */
function previewSlug(): string {
  try {
    return String(import.meta.env.VITE_PREVIEW_PACK ?? '').trim();
  } catch {
    // Non-Vite runtimes (node tests) have no import.meta.env.
    return '';
  }
}

const SLUG = previewSlug();

/** True on `VITE_PREVIEW_PACK` preview builds only. */
export const IS_PREVIEW_BUILD = SLUG !== '';

/** Namespaced storage key: `rf.preview.<slug>.<k>` on preview builds, `k` on root. */
export function storageKey(k: string): string {
  return SLUG ? `rf.preview.${SLUG}.${k}` : k;
}
