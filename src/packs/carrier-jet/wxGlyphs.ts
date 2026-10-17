/**
 * MOCK (mock/cj-map-first, not shipped): original phosphor line glyphs for the CJ OAT readout (24×24, stroked with
 * currentColor; clouds filled with the CRT background so a sun / moon sits behind them). Pure data, so the HUD and the
 * contact-sheet script draw the same art.
 */
import type { WxCond } from './wxMock.ts';

export interface WxPrim {
  d: string;
  /** 'bg' = filled with the CRT background (clouds); default stroke only */
  fill?: 'bg';
  dash?: string;
}

/** Cloud outline with its flat base at y = base, left end at x, width ~ 13.5 * s. */
function cloud(x: number, base: number, s = 1): string {
  const f = (n: number) => +(n * s).toFixed(2);
  return `M${x} ${base}h${f(10.5)}a${f(3.2)} ${f(3.2)} 0 0 0 ${f(0.4)}-${f(6.3)}` +
    `a${f(4.8)} ${f(4.8)} 0 0 0-${f(8.9)}-${f(1.4)}a${f(3.4)} ${f(3.4)} 0 0 0-${f(2)} ${f(7.7)}z`;
}
const ray = (cx: number, cy: number, a: number, r0: number, r1: number) => {
  const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
  return `M${+(cx + c * r0).toFixed(2)} ${+(cy + s * r0).toFixed(2)}L${+(cx + c * r1).toFixed(2)} ${+(cy + s * r1).toFixed(2)}`;
};
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0-${2 * r} 0`;
function sun(cx: number, cy: number, r: number, rays: number[], r0: number, r1: number): string {
  return circle(cx, cy, r) + rays.map((a) => ray(cx, cy, a, r0, r1)).join('');
}
/** Crescent opening to the lower right. */
function moon(cx: number, cy: number, r: number): string {
  const x0 = +(cx + r * 0.35).toFixed(2), y0 = +(cy - r * 0.94).toFixed(2);
  const x1 = +(cx + r * 0.94).toFixed(2), y1 = +(cy + r * 0.35).toFixed(2);
  return `M${x0} ${y0}A${r} ${r} 0 1 0 ${x1} ${y1}A${+(r * 0.78).toFixed(2)} ${+(r * 0.78).toFixed(2)} 0 0 1 ${x0} ${y0}z`;
}
const dot = (x: number, y: number) => `M${x} ${y}h0.01`;
const flake = (x: number, y: number, r: number) => [0, 60, 120].map((a) => ray(x, y, a, -r, r)).join('');

const HI = cloud(5.2, 15.6); // raised cloud over precipitation
const SUN_PEEK = sun(16.6, 7.2, 2.6, [-90, -45, 0, -135], 4.3, 5.9);
const MOON_PEEK = moon(16.4, 7.4, 3.6);

export function wxGlyph(cond: WxCond, night: boolean): WxPrim[] {
  switch (cond) {
    case 'clear':
      return night ? [{ d: moon(12, 12, 7.2) }, { d: dot(18.6, 5.2) + dot(20.4, 9.4) }] : [{ d: sun(12, 12, 4.2, [0, 45, 90, 135, 180, 225, 270, 315], 6.6, 9) }];
    case 'partly_cloudy':
      return [{ d: night ? moon(9.6, 8.6, 5) : sun(9.2, 8.6, 3.2, [180, 225, 270, 315, 135], 5.2, 7) }, { d: cloud(6.6, 19.6, 1.05), fill: 'bg' }];
    case 'cloudy':
      return [{ d: cloud(9.2, 12.6, 0.8), fill: 'bg' }, { d: cloud(3.6, 19.4, 1.05), fill: 'bg' }];
    case 'fog':
      return [{ d: cloud(5.2, 13.4), fill: 'bg' }, { d: 'M3.5 17h12M18 17h2.5M5 20.5h2.5M10 20.5h10' }];
    case 'drizzle':
      return [{ d: night ? MOON_PEEK : SUN_PEEK }, { d: HI, fill: 'bg' }, { d: dot(8.4, 19) + dot(12.4, 20.6) + dot(16.4, 19) + dot(10.4, 22.6) + dot(14.4, 22.6) }];
    case 'rain':
      return [{ d: HI, fill: 'bg' }, { d: 'M8.6 18.4l-1.4 3.4M12.6 18.4l-1.4 3.4M16.6 18.4l-1.4 3.4' }];
    case 'heavy_rain':
      return [{ d: HI, fill: 'bg' }, { d: 'M7.4 18l-2 4.8M10.9 18l-2 4.8M14.4 18l-2 4.8M17.9 18l-2 4.8' }];
    case 'snow':
      return [{ d: HI, fill: 'bg' }, { d: flake(8.6, 20.3, 2) + flake(15.6, 20.3, 2) }];
    case 'sleet':
      return [{ d: HI, fill: 'bg' }, { d: 'M9 18.4l-1.4 3.6' + flake(15.4, 20.3, 2) }];
    case 'thunder':
      return [{ d: HI, fill: 'bg' }, { d: 'M13.4 16.6l-3 4.2h3.4l-2.4 3.4' }];
    case 'wind':
      return [{ d: 'M3 9.5h10.5a2.6 2.6 0 1 0-2.6-2.6M3 13.5h15a2.6 2.6 0 1 1-2.6 2.6M3 17.5h6.5' }];
    case 'unknown':
      return [{ d: cloud(3.6, 18.6, 1.12), fill: 'bg', dash: '2.2 2' }, { d: 'M9.9 12.9a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.95.7-.95 1.3' + dot(11.55, 17.9) }];
  }
}
