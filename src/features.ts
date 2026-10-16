/**
 * Build-time feature flags (framework; pure, node-testable). ONE switch: the Carrier Jet preview build
 * (VITE_PREVIEW_PACK=carrier-jet) turns on the CJ v2 board and hides Sound Builder, Pro Builder, Lab and Account
 * (and removes the GARAGE tab / /engines, Meghan's map #2) everywhere (menus, CJ CONFIG, routes / deep links → Drive). The root build (no VITE_PREVIEW_PACK) keeps every
 * flag at its old value, so its behaviour is unchanged. Hiding never deletes code or saved user data.
 */
const previewPack = (): string => {
  try {
    return String(import.meta.env?.VITE_PREVIEW_PACK ?? '').trim();
  } catch {
    return '';
  }
};

export interface Features {
  /** Carrier Jet v2 board: Board 2 reflow, GPS+RADAR plate, MAP/radar, edge keys, CONFIG. */
  cjV2: boolean;
  soundBuilder: boolean;
  proBuilder: boolean;
  lab: boolean;
  account: boolean;
  /** GARAGE tab + /engines (Meghan's map #2: removed; its picker lives at CONFIG › SND › PACK). */
  garage: boolean;
}

export function featuresFor(pack: string): Features {
  const cj = pack === 'carrier-jet';
  return { cjV2: cj, soundBuilder: !cj, proBuilder: !cj, lab: !cj, account: !cj, garage: !cj };
}

export const FEATURES: Readonly<Features> = Object.freeze(featuresFor(previewPack()));

/** Routes owned by a hidden feature (redirect to Drive). */
export function hiddenRoute(pathname: string, f: Features = FEATURES): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (!f.soundBuilder && p.startsWith('/sound-builder')) || (!f.proBuilder && p.startsWith('/builder')) || (!f.garage && p.startsWith('/engines'));
}

/** Drive panels owned by a hidden feature (closed / never opened from URLs or menus). With garage off, the
 * engine list opens only as CONFIG › SND › PACK (see openPack in ForgePage), titled "Pack", without recolor. */
export function hiddenPanel(panel: string | null | undefined, f: Features = FEATURES): boolean {
  return (!f.lab && (panel === 'dashlab' || panel === 'studio')) || (!f.account && panel === 'account') || (!f.garage && panel === 'garage');
}
