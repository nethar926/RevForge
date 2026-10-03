import { useEffect, useRef, useState } from 'react';

const C = 150;

/** Irregular segment patterns (pathLength 360 → degrees) so rotation reads clearly and never aliases. */
const OUTER_DASH = '46 5 18 5 64 5 10 5 38 5 26 5 52 5 14 5 22 5';
const INNER_DASH = '58 7 20 7 84 7 32 7 12 7 46 7 26 7 ';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Gear readout inside two counter-rotating segmented rings.
 * Inner ring: rpm / 5 °/s clockwise. Outer ring: mph / 2 °/s counter-clockwise.
 * One rAF loop integrates angle from the latest telemetry (no CSS durations, so
 * speed changes never jump). Holds still under Reduce Motion / motion off.
 */
export function HelmRings({ rpm, mph, gear, still, compact = false }: { rpm: number; mph: number; gear: string; still: boolean; compact?: boolean }) {
  const reduced = useReducedMotion();
  const frozen = still || reduced;
  const live = useRef({ rpm, mph });
  live.current = { rpm: Math.max(0, rpm), mph: Math.max(0, mph) };
  const innerRef = useRef<SVGGElement>(null);
  const outerRef = useRef<SVGGElement>(null);
  const angles = useRef({ inner: 0, outer: 0 });

  useEffect(() => {
    if (frozen) return;
    let raf = 0;
    let last = performance.now();
    const write = (el: SVGGElement | null, a: number) => {
      if (!el) return;
      el.setAttribute('transform', `rotate(${a.toFixed(2)} ${C} ${C})`);
      el.dataset.angle = a.toFixed(2);
    };
    const step = (t: number) => {
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      const { rpm: r, mph: m } = live.current;
      if (r > 0 || m > 0) {
        const a = angles.current;
        a.inner = (a.inner + (r / 5) * dt) % 360; // clockwise
        a.outer = (a.outer - (m / 2) * dt) % 360; // counter-clockwise
        write(innerRef.current, a.inner);
        write(outerRef.current, a.outer);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [frozen]);

  return (
    <svg className="sh-rings" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-frozen={frozen ? 'true' : 'false'}>
      <defs>
        <radialGradient id="sh-core" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#16223a" />
          <stop offset="1" stopColor="#070c18" />
        </radialGradient>
      </defs>
      {/* static hairline tick ring */}
      <g className="sh-ticks">
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i * 5 * Math.PI) / 180;
          const r1 = i % 6 === 0 ? 133 : 137;
          return <line key={i} x1={C + Math.sin(a) * r1} y1={C - Math.cos(a) * r1} x2={C + Math.sin(a) * 142} y2={C - Math.cos(a) * 142} />;
        })}
      </g>
      <g ref={outerRef} className="sh-ring-outer" data-angle="0" transform={`rotate(0 ${C} ${C})`}>
        <circle cx={C} cy={C} r="118" className="sh-ring-track" strokeWidth="14" />
        <circle cx={C} cy={C} r="118" pathLength={360} className="sh-ring-seg" strokeWidth="14" strokeDasharray={OUTER_DASH} />
        <path d={`M${C} 22 l7 -10 h-14 z`} className="sh-ring-mark" />
      </g>
      <g ref={innerRef} className="sh-ring-inner" data-angle="0" transform={`rotate(0 ${C} ${C})`}>
        <circle cx={C} cy={C} r="92" className="sh-ring-track" strokeWidth="18" />
        <circle cx={C} cy={C} r="92" pathLength={360} className="sh-ring-seg" strokeWidth="18" strokeDasharray={INNER_DASH} />
        <rect x={C - 3} y="68" width="6" height="16" className="sh-ring-mark" />
      </g>
      <circle cx={C} cy={C} r="66" fill="url(#sh-core)" className="sh-ring-core" />
      {compact ? (
        // Compact: label grows (rendered ≥11px down to a ~165px ring) and sits lower in the core.
        <>
          <text x={C} y={C + 18} textAnchor="middle" className="sh-gear-num sh-gear-num-c">{gear}</text>
          <text x={C} y={C + 53} textAnchor="middle" className="sh-gear-label sh-gear-label-c">GEAR</text>
        </>
      ) : (
        <>
          <text x={C} y={C + 26} textAnchor="middle" className="sh-gear-num">{gear}</text>
          <text x={C} y={C + 50} textAnchor="middle" className="sh-gear-label">GEAR</text>
        </>
      )}
    </svg>
  );
}
