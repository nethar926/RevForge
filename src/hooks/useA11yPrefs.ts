import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import type { UiPrefs } from './useUiPrefs';

/** HIG text-size presets (AUDIT §6.1) plus AX3 so text can reach 200 %. */
export const TEXT_SIZES = ['xS', 'S', 'M', 'L', 'xL', 'xxL', 'xxxL', 'AX1', 'AX2', 'AX3'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SCALE: Record<TextSize, number> = { xS: 0.875, S: 0.9375, M: 1, L: 1, xL: 1.125, xxL: 1.25, xxxL: 1.375, AX1: 1.5, AX2: 1.75, AX3: 2 };
export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  xS: 'Extra small', S: 'Small', M: 'Medium', L: 'Default', xL: 'Large', xxL: 'Extra large', xxxL: 'Extra extra large',
  AX1: 'Accessibility large', AX2: 'Accessibility extra large', AX3: 'Accessibility largest',
};
export const DEFAULT_TEXT_SIZE: TextSize = 'L';
export const isTextSize = (v: unknown): v is TextSize => typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);

export interface A11yState {
  /** Effective values: system setting OR in-app setting. */
  reduceMotion: boolean;
  reduceTransparency: boolean;
  increaseContrast: boolean;
  /** What the device itself reports (Tesla reports none of these). */
  system: { reduceMotion: boolean; reduceTransparency: boolean; increaseContrast: boolean };
  textSize: TextSize;
  boldText: boolean;
  tesla: boolean;
}

const mq = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => !!mq(query)?.matches);
  useEffect(() => {
    const m = mq(query);
    if (!m) return;
    const fn = () => setOn(m.matches);
    fn();
    m.addEventListener?.('change', fn);
    return () => m.removeEventListener?.('change', fn);
  }, [query]);
  return on;
}

export const isTeslaBrowser = () => typeof navigator !== 'undefined' && /\bTesla\b|QtCarBrowser/i.test(navigator.userAgent);

const DEFAULT_STATE: A11yState = {
  reduceMotion: false, reduceTransparency: false, increaseContrast: false,
  system: { reduceMotion: false, reduceTransparency: false, increaseContrast: false },
  textSize: DEFAULT_TEXT_SIZE, boldText: false, tesla: false,
};
export const A11yContext = createContext<A11yState>(DEFAULT_STATE);
/** Read the merged accessibility preferences anywhere below <App>. */
export const useA11y = () => useContext(A11yContext);

/**
 * Merges the system media queries with the in-app settings (persisted with the
 * UI prefs) and mirrors them on <html> as data attributes for CSS and packs.
 */
export function useA11yPrefs(prefs: Pick<UiPrefs, 'textSize' | 'boldText' | 'increaseContrast' | 'reduceTransparency' | 'reduceMotion'>): A11yState {
  const sysMotion = useMedia('(prefers-reduced-motion: reduce)');
  const sysTransparency = useMedia('(prefers-reduced-transparency: reduce)');
  const sysContrast = useMedia('(prefers-contrast: more)');
  const tesla = isTeslaBrowser();
  const state: A11yState = {
    reduceMotion: sysMotion || prefs.reduceMotion,
    reduceTransparency: sysTransparency || prefs.reduceTransparency,
    increaseContrast: sysContrast || prefs.increaseContrast,
    system: { reduceMotion: sysMotion, reduceTransparency: sysTransparency, increaseContrast: sysContrast },
    textSize: prefs.textSize,
    boldText: prefs.boldText,
    tesla,
  };
  useLayoutEffect(() => {
    const d = document.documentElement.dataset;
    d.motion = state.reduceMotion ? 'reduce' : 'full';
    d.transparency = state.reduceTransparency ? 'reduced' : 'full';
    d.contrast = state.increaseContrast ? 'more' : 'standard';
    d.a11yMotion = d.motion;
    d.a11yTransparency = d.transparency;
    d.a11yContrast = d.contrast;
    d.textSize = state.textSize;
    d.boldText = state.boldText ? 'on' : 'off';
    if (tesla) d.device = 'tesla';
  }, [state.reduceMotion, state.reduceTransparency, state.increaseContrast, state.textSize, state.boldText, tesla]);
  return state;
}
