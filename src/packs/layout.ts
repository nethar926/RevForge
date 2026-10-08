import { useEffect, useState } from 'react';

/**
 * Shared pack layout picker (Wilson, Oct 8 2026). Any pack mount can adopt it; only
 * CarrierJetMount uses it so far (data-rf-layout on the mount root).
 *  - 'phone-landscape': coarse pointer AND innerHeight ≤ 500 AND innerWidth / innerHeight ≥ 1.6
 *    (native 16:9 phone landscape; Visual Skins styles it under [data-rf-layout="phone-landscape"]).
 *  - 'portrait': coarse pointer AND innerWidth ≤ 500 AND innerHeight > innerWidth.
 *  - otherwise 'window' in drive-window mode, else 'board'. These two only label today's
 *    behaviour (Tesla / desktop render exactly as before).
 */
export type RfLayout = 'board' | 'window' | 'portrait' | 'phone-landscape';

export const PHONE_LANDSCAPE_MAX_H = 500;
export const PHONE_LANDSCAPE_MIN_ASPECT = 1.6;
export const PORTRAIT_MAX_W = 500;

export interface RfLayoutInput {
  /** window.innerWidth / innerHeight (CSS px). */
  w: number;
  h: number;
  /** matchMedia('(pointer: coarse)').matches */
  coarse: boolean;
  /** The mount is in drive-window mode (ThemeStage / useDriveWindow). */
  driveWindow: boolean;
}

export function pickRfLayout({ w, h, coarse, driveWindow }: RfLayoutInput): RfLayout {
  if (coarse && w > 0 && h > 0) {
    if (h <= PHONE_LANDSCAPE_MAX_H && w / h >= PHONE_LANDSCAPE_MIN_ASPECT) return 'phone-landscape';
    if (w <= PORTRAIT_MAX_W && h > w) return 'portrait';
  }
  return driveWindow ? 'window' : 'board';
}

const COARSE = '(pointer: coarse)';
function read(driveWindow: boolean): RfLayout {
  if (typeof window === 'undefined') return driveWindow ? 'window' : 'board';
  let coarse = false;
  try {
    coarse = window.matchMedia(COARSE).matches;
  } catch {
    /* no matchMedia */
  }
  return pickRfLayout({ w: window.innerWidth, h: window.innerHeight, coarse, driveWindow });
}

/** Live layout for a pack mount; re-reads on resize, orientationchange and pointer-type changes. */
export function useRfLayout(driveWindow: boolean): RfLayout {
  const [layout, setLayout] = useState<RfLayout>(() => read(driveWindow));
  useEffect(() => {
    const update = () => setLayout(read(driveWindow));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(COARSE);
      mq.addEventListener('change', update);
    } catch {
      mq = null;
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      mq?.removeEventListener('change', update);
    };
  }, [driveWindow]);
  return layout;
}
