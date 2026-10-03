import type { PackHudProps } from '../../packs/types';
import { defaultMaxRpm, defaultMaxSpeed } from './gaugeMath';
import { SweepGauge } from './SweepGauge';
import { TwinDialCluster } from './TwinDialCluster';

/**
 * Drop-in adapters with the existing PackHudProps contract (what ThemeStage
 * already hands to pack HUDs), so Frontend can mount the gauges from a theme
 * layout or a pack registry entry without new plumbing.
 */
export interface GradientGaugeHudExtras {
  /** Full-scale speed (defaults: 160 mph / 260 km/h). */
  maxSpeed?: number;
  compact?: boolean;
}

export function SweepHud(p: PackHudProps & GradientGaugeHudExtras) {
  const max = p.maxSpeed ?? defaultMaxSpeed(p.unit);
  return (
    <div className="gg-hud gg-hud--sweep">
      <SweepGauge
        value={p.speed}
        max={max}
        redlineFrom={max * 0.84}
        units={p.unit}
        label="Speed"
        compact={p.compact}
        reduceMotion={!p.motion}
      />
    </div>
  );
}

export function TwinDialHud(p: PackHudProps & GradientGaugeHudExtras & { showGearRpm?: boolean }) {
  return (
    <TwinDialCluster
      speed={p.speed}
      maxSpeed={p.maxSpeed ?? defaultMaxSpeed(p.unit)}
      rpm={p.running ? p.rpm : 0}
      redlineRpm={p.redlineRpm}
      maxRpm={defaultMaxRpm(p.redlineRpm)}
      gear={p.gear}
      units={p.unit}
      showGearRpm={p.showGearRpm ?? true}
      compact={p.compact}
      reduceMotion={!p.motion}
    />
  );
}

/** Twin Dial, speed-only variant (no gear chip / RPM pill). */
export function TwinDialSpeedHud(p: PackHudProps & GradientGaugeHudExtras) {
  return <TwinDialHud {...p} showGearRpm={false} />;
}
