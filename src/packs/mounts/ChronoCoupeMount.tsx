import { useEffect, useState, type CSSProperties } from 'react';
import { ChronoCoupeHud, type RailMode } from '../../skins/chrono-coupe/ChronoCoupeHud';
import ID from '../chrono-coupe.identity';
import type { PackHudProps } from '../types';
import { storageKey } from '../../lib/storageKey';
import { useFitBox } from './useFitBox';
import { usePackShell } from './usePackShell';
import { getPackMode, onPackMode, readPackEnvelope, requestPackShell, sendPackEngineCommand, setPackMode, type PackMode } from '../runtime';
import './pack-fit.css';

/** Rail ↔ runtime pack mode (Audio's setPursuitBoost follows it via audioBridge). */
const toRail = (m: PackMode): RailMode => (m === 'pursuit' ? 'jump' : m === 'auto' ? 'off' : 'cruise');
const toPack = (m: RailMode): PackMode => (m === 'jump' ? 'pursuit' : m === 'off' ? 'auto' : 'norm');

/**
 * Framework adapter: ThemeStage telemetry + pack runtime bus → Chrono Coupe HUD.
 * Fixed-width design box (1280) whose height follows the stage aspect, then
 * uniform scale. Re-renders only on the existing HUD publish.
 */
export function ChronoCoupeMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const shell = usePackShell();
  const [mode, setMode] = useState<RailMode>(() => toRail(getPackMode(ID.id, 'norm')));
  useEffect(
    () =>
      onPackMode((id, next) => {
        if (id === ID.id) setMode(toRail(next));
      }),
    [],
  );
  // Short stages (e.g. ~1024×600 with the throttle card): compact spacing, 44pt floor.
  const compact = fit.h * fit.s < 380;
  return (
    <div
      ref={ref}
      className="rf-pack-fit"
      data-pack={ID.id}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="rf-pack-box">
        <ChronoCoupeHud
          {...props}
          compact={compact}
          storageKey={storageKey(`revforge.pack.${ID.id}`)}
          shellConnected={shell.connected}
          muted={shell.muted}
          mode={mode}
          onModeChange={(m) => setPackMode(ID.id, toPack(m))}
          envelope={props.running ? readPackEnvelope() : 0}
          onToggleSound={() => requestPackShell({ type: 'toggle-mute' })}
          onCharge={(level) => sendPackEngineCommand(ID.id, { type: 'charge', level })}
          onDischarge={() => sendPackEngineCommand(ID.id, { type: 'discharge' })}
        />
      </div>
    </div>
  );
}
