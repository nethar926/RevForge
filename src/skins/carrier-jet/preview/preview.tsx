/**
 * Dev-only harness (not in the production bundle). `npm run dev`, then open
 *   /src/skins/carrier-jet/preview/index.html?cjDemo=cruise&cjVariant=swing-wing
 * Params:
 *   cjDemo=parked|cruise|high|sweep   presets (parked 0 mph, cruise 45 mph, high 90 mph + AB 4);
 *                                     sweep alternates 20 ↔ 90 mph every 8 s (frame-time runs)
 *   cjVariant=carrier-jet|tomcat|swing-wing      controlled look (omit it to test the skin's own persistence)
 *   cjDw=1|0                          force drive window on/off (default: the app's rule, aspect < 1.45 or h ≤ 640)
 *   cjStill=1                         motion prop off (wings snap)
 *   cjDock=0                          hide the mock dock/throttle (shown by default, not part of the skin)
 *   mph, rpm, gear, load, throttle, ab, unit=kph, heading, accel   overrides
 * Mounted inside a `.theme-stage` that mirrors ThemeStage's data-drive-window attribute.
 * window.__cjSet({...props}) re-renders synchronously (flushSync), used by the abZone sync check.
 */
import { StrictMode, useEffect, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { isDriveWindow } from '../../../themes/useDriveWindow';
import { CarrierJetHud, type CarrierJetHudProps } from '../CarrierJetHud';
import { CARRIER_JET_DEMO_STATES, isCarrierJetVariant, type CarrierJetDemoState, type CarrierJetVariant } from '../model';

const q = new URLSearchParams(location.search);
const num = (k: string): number | undefined => (q.has(k) ? Number(q.get(k)) : undefined);
const demoKey = (q.get('cjDemo') ?? 'cruise') as CarrierJetDemoState | 'sweep';
const qVariant = q.get('cjVariant');

declare global {
  interface Window {
    __cjSet?: (p: Partial<CarrierJetHudProps>) => void;
  }
}

function useViewport() {
  const [vp, setVp] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return vp;
}

function Dock({ dw, h }: { dw: boolean; h: number }) {
  const btn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 56, height: 56, padding: '0 14px', borderRadius: 999, border: '1.5px solid #6b737a', background: '#1b1f23', color: '#f1f3f5', font: '600 15px system-ui, sans-serif' };
  return (
    <footer data-mock-dock="" aria-label="App dock (mock, not part of the skin)" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#101214', borderTop: '1px solid #3a3f44', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '6px 10px', boxSizing: 'border-box' }}>
      {dw && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, color: '#c4cbd1', font: '600 12px system-ui', letterSpacing: '.1em' }}>
          THROTTLE<span style={{ flex: 1, height: 10, borderRadius: 5, background: '#2a2f34', border: '1px solid #6b737a' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {(dw ? ['−', 'N', '+', 'HOLD TO REV', 'SHUTDOWN'] : ['AUTO', 'MANUAL', '−', 'N', '+', 'HOLD TO REV', 'SHUTDOWN']).map((b) => (
          <span key={b} style={btn}>{b}</span>
        ))}
      </div>
    </footer>
  );
}

function Preview() {
  const vp = useViewport();
  const dwForced = q.get('cjDw');
  const dw = dwForced === '1' ? true : dwForced === '0' ? false : isDriveWindow(vp.w, vp.h);
  const dockH = q.get('cjDock') === '0' ? 0 : dw ? 120 : 88;
  const [variant, setVariant] = useState<CarrierJetVariant>(isCarrierJetVariant(qVariant) ? qVariant : 'swing-wing');
  const [extra, setExtra] = useState<Partial<CarrierJetHudProps>>({});
  const [t, setT] = useState(0);
  useEffect(() => {
    window.__cjSet = (p) => flushSync(() => setExtra((e) => ({ ...e, ...p })));
    return () => {
      delete window.__cjSet;
    };
  }, []);
  // Telemetry publish cadence like ThemeStage's HUD tick (80 ms).
  useEffect(() => {
    if (demoKey !== 'sweep') return;
    const t0 = performance.now();
    const id = setInterval(() => setT((performance.now() - t0) / 1000), 80);
    return () => clearInterval(id);
  }, []);
  const base = demoKey === 'sweep' ? CARRIER_JET_DEMO_STATES.cruise : CARRIER_JET_DEMO_STATES[demoKey] ?? CARRIER_JET_DEMO_STATES.cruise;
  const sweepHigh = demoKey === 'sweep' && Math.floor(t / 8) % 2 === 0;
  const speed = demoKey === 'sweep' ? (sweepHigh ? 90 : 20) : num('mph') ?? base.speed;
  const props: CarrierJetHudProps = {
    speed,
    unit: q.get('unit') === 'kph' ? 'kph' : 'mph',
    rpm: (num('rpm') ?? (demoKey === 'sweep' ? (sweepHigh ? 5650 : 1500) : base.rpm)) + (demoKey === 'sweep' ? Math.round(40 * Math.sin(t * 7)) : 0),
    gear: num('gear') ?? (demoKey === 'sweep' ? (sweepHigh ? 6 : 2) : base.gear),
    load: num('load') ?? (demoKey === 'sweep' ? (sweepHigh ? 0.9 : 0.2) : base.load),
    throttle: num('throttle') ?? base.throttle,
    abZone: num('ab') ?? (demoKey === 'sweep' ? (sweepHigh ? 4 : 0) : base.abZone),
    heading: num('heading') ?? (demoKey === 'parked' ? 268 : demoKey === 'high' ? 52 : 47),
    accel: num('accel') ?? (demoKey === 'high' ? 2 : 0),
    redlineRpm: 6000,
    running: true,
    demo: false,
    motion: q.get('cjStill') !== '1',
    driveWindow: dw,
    compact: dw || undefined,
    ...(qVariant ? { variant, onVariantChange: setVariant } : {}),
    ...extra,
  };
  return (
    <div className="theme-stage is-fullscreen" data-drive-window={dw ? 'true' : undefined} style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div className="skin-body" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: dockH }}>
        <CarrierJetHud {...props} />
      </div>
      {dockH > 0 && <Dock dw={dw} h={dockH} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
