import { useSyncExternalStore, type CSSProperties } from 'react';
import { CarrierJetHud } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { readPackAbZone, subscribePackAbZone } from '../runtime';
import type { PackHudProps } from '../types';
import { useFitBox } from './useFitBox';
import './pack-fit.css';
import './carrier-jet-mount.css';

/**
 * Framework adapter: ThemeStage telemetry → Visual Skins' Carrier Jet HUD.
 * useFitBox picks the same on-screen box as the Chrono Coupe / Stellar Helm mounts (and advertises
 * data-fit-box for the drive-window placement), but the HUD gets a plain fill div at that size —
 * no transform scale: the skin sizes itself from its container (container units, px floors).
 * The skin owns the look: it renders the CARRIER JET / TOMCAT / SWING WING tabs (not in the drive
 * window / compact layout) and persists the choice itself under
 * storageKey('revforge.pack.carrier-jet.variant'), so no variant / onVariantChange is passed.
 * abZone: Audio's getAfterburnerZone / onAfterburnerZoneChange when the live engine has them
 * (feature-detected in audioBridge, read via useSyncExternalStore); otherwise undefined and the skin
 * derives the zone from load, then throttle.
 */
export function CarrierJetMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const abZone = useSyncExternalStore(subscribePackAbZone, readPackAbZone, () => undefined);
  const driveWindow = !!props.driveWindow;
  // Drive window (or an explicit host request) forces the essential layout; otherwise the skin decides.
  const compact: boolean | 'auto' = driveWindow || props.compact === true ? true : 'auto';
  return (
    <div
      ref={ref}
      className="rf-pack-fit cjm"
      data-pack={ID.id}
      data-drive-window={driveWindow ? 'true' : undefined}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="cjm-fill">
        <CarrierJetHud {...props} compact={compact} driveWindow={driveWindow} abZone={abZone} />
      </div>
    </div>
  );
}
