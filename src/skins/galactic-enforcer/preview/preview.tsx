/**
 * Dev-only harness (not in the production bundle). `npm run dev`, then open
 *   /src/skins/galactic-enforcer/preview/index.html?mph=74&rpm=5200&gear=4
 * Params: mph, rpm, redline, gear, load (0..1), accel, lock=none|identified|lock|kill,
 * unit=mph|kph, still=1 (app motion off), old=1 (render the current
 * src/themes/GalacticEnforcer for comparison), demo=1 (animate).
 * Mounted inside the same wrappers/CSS ThemeStage uses so the cascade matches.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import '../../../themes/themes.css';
import '../../../themes/special-dashes.css';
import { GalacticEnforcer } from '../../../themes/GalacticEnforcer';
import { GalacticEnforcerHud } from '../GalacticEnforcerHud';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

export function Preview() {
  const anim = q.get('demo') === '1';
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const t0 = performance.now();
    const f = (now: number) => {
      setT((now - t0) / 1000);
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [anim]);
  const unit = q.get('unit') === 'kph' ? 'kph' : 'mph';
  const mph = anim ? 40 + 35 * (1 + Math.sin(t * 0.5)) : num('mph', 74);
  const state = {
    speedMps: unit === 'mph' ? mph / 2.236936 : mph / 3.6,
    rpm: anim ? 1500 + ((t * 1500) % 5500) : num('rpm', 5200),
    gear: num('gear', 4),
    load: num('load', 0.62),
    accel: anim ? Math.cos(t * 0.5) : num('accel', 0.6),
    distance: 0,
    shiftTime: 0,
    shifting: false,
    overrun: false,
  };
  const redline = num('redline', 7000);
  const lock = q.get('lock') ?? undefined;
  const still = q.get('still') === '1';
  const props = { state, redline, unit, demo: true, running: true, lockStage: lock } as const;
  return (
    <div className={`theme-stage layout-space theme-galactic-enforcer galactic-type ${still ? 'motion-off' : ''}`} style={{ ['--skin-accent' as string]: '#76cce9', ['--skin-secondary' as string]: '#ff465d', ['--skin-panel' as string]: '#081016', ['--skin-text' as string]: '#e9eef2', ['--skin-muted' as string]: '#a0acb9', padding: 16 }}>
      <div className="skin-body">
        {q.get('old') === '1' ? <GalacticEnforcer {...props} /> : <GalacticEnforcerHud {...props} motion={!still} />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
