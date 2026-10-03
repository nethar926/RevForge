import { getBuiltin } from '../audio/builtins';
import { StellarHelmThumb } from '../skins/stellar-helm/StellarHelmThumb';
import ID from './stellar-helm.identity';
import { StellarHelmMount } from './mounts/StellarHelmMount';
import type { ThemePack } from './types';

/** Dedicated engine once Audio registers it, otherwise the shared fallback preset. */
const ownsEngine = !!getBuiltin(ID.engine.preferred);

const pack: ThemePack = {
  id: ID.id,
  displayName: ID.displayName,
  tagline: ID.tagline,
  experimental: true,
  themeId: ID.id,
  Hud: StellarHelmMount,
  engineId: ownsEngine ? ID.engine.preferred : ID.engine.fallback,
  engineKind: ID.engine.kind,
  ownsEngine,
  migrations: {},
  reducedMotion: 'freeze',
  Thumb: StellarHelmThumb,
  previewSlug: ID.previewSlug,
};

export default pack;
