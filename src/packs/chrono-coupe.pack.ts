import { getBuiltin } from '../audio/builtins';
import { ChronoCoupeThumb } from '../skins/chrono-coupe/ChronoCoupeThumb';
import ID from './chrono-coupe.identity';
import { ChronoCoupeMount } from './mounts/ChronoCoupeMount';
import type { ThemePack } from './types';

/** Dedicated engine once Audio registers it, otherwise the shared fallback preset. */
const ownsEngine = !!getBuiltin(ID.engine.preferred);

const pack: ThemePack = {
  id: ID.id,
  displayName: ID.displayName,
  tagline: ID.tagline,
  experimental: true,
  themeId: ID.id,
  Hud: ChronoCoupeMount,
  engineId: ownsEngine ? ID.engine.preferred : ID.engine.fallback,
  engineKind: ID.engine.kind,
  ownsEngine,
  migrations: {},
  reducedMotion: 'freeze',
  Thumb: ChronoCoupeThumb,
  previewSlug: ID.previewSlug,
};

export default pack;
