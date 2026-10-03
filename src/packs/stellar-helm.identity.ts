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
  tagline: 'Glass helm console · counter-rotating gear rings · linked EV',
  engine: { preferred: 'stellar-helm', fallback: 'ev-inverter-climb', kind: 'ev-whine' },
  theme: {
    accent: '#5ce1ff',
    secondary: '#b49cff',
    description:
      'Experimental pack: a dark glass helm console — big RPM over MPH with a throttle bar, numbered data rows, a segmented power bar with a marked redline and counter-rotating rings around the gear.',
    feature: 'Counter-rotating rings · linked EV',
  },
};

export default STELLAR_HELM;

/**
 * Frame style for Stellar Helm — one-line switch.
 *  'helm'    graphite glass console with hairline chamfered frames (default)
 *  'classic' rounded elbow frame + colour-block bars (Wilson's original board look)
 * Content (rings, RPM/MPH block, data rows, tabs, power bar) is identical in both.
 * Preview override for side-by-side review: localStorage `revforge.pack.stellar-helm.frame`.
 */
export type StellarHelmFrame = 'helm' | 'classic';
export const STELLAR_HELM_FRAME: StellarHelmFrame = 'helm';
