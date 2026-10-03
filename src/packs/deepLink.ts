import { THEME_PACKS } from './registry';
import { storageKey } from '../lib/storageKey';

const THEME_KEY = 'drivesynth.theme.v2';
const UI_PREFS_KEY = 'drivesynth.ui.v1';
const EXPERIMENTAL_KEY = 'revforge.packs.experimental';
const PREVIEW_SESSION_KEY = 'revforge.preview.pack.applied';

function readPackParam(): string {
  try {
    const q = new URLSearchParams(window.location.search).get('pack');
    if (q) return q;
    const h = window.location.hash;
    const i = h.indexOf('?');
    return i >= 0 ? new URLSearchParams(h.slice(i + 1)).get('pack') ?? '' : '';
  } catch {
    return '';
  }
}

function stripPackParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('pack');
    const i = url.hash.indexOf('?');
    if (i >= 0) {
      const hq = new URLSearchParams(url.hash.slice(i + 1));
      hq.delete('pack');
      const rest = hq.toString();
      url.hash = url.hash.slice(0, i) + (rest ? `?${rest}` : '');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* non-DOM */
  }
}

/**
 * Open straight into a pack (theme + engine + opt-in) before React reads prefs.
 *  - `?pack=<id|previewSlug>` (or `#/drive?pack=…`): applied, then stripped from the URL.
 *  - Build-time `VITE_PREVIEW_PACK=<id|slug>` (gh-pages preview builds): applied once per
 *    browser session so a preview path always opens in its pack. Unset in production.
 * Unknown ids are ignored. Safe to call on every boot.
 */
export function applyPackDeepLink(): void {
  const fromUrl = readPackParam();
  let want = fromUrl;
  if (!want) {
    const env = String(import.meta.env.VITE_PREVIEW_PACK ?? '');
    try {
      if (env && sessionStorage.getItem(storageKey(PREVIEW_SESSION_KEY)) !== env) {
        want = env;
        sessionStorage.setItem(storageKey(PREVIEW_SESSION_KEY), env);
      }
    } catch {
      want = env;
    }
  }
  if (!want) return;
  const pack = THEME_PACKS.find((p) => p.id === want || p.previewSlug === want);
  if (fromUrl) stripPackParam();
  if (!pack) return;
  try {
    const raw = localStorage.getItem(storageKey(EXPERIMENTAL_KEY));
    const list: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    if (pack.experimental && !ids.includes(pack.id)) localStorage.setItem(storageKey(EXPERIMENTAL_KEY), JSON.stringify([...ids, pack.id]));
    localStorage.setItem(storageKey(THEME_KEY), pack.themeId);
    const prefsRaw = localStorage.getItem(storageKey(UI_PREFS_KEY));
    const prefs = (prefsRaw ? JSON.parse(prefsRaw) : {}) as Record<string, unknown>;
    localStorage.setItem(storageKey(UI_PREFS_KEY), JSON.stringify({ ...prefs, selectedEngineId: pack.engineId }));
  } catch {
    /* storage blocked — normal boot */
  }
}
