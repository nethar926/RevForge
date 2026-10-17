/**
 * WX precipitation radar overlay for the CJ MATRIX MAP (pure, node-testable).
 * Source: RainViewer Weather Maps API (keyless; https://www.rainviewer.com/api.html, checked Fri 16 Oct 2026):
 *   - free for personal or educational use only (no commercial terms published; ask support@rainviewer.com);
 *   - credit: mention the RainViewer API as the source with a link to https://www.rainviewer.com/;
 *   - images may be changed freely (custom colour schemes allowed), so we recolour to the phosphor ramp;
 *   - since 1 Jan 2026: only colour scheme 2 (Universal Blue), max zoom 7, 100 requests/IP/minute, past 2 h only.
 * Latest past frame only (no animation), re-read every 10 min. Tiles: {host}{path}/256/{z}/{x}/{y}/2/1_0.png
 * (smoothed, snow drawn in the rain colours so one table decodes every pixel).
 */
import { storageKey } from '../../lib/storageKey.ts';

export const WX_RADAR_API = 'https://api.rainviewer.com/public/weather-maps.json';
export const WX_RADAR_CREDIT = 'Radar: RainViewer.com';
export const WX_RADAR_URL = 'https://www.rainviewer.com/';
export const WX_RADAR_REFRESH_MS = 10 * 60 * 1000;
export const WX_RADAR_MAX_ZOOM = 7;
/** MapLibre custom protocol: cjrv://{path}/{z}/{x}/{y} → fetched from the API host, recoloured. */
export const WX_RADAR_PROTOCOL = 'cjrv';

