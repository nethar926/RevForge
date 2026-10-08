import type { PackIdentity } from './types';

/**
 * Carrier Jet — ONE constant: rename / re-slug / engine swap = edit here.
 * Paired with the existing jet engine (`aerospace-f14`, display name "Carrier Jet").
 * Not in the base catalogue: visible only where VITE_FORCE_VISIBLE lists it
 * (preview/carrier-jet: VITE_FORCE_VISIBLE=carrier-jet,aerospace-f14).
 */
const CARRIER_JET: PackIdentity = {
  id: 'carrier-jet',
  displayName: 'Carrier Jet',
  previewSlug: 'carrier-jet',
  tagline: 'Swing-wing jet HUD · three looks · linked jet engine',
  engine: { preferred: 'aerospace-f14', fallback: 'aerospace-f14', kind: 'aerospace' },
  theme: {
    accent: '#ffc35a',
    secondary: '#4592e0',
    description:
      'Experimental pack: a swing-wing jet HUD in three looks (Carrier jet, Tomcat, Swing wing) — speed, gear and RPM with a live wing-sweep schedule and afterburner zones, paired with the Carrier Jet engine.',
    feature: 'Wing sweep · linked jet',
  },
};

export default CARRIER_JET;
