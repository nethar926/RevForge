import type { PackIdentity } from './types';

/**
 * Chrono Coupe — ONE constant: rename / re-slug / engine swap = edit here.
 * engine.preferred is Audio Synth's dedicated engine id; until it is registered
 * the pack uses the shared fallback preset (an ICE V8).
 */
const CHRONO_COUPE: PackIdentity = {
  id: 'chrono-coupe',
  displayName: 'Chrono Coupe',
  previewSlug: 'chrono-coupe',
  tagline: '7-segment date banks · charge core · linked V8',
  engine: { preferred: 'chrono-coupe', fallback: 'v8-rumble', kind: 'ice' },
  theme: {
    accent: '#ff3b2f',
    secondary: '#ffb21e',
    description:
      'Experimental pack: three 7-segment date banks (destination, present, last departed), big red velocity with a jump threshold, a charge core, a brass output meter and a segmented engine bar.',
    feature: 'Date banks · linked V8',
  },
};

export default CHRONO_COUPE;