export interface RvFrame { time: number; path: string }
export interface RvMaps { host: string; radar?: { past?: RvFrame[] } }
/** Latest past frame (or null when the file has none / is malformed). */
export function latestFrame(j: unknown): { host: string; frame: RvFrame } | null {
  const m = j as RvMaps | null;
  const past = m?.radar?.past;
  if (!m || typeof m.host !== 'string' || !/^https:\/\//.test(m.host) || !Array.isArray(past) || !past.length) return null;
  const f = [...past].filter((p) => p && typeof p.path === 'string' && Number.isFinite(p.time)).sort((a, b) => a.time - b.time).pop();
  return f ? { host: m.host, frame: f } : null;
}
export const rvTileUrl = (host: string, path: string, z: number, x: number, y: number) => `${host}${path}/256/${z}/${x}/${y}/2/1_0.png`;
/** The MapLibre raster source template for a frame (decoded by the cjrv protocol). */
/** `scope`: the RADAR-over-map variant (teal + hatched light rain, see rampForDbz), a separate tile set (`scope/` prefix). */
export const WX_SCOPE_PREFIX = 'scope/';
export const rvSourceTemplate = (path: string, scope = false) => `${WX_RADAR_PROTOCOL}://${scope ? WX_SCOPE_PREFIX : ''}${path.replace(/^\//, '')}/{z}/{x}/{y}`;

/** RainViewer Universal Blue, rain column (dBZ → RGB), from rainviewer_api_colors_table.csv. */
export const UNIVERSAL_BLUE: readonly (readonly [number, number])[] = [
  [-10, 0x636159], [-9, 0x66635a], [-8, 0x69665c], [-7, 0x6c685d], [-6, 0x6f6b5f], [-5, 0x726e61],
  [-4, 0x757062], [-3, 0x787364], [-2, 0x7c7565], [-1, 0x7f7867], [0, 0x827b69], [1, 0x857d6a],
  [2, 0x88806c], [3, 0x8b826d], [4, 0x8e856f], [5, 0x928871], [6, 0x9e9375], [7, 0xaa9e79],
  [8, 0xb6a97e], [9, 0xc2b482], [10, 0xcec087], [11, 0xd2c48b], [12, 0xd6c88f], [13, 0xdacc93],
  [14, 0xded097], [15, 0x88ddee], [16, 0x6cd1eb], [17, 0x51c5e8], [18, 0x36bae5], [19, 0x1baee2],
  [20, 0x00a3e0], [21, 0x009ad5], [22, 0x0091ca], [23, 0x0088bf], [24, 0x007fb4], [25, 0x0077aa],
  [26, 0x0070a3], [27, 0x00699c], [28, 0x006295], [29, 0x005b8e], [30, 0x005588], [31, 0x005180],
  [32, 0x004e78], [33, 0x004a70], [34, 0x004768], [35, 0xffee00], [36, 0xffe000], [37, 0xffd200],
  [38, 0xffc500], [39, 0xffb700], [40, 0xffaa00], [41, 0xff9f00], [42, 0xff9500], [43, 0xff8b00],
  [44, 0xff8100], [45, 0xff4400], [46, 0xf23600], [47, 0xe62800], [48, 0xd91b00], [49, 0xcd0d00],
  [50, 0xc10000], [51, 0xa80000], [52, 0x8f0000], [53, 0x760000], [54, 0x5d0000], [55, 0xffaaff],
  [56, 0xff9fff], [57, 0xff95ff], [58, 0xff8bff], [59, 0xff81ff], [60, 0xff77ff], [61, 0xff6cff],
  [62, 0xff62ff], [63, 0xff58ff], [64, 0xff4eff], [65, 0xffffff], [66, 0xffffff], [67, 0xffffff],
  [68, 0xffffff], [69, 0xffffff], [70, 0xffffff], [71, 0xffffff], [72, 0xffffff], [73, 0xffffff],
  [74, 0xffffff], [75, 0x00ff00], [76, 0x00ff00], [77, 0x00ff00], [78, 0x00ff00], [79, 0x00ff00],
  [80, 0x00ff00], [81, 0x00ff00], [82, 0x00ff00], [83, 0x00ff00], [84, 0x00ff00], [85, 0x00ff00],
  [86, 0x00ff00], [87, 0x00ff00], [88, 0x00ff00], [89, 0x00ff00], [90, 0x00ff00], [91, 0x00ff00],
  [92, 0x00ff00], [93, 0x00ff00], [94, 0x00ff00], [95, 0x00ff00]
];

/** Phosphor precip ramp (RGBA 0-255): dim green drizzle → green → amber → orange → red, alpha ≤ 0.67 and darker than the
 * road phosphor (#8dffad) so streets stay readable on top. */
/**
 * Phosphor ramp. `scope` (RADAR over the map, mock): light and moderate rain (< 40 dBZ) turn teal so they never read
 * as the green phosphor roads / sweep; heavy (amber) and intense (red) are unchanged.
 */
export function rampForDbz(dbz: number, scope = false): [number, number, number, number] {
  if (dbz < 10) return [0, 0, 0, 0];
  if (scope && dbz < 20) return [0x3a, 0xb8, 0xd0, 80];
  if (scope && dbz < 30) return [0x4c, 0xcc, 0xe0, 105];
  if (scope && dbz < 40) return [0x66, 0xdc, 0xec, 130];
  if (dbz < 20) return [0x2a, 0x9a, 0x4c, 60];
  if (dbz < 30) return [0x33, 0xb8, 0x5c, 85];
  if (dbz < 40) return [0x3f, 0xd0, 0x6a, 110];
  if (dbz < 47) return [0xff, 0xb0, 0x00, 140];
  if (dbz < 55) return [0xff, 0x6a, 0x2a, 155];
  return [0xff, 0x30, 0x48, 170];
}

/** Nearest Universal Blue entry for an RGB pixel (smoothed edges blend, so nearest, not exact). */
export function dbzForRgb(r: number, g: number, b: number): number {
  let best = -99, bd = Infinity;
  for (const [d, c] of UNIVERSAL_BLUE) {
    const dr = r - (c >> 16), dg = g - ((c >> 8) & 255), db = b - (c & 255);
    const e = dr * dr + dg * dg + db * db;
    if (e < bd) { bd = e; best = d; }
  }
  return best;
}

/** Recolour RGBA pixels in place (alpha < 48 = edge haze / no data → clear). Returns the count of lit pixels. */
/** Scope variant: light/moderate rain also gets a 45° hatch (every 8th diagonal px pair brighter; 256 % 8 = 0, so it runs on across tiles). */
export const WX_SCOPE_HATCH = { period: 8, width: 2, alpha: 175 } as const;
export function recolorRgba(px: Uint8ClampedArray, cache = new Map<number, number>(), opts: { scope?: boolean; width?: number } = {}): number {
  let lit = 0;
  const scope = !!opts.scope, W = opts.width ?? 256;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 48) { px[i + 3] = 0; continue; }
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let d = cache.get(key);
    if (d === undefined) { d = dbzForRgb(px[i], px[i + 1], px[i + 2]); cache.set(key, d); }
    const [r, g, b, al0] = rampForDbz(d, scope);
    const p = i >> 2, hatch = scope && al0 && d < 40 && ((p % W) + Math.floor(p / W)) % WX_SCOPE_HATCH.period < WX_SCOPE_HATCH.width;
    const al = hatch ? WX_SCOPE_HATCH.alpha : al0;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round((al * a) / 255);
    if (al) lit++;
  }
  return lit;
}

/* ---- toggle store: WX key on the MAP cell (default off, persisted); ?cjWxRadar=1 forces it on (shots / testing) */
export const WX_RADAR_KEY = 'revforge.pack.carrier-jet.wxRadar';
type Listener = () => void;
const listeners = new Set<Listener>();
const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cjWxRadar') === '1';
let on = forced || (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(storageKey(WX_RADAR_KEY)) === '1';
  } catch {
    return false;
  }
})();
export const getWxRadar = () => on;
export function setWxRadar(v: boolean) {
  if (v === on) return;
  on = v;
  try {
    localStorage.setItem(storageKey(WX_RADAR_KEY), v ? '1' : '0');
  } catch { /* private mode */ }
  for (const f of listeners) f();
}
export function subscribeWxRadar(f: Listener) {
  listeners.add(f);
  return () => listeners.delete(f);
}
