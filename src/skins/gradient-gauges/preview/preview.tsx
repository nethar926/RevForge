/**
 * Dev-only harness (not part of the production bundle — vite build only
 * consumes /index.html). Run `npm run dev` and open
 *   /src/skins/gradient-gauges/preview/index.html?g=sweep&v=74
 * Params: g=sweep|twin|twin-gear, v=speed, max, rl=redlineFrom, rpm, redline,
 * maxRpm, gear, units=mph|kph, compact=1, ink=light|dark, rm=1 (force reduce
 * motion), demo=1 (animate a drive cycle), frame=WxH (fixed stage size).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SweepGauge } from '../SweepGauge';
import { TwinDialCluster } from '../TwinDialCluster';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

function useDemo(on: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setT((now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t;
}

export function Preview() {
  const g = q.get('g') ?? 'sweep';
  const demo = q.get('demo') === '1';
  const t = useDemo(demo);
  const phase = demo ? (Math.sin(t * 0.6) + 1) / 2 : 0;
  const speed = demo ? phase * 150 : num('v', 74);
  const rpm = demo ? 900 + ((t * 2200) % 6600) : num('rpm', 6800);
  const units = q.get('units') ?? 'mph';
  const compact = q.get('compact') === '1';
  const rm = q.get('rm') === '1';

  if (g === 'sweep') {
    const max = num('max', 160);
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <SweepGauge
          value={speed}
          max={max}
          redlineFrom={num('rl', max * 0.84)}
          units={units}
          compact={compact}
          ink={q.get('ink') === 'dark' ? 'dark' : 'light'}
          reduceMotion={rm}
        />
      </div>
    );
  }
  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: compact ? 12 : 48, boxSizing: 'border-box' }}>
      <TwinDialCluster
        speed={speed}
        maxSpeed={num('max', 160)}
        rpm={rpm}
        redlineRpm={num('redline', 7000)}
        maxRpm={num('maxRpm', 8000)}
        gear={q.get('gear') ?? 4}
        units={units}
        showGearRpm={g === 'twin-gear'}
        compact={compact}
        reduceMotion={rm}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
