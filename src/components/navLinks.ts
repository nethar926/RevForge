import { FEATURES, type Features } from '../features.ts';

/** RevForge IA — labels differ from path segments where product renamed surfaces. */
export const ALL_NAV_LINKS = [
  { to: '/drive', label: 'Drive' },
  { to: '/engines', label: 'Garage' },
  { to: '/customize', label: 'Interface Options' },
  { to: '/builder', label: 'Pro Builder' },
  { to: '/sound-builder', label: 'Sound Builder' },
  { to: '/diag', label: 'Diagnostics' },
] as const;

/** ☰ entries. Hidden features (src/features.ts; CJ preview only) get no entry at all: no node, no VoiceOver item. */
export const navLinks = (f: Features = FEATURES) =>
  ALL_NAV_LINKS.filter((l) => (l.to !== '/builder' || f.proBuilder) && (l.to !== '/sound-builder' || f.soundBuilder) && (l.to !== '/engines' || f.garage));
