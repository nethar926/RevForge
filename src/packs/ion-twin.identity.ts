import type { PackIdentity } from './types';

/**
 * Twin Ion — ONE constant: rename / re-slug / engine swap = edit here.
 * Paired with the existing scifi engine (`ion-twin`, display name "Twin Ion").
 * Not in the base catalogue: visible only where VITE_FORCE_VISIBLE lists it
 * (preview/ion-twin: VITE_FORCE_VISIBLE=ion-twin).
 */
const ION_TWIN: PackIdentity = {
  id: 'ion-twin',
  displayName: 'Twin Ion',
  previewSlug: 'ion-twin',
  tagline: 'Cold Glass CJ grid · targeting scope · linked ion engine',
  engine: { preferred: 'ion-twin', fallback: 'ion-twin', kind: 'scifi' },
  theme: {
    accent: '#9ad8ff',
    secondary: '#ff2a1a',
    description:
      'Experimental pack: Twin Ion Cold Glass instruments on the Carrier Jet shared grid — square map, original targeting scope, SENSOR/LOCK ladder, and the Twin Ion engine.',
    feature: 'CJ grid · Cold Glass scope · linked ion engine',
  },
};

export default ION_TWIN;
