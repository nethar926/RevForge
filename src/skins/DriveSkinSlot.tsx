import type { CSSProperties } from 'react';
import { getBuiltin, type EngineId } from '../audio';
import type { GaugeCluster } from '../hooks/useUiPrefs';
import { AerospaceF14Overlay } from './aerospace-f14/AerospaceF14Overlay';
import { IonTwinOverlay } from './ion-twin/IonTwinOverlay';
import { IceV8Overlay } from './ice-v8/IceV8Overlay';
import { EvInverterOverlay } from './ev-inverter/EvInverterOverlay';
import { GradientCluster } from './gradient/GradientCluster';
import type { IonLockStage } from './ion-twin/lockLadder';

/**
 * Mount point for @Visual Skins per-engine Drive plates.
 * Spec: /workspace/drivesynth-skins/SKIN_FRAMEWORK.md
 */
export interface DriveSkinProps {
  engineId: EngineId;
  rpmNorm: number;
  speedNorm: number;
  loadFeel: number;
  throttle: number;
  /** Ion Twin lock ladder stage from DrivePage. */
  lockStage?: IonLockStage;
  /** Pref only; DrivePage owns soft cue hook. */
  lockSfxEnabled?: boolean;
  /** Secondary cluster mode from Customize. */
  gaugeCluster?: GaugeCluster;
}

/**
 * engineId → skin id (Visual Skins registry).
 * Display name is Ion Twin / Twin Ion only — never "Tie Fighter".
 * Canonical pack/topology id is `ion-twin`; `tie-fighter` remaps via getBuiltin.
 */
export function skinIdForEngine(engineId: string): string {
  const builtin = getBuiltin(engineId);
  if (builtin?.revforge) return builtin.kind === 'scifi' ? 'ion-twin' : builtin.kind === 'aerospace' ? 'aerospace-f14' : builtin.kind === 'ev-whine' ? 'ev-inverter' : 'ice-v8';
  switch (engineId) {
    case 'ion-twin':
    case 'tie-fighter': // legacy audio id → Ion Twin immersive HUD
      return 'ion-twin';
    case 'v8-rumble':
    case 'i4-zip':
    case 'i6-silk':
      return 'ice-v8';
    case 'ev-whine':
    case 'ev-inverter-climb':
    case 'ev-regen-howl':
    case 'ev-dual-motor':
      return 'ev-inverter';
    case 'aerospace-f14':
      return 'aerospace-f14';
    default:
      return 'default';
  }
}

/** Per-engine Drive plate — Ion Twin / Aerospace F14 mount full overlays; others use CSS tokens. */
export function DriveSkinSlot({
  engineId,
  rpmNorm,
  speedNorm,
  loadFeel,
  throttle,
  lockStage,
  lockSfxEnabled,
  gaugeCluster = 'classic',
}: DriveSkinProps) {
  const skinId = skinIdForEngine(engineId);
  return (
    <div
      className={`drive-skin drive-skin-${skinId}`}
      data-skin={skinId}
      data-engine={engineId}
      data-gauge-cluster={gaugeCluster}
      aria-hidden
      style={
        {
          ['--skin-rpm' as string]: String(rpmNorm),
          ['--skin-throttle' as string]: String(throttle),
        } as CSSProperties
      }
    >
      <div className="drive-skin-plate" />
      {skinId === 'ion-twin' && (
        <IonTwinOverlay
          rpmNorm={rpmNorm}
          speedNorm={speedNorm}
          throttle={throttle}
          loadFeel={loadFeel}
          lockStage={lockStage}
          lockSfxEnabled={lockSfxEnabled}
        />
      )}
      {skinId === 'aerospace-f14' && (
        <AerospaceF14Overlay
          rpmNorm={rpmNorm}
          speedNorm={speedNorm}
          throttle={throttle}
          loadFeel={loadFeel}
        />
      )}
      {skinId === 'ice-v8' && (
        <IceV8Overlay
          rpmNorm={rpmNorm}
          speedNorm={speedNorm}
          throttle={throttle}
          loadFeel={loadFeel}
        />
      )}
      {skinId === 'ev-inverter' && (
        <EvInverterOverlay
          rpmNorm={rpmNorm}
          speedNorm={speedNorm}
          throttle={throttle}
          loadFeel={loadFeel}
        />
      )}
      {/* Registry stub: no engine maps to 'gradient' today; the live path is the
          'RF Gradient Sweep' theme via ThemeStage. Kept so the skin id resolves. */}
      {skinId === 'gradient' && (
        <GradientCluster
          rpmNorm={rpmNorm}
          speedNorm={speedNorm}
          throttle={throttle}
          load={loadFeel}
        />
      )}
    </div>
  );
}
