import { useSyncExternalStore, type CSSProperties } from 'react';
import { CarrierJetHud } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { readPackAbZone, subscribePackAbZone } from '../runtime';
import type { PackHudProps } from '../types';
import { useFitBox } from './useFitBox';
import { useRfLayout } from '../layout';
import './pack-fit.css';
import './carrier-jet-mount.css';

/**
 * Framework adapter: ThemeStage telemetry → Visual Skins' Carrier Jet HUD.
 * useFitBox picks the same on-screen box as the Chrono Coupe / Stellar Helm mounts (and advertises
 * data-fit-box for the drive-window placement), but the HUD gets a plain fill div at that size —
 * no transform scale: the skin sizes itself from its container (container units, px floors).
 * The skin owns the look: it renders the CARRIER JET / TOMCAT / SWING WING tabs and persists the
 * choice itself under storageKey('revforge.pack.carrier-jet.variant'), so no variant /
 * onVariantChange is passed.
 * Drive window (Wilson): the FULL signed-off board, laid out to fit — never the skin's essential
 * (compact) layout, which drops the look tabs, the right card, the engine strips and the AB ladder.
 * So in drive-window mode the mount asks for compact={false} and does not flag the HUD as
 * drive-window (the skin maps driveWindow → essential layout); its own drive-window state is
 * data-box="drive" (carrier-jet-mount.css), not data-drive-window, which the skin also reads.
 * data-rf-layout (packs/layout.ts): 'board' / 'window' label today's desktop / drive-window behaviour;
 * 'portrait' (coarse, ≤500 wide, tall) renders the same full drive-window board; 'phone-landscape'
 * (coarse, ≤500 tall, ≥1.6:1) the full board unscaled, for Visual Skins' native 16:9 CSS. Both phone
 * layouts pad by env(safe-area-inset-*) (carrier-jet-mount.css).
 * abZone: Audio's getAfterburnerZone / onAfterburnerZoneChange when the live engine has them
 * (feature-detected in audioBridge, read via useSyncExternalStore); otherwise undefined and the skin
 * derives the zone from load, then throttle.
 */
export function CarrierJetMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const abZone = useSyncExternalStore(subscribePackAbZone, readPackAbZone, () => undefined);
  const driveWindow = !!props.driveWindow;
  const layout = useRfLayout(driveWindow);
  const fullBoard = driveWindow || layout === 'portrait' || layout === 'phone-landscape';
  // Drive window: always the full board (explicit false, so neither the host's compact request nor
  // the skin's 'auto' size threshold swaps in the essential layout). Elsewhere an explicit host
  // request forces compact, otherwise the skin decides from its own size (full at 1280×800).
  const compact: boolean | 'auto' = fullBoard ? false : props.compact === true ? true : 'auto';
  return (
    <div
      ref={ref}
      className="rf-pack-fit cjm"
      data-pack={ID.id}
      data-box={driveWindow ? 'drive' : undefined}
      data-rf-layout={layout}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="cjm-fill">
        <CarrierJetHud {...props} compact={compact} driveWindow={false} abZone={abZone} />
      </div>
    </div>
  );
}
