import { getBuiltin } from '../audio/builtins';
import ID from './ion-twin.identity';
import { IonTwinMount } from './mounts/IonTwinMount';
import type { ThemePack } from './types';
import { isThemeListed } from '../themes/visibility';

/**
 * The Twin Ion engine is already registered (`ion-twin`). The pack only binds it where the
 * pack is visible (VITE_FORCE_VISIBLE=ion-twin): on root and every other preview the engine
 * and theme stay hidden and picking anything never switches to this theme, exactly as before.
 */
const ownsEngine = !!getBuiltin(ID.engine.preferred) && isThemeListed(ID.id);

const pack: ThemePack = {
  id: ID.id,
  displayName: ID.displayName,
  tagline: ID.tagline,
  experimental: true,
  themeId: ID.id,
  Hud: IonTwinMount,
  engineId: ownsEngine ? ID.engine.preferred : ID.engine.fallback,
  engineKind: ID.engine.kind,
  ownsEngine,
  migrations: {},
  reducedMotion: 'freeze',
  previewSlug: ID.previewSlug,
};

export default pack;
