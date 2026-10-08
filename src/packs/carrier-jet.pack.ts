import { getBuiltin } from '../audio/builtins';
import { CarrierJetThumb } from '../skins/carrier-jet';
import ID from './carrier-jet.identity';
import { CarrierJetMount } from './mounts/CarrierJetMount';
import type { ThemePack } from './types';
import { isThemeListed } from '../themes/visibility';

/**
 * The jet engine is already registered (aerospace-f14). The pack only binds it where the pack
 * is visible (VITE_FORCE_VISIBLE): on root and other previews picking that engine never
 * switches theme, exactly as before this pack existed.
 */
const ownsEngine = !!getBuiltin(ID.engine.preferred) && isThemeListed(ID.id);

const pack: ThemePack = {
  id: ID.id,
  displayName: ID.displayName,
  tagline: ID.tagline,
  experimental: true,
  themeId: ID.id,
  Hud: CarrierJetMount,
  engineId: ownsEngine ? ID.engine.preferred : ID.engine.fallback,
  engineKind: ID.engine.kind,
  ownsEngine,
  migrations: {},
  reducedMotion: 'freeze',
  Thumb: CarrierJetThumb,
  previewSlug: ID.previewSlug,
};

export default pack;
