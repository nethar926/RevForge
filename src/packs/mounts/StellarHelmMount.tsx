import { useEffect, useState, type CSSProperties } from 'react';
import { getBuiltin } from '../../audio/builtins';
import { StellarHelmHud, type HelmMode } from '../../skins/stellar-helm/StellarHelmHud';
import ID from '../stellar-helm.identity';
import { useStellarHelmFrame } from '../stellar-helm.frame';
import { getPackMode, onPackMode, readPackEnvelope, requestPackShell, setPackMode, type PackMode } from '../runtime';
import type { PackHudProps } from '../types';
import { useFitBox } from './useFitBox';
import { usePackShell } from './usePackShell';
import './pack-fit.css';

// Runtime modes drive the audio boost: BOOST → pursuit (1), SPORT → power (0.5), CRUISE → norm (0).
const toHelm = (m: PackMode): HelmMode => (m === 'pursuit' ? 'boost' : m === 'power' ? 'sport' : 'cruise');
const toPack = (m: HelmMode): PackMode => (m === 'boost' ? 'pursuit' : m === 'sport' ? 'power' : 'norm');

const fallbackEngineName = () => getBuiltin(ID.engine.preferred)?.name ?? getBuiltin(ID.engine.fallback)?.name ?? '';

/**
 * Framework adapter: ThemeStage telemetry + Drive-shell bridge → Stellar Helm HUD.
 * SHUTDOWN / MUTE / section tabs reach existing Drive actions via requestPackShell.
 */
export function StellarHelmMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const shell = usePackShell();
  // Frame look (classic default / helm): persisted user choice, switched from the HUD bar.
  const [frame, setFrame] = useStellarHelmFrame();
  const [mode, setMode] = useState<HelmMode>(() => toHelm(getPackMode(ID.id, 'norm')));
  useEffect(
    () =>
      onPackMode((id, next) => {
        if (id === ID.id) setMode(toHelm(next));
      }),
    [],
  );
  return (
    <div
      ref={ref}
      className="rf-pack-fit"
      data-pack={ID.id}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="rf-pack-box">
        <StellarHelmHud
          {...props}
          compact="auto"
          title={ID.displayName}
          frame={frame}
          onFrameChange={setFrame}
          engineName={shell.engineName || fallbackEngineName()}
          shellConnected={shell.connected}
          muted={shell.muted}
          envelope={props.running ? readPackEnvelope() : 0}
          onShell={(action) => requestPackShell(action)}
          mode={mode}
          onModeChange={(m) => setPackMode(ID.id, toPack(m))}
        />
      </div>
    </div>
  );
}
