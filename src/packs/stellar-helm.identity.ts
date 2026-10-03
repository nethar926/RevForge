import type { PackIdentity } from './types';

/**
 * Stellar Helm — ONE constant: rename / re-slug / engine swap = edit here.
 * engine.preferred is Audio Synth's dedicated drive-hum engine id; until it is
 * registered the pack uses the shared fallback preset (a non-Ion EV).
 */
const STELLAR_HELM: PackIdentity = {
  id: 'stellar-helm',
  displayName: 'Stellar Helm',
  previewSlug: 'stellar-helm',
  tagline: 'Helm console · classic or graphite frame · counter-rotating gear rings · linked EV',
  engine: { preferred: 'stellar-helm', fallback: 'ev-inverter-climb', kind: 'ev-whine' },
  theme: {
    accent: '#5ce1ff',
    secondary: '#b49cff',
    description:
      'Experimental pack: a helm console in two frames (classic rounded-elbow colour blocks by default, or graphite glass) — big RPM over MPH with a throttle bar, numbered data rows, a segmented power bar with a marked redline and counter-rotating rings around the gear.',
    feature: 'Counter-rotating rings · linked EV',
  },
};

export default STELLAR_HELM;

/**
 * Frame style for Stellar Helm. Both looks ship; the user picks one with the
 * "Frame: Classic / Helm" control in the HUD's bottom bar (persisted per pack).
 *  'classic' rounded elbow frame + colour-block bars (Wilson's original board look) — DEFAULT
 *  'helm'    graphite glass console with hairline chamfered frames
 * Content (rings, RPM/MPH block, data rows, tabs, power bar, buttons) is identical in both.
 * STELLAR_HELM_FRAME = fresh-profile default; the saved choice lives in localStorage
 * under STELLAR_HELM_FRAME_KEY (read/write helpers: ./stellar-helm.frame.ts).
 */
export type StellarHelmFrame = 'classic' | 'helm';
export const STELLAR_HELM_FRAME: StellarHelmFrame = 'classic';
export const STELLAR_HELM_FRAMES: readonly StellarHelmFrame[] = ['classic', 'helm'];
export const STELLAR_HELM_FRAME_KEY = `revforge.pack.${STELLAR_HELM.id}.frame`;
