import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { TIME_JUMP_MS, TIME_JUMP_OUT_MS, type TimeJumpState } from './useTimeJump';

/*
 * Time-jump arcs: branching electric-blue arcs that crawl across the HUD during the 2.0 s
 * time-jump light. Procedural (midpoint displacement; at the full layout routed along the gutters
 * and panel chrome around every digit, label and control), each strike drawn once on its own
 * small canvas whose opacity is the only thing that animates (compositor). Nothing exists while
 * idle or between strikes.
 * Each strike is a soft glow envelope (ease in ~100 ms, hold, ease out ~250 ms), never a flicker,
 * and at most 3 strikes start in any 1 s (WCAG 2.3.1). None under Reduce Motion (OS or the in-app
 * motion switch) or Reduce Transparency.
 */

export interface Pt { x: number; y: number }
export interface Rect { l: number; t: number; r: number; b: number }
export interface StrikeTiming {
  /** Start inside the 2.0 s run (ms). */
  at: number;
  /** Ease-in, hold and ease-out durations (ms). */
  fadeIn: number;
  hold: number;
  fadeOut: number;
}
export interface Strike extends StrikeTiming {
  /** Main bolt and branches, in HUD design px. */
  main: Pt[];
  branches: Pt[][];
}
export interface ArcField {
  /** Endpoints: frame rim, panel edges, FLUX core. */
  anchors: Pt[];
  /** FLUX core points (centre + electrodes). */
  core: Pt[];
  /** Arcs (glow included) never touch these: 7-seg glass, speed/gear, every text run, controls. */
  keepOut: Rect[];
  /** Every arc point stays inside this box (HUD frame, or the FLUX panel in a drive window). */
  bounds: Rect;
}

/**
 * Whether a run gets arcs. Off by default (`timeJumpArcs` undefined → none). The demo overrides
 * (`?cc88=arcs`, `?cc88arcs=0|1`) only choose on/off; nothing turns them on under Reduce Motion
 * (OS setting or the in-app "Animated environment" off, i.e. `still`) or Reduce Transparency.
 */
export function arcsEnabled(o: { prop?: boolean; demoArcs?: boolean; query?: boolean; still: boolean; reducedTransparency: boolean }): boolean {
  if (o.still || o.reducedTransparency) return false;
  if (o.query !== undefined) return o.query;
  return !!o.demoArcs || o.prop === true;
}

/** Live `prefers-reduced-transparency: reduce`. */
export function useReducedTransparency(): boolean {
  const q = () => {
    try {
      return window.matchMedia('(prefers-reduced-transparency: reduce)');
    } catch {
      return null;
    }
  };
  const [on, setOn] = useState(() => !!q()?.matches);
  useEffect(() => {
    const m = q();
    if (!m) return;
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

export const MAX_CONCURRENT = 2;
/** WCAG 2.3.1: never more than 3 strike envelopes starting in any 1000 ms. */
export const MAX_STARTS_PER_SECOND = 3;
export const strikeEnd = (s: StrikeTiming) => s.at + s.fadeIn + s.hold + s.fadeOut;

/** Glow envelope 0..1 at run time t: smooth ease in, hold, smooth ease out. */
export function envelope(s: StrikeTiming, t: number): number {
  const u = t - s.at;
  if (u <= 0 || t >= strikeEnd(s)) return 0;
  const ss = (x: number) => x * x * (3 - 2 * x);
  if (u < s.fadeIn) return ss(u / s.fadeIn);
  if (u < s.fadeIn + s.hold) return 1;
  return ss(1 - (u - s.fadeIn - s.hold) / s.fadeOut);
}

/** Small seeded PRNG (mulberry32). */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midpoint displacement between a and b: jagged bolt with 2^depth segments. */
export function bolt(a: Pt, b: Pt, rnd: () => number, depth = 5, rough = 0.22): Pt[] {
  let pts = [a, b];
  let amp = Math.hypot(b.x - a.x, b.y - a.y) * rough;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const off = (rnd() * 2 - 1) * amp;
      next.push({ x: (p.x + q.x) / 2 + (-(q.y - p.y) / len) * off, y: (p.y + q.y) / 2 + ((q.x - p.x) / len) * off }, q);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

const inside = (p: Pt, r: Rect) => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b;
function segHitsRect(p: Pt, q: Pt, r: Rect): boolean {
  if (inside(p, r) || inside(q, r)) return true;
  // Liang–Barsky clip
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - r.l], [dx, r.r - p.x], [-dy, p.y - r.t], [dy, r.b - p.y]]) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}
function pathOk(pts: Pt[], f: ArcField): boolean {
  for (const p of pts) if (!inside(p, f.bounds)) return false;
  for (let i = 1; i < pts.length; i++) for (const r of f.keepOut) if (segHitsRect(pts[i - 1], pts[i], r)) return false;
  return true;
}

/** <=2 strikes alive at any instant and <=3 starts in any 1000 ms window. */
export function scheduleOk(set: StrikeTiming[]): boolean {
  for (const x of set) {
    if (set.filter((o) => o.at <= x.at && x.at < strikeEnd(o)).length > MAX_CONCURRENT) return false;
    if (set.filter((o) => o.at > x.at - 1000 && o.at <= x.at).length > MAX_STARTS_PER_SECOND) return false;
  }
  return true;
}

/** Start times: weighted to the first second, <=2 alive at once, <=3 starts in any 1 s, all done by 2.0 s. */
export function schedule(rnd: () => number, min: number, max: number): StrikeTiming[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = min + Math.floor(rnd() * (max - min + 1));
    const raw = Array.from({ length: n }, () => ({
      at: Math.round(40 + 1300 * Math.pow(rnd(), 1.6)),
      fadeIn: Math.round(80 + rnd() * 40),
      hold: Math.round(60 + rnd() * 90),
      fadeOut: Math.round(200 + rnd() * 100),
    })).sort((a, b) => a.at - b.at);
    const out: StrikeTiming[] = [];
    for (const s of raw) {
      // slide later until the whole set stays within both limits; drop if it no longer fits
      while (strikeEnd(s) <= TIME_JUMP_MS - 20 && !scheduleOk([...out, s])) s.at += 10;
      if (strikeEnd(s) <= TIME_JUMP_MS - 20) out.push(s);
    }
    out.sort((x, y) => x.at - y.at);
    if (out.length >= min) return out;
  }
  return [];
}

/** Drive window: short bolt + 0–2 branches inside the FLUX panel (null if no clean path). */
function localStrike(f: ArcField, rnd: () => number): Pick<Strike, 'main' | 'branches'> | null {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  for (let tries = 0; tries < 160; tries++) {
    const a = rnd() < 0.3 && f.core.length ? pick(f.core) : pick(f.anchors);
    const b = pick(f.anchors);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 40 || len > 220) continue;
    const main = bolt(a, b, rnd, 5, tries < 70 ? 0.22 : tries < 120 ? 0.12 : 0.07);
    if (!pathOk(main, f)) continue;
    return { main, branches: forks(main, len, f, rnd) };
  }
  return null;
}

/** 0–2 short forks off a main bolt. */
function forks(main: Pt[], len: number, f: ArcField, rnd: () => number): Pt[][] {
  const out: Pt[][] = [];
  const nb = Math.floor(rnd() * 3);
  for (let k = 0; k < nb && main.length > 6; k++) {
    const i = 2 + Math.floor(rnd() * (main.length - 5));
    const p = main[i];
    const q = main[i + 2];
    const ang = Math.atan2(q.y - p.y, q.x - p.x) + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6);
    const bl = Math.min(90, len * (0.12 + rnd() * 0.18));
    const br = bolt(p, { x: p.x + Math.cos(ang) * bl, y: p.y + Math.sin(ang) * bl }, rnd, 4, 0.35);
    if (pathOk(br, f)) out.push(br);
  }
  return out;
}

/* Full layout: routed strikes. A coarse occupancy grid of the free space (gutters, panel chrome,
   empty panel areas) and a noisy A* between two far-apart anchors give a route that travels
   across the display around the keep-outs; the route is then roughened by midpoint displacement
   and re-checked against the exact boxes. */
const CELL = 8;
export interface Grid { w: number; h: number; ox: number; oy: number; free: Uint8Array }
function makeGrid(f: ArcField): Grid {
  const ox = f.bounds.l;
  const oy = f.bounds.t;
  const w = Math.max(1, Math.floor((f.bounds.r - ox) / CELL));
  const h = Math.max(1, Math.floor((f.bounds.b - oy) / CELL));
  const free = new Uint8Array(w * h).fill(1);
  const block = (r: Rect, pad: number) => {
    const x0 = Math.max(0, Math.floor((r.l - pad - ox) / CELL));
    const x1 = Math.min(w - 1, Math.ceil((r.r + pad - ox) / CELL));
    const y0 = Math.max(0, Math.floor((r.t - pad - oy) / CELL));
    const y1 = Math.min(h - 1, Math.ceil((r.b + pad - oy) / CELL));
    for (let y = y0; y <= y1; y++) free.fill(0, y * w + x0, y * w + x1 + 1);
  };
  for (const r of f.keepOut) block(r, 2);
  // rim cells and the rounded corners stay empty
  const c = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ex = Math.min(x, w - 1 - x);
    const ey = Math.min(y, h - 1 - y);
    if (ex < 1 || ey < 1 || (ex < c && ey < c)) free[y * w + x] = 0;
  }
  return { w, h, ox, oy, free };
}
function astar(g: Grid, a: number, b: number, cost: Float32Array): number[] | null {
  const n = g.w * g.h;
  const gs = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const bx = b % g.w;
  const by = (b / g.w) | 0;
  gs[a] = 0;
  push(0, a);
  let seen = 0;
  while (heap.length) {
    const [, i] = pop();
    if (i === b) break;
    if (++seen > n * 2) return null;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (!g.free[j]) continue;
      if (dx && dy && (!g.free[y * g.w + nx] || !g.free[ny * g.w + x])) continue; // no corner cutting
      const ng = gs[i] + (dx && dy ? 1.414 : 1) * cost[j];
      if (ng < gs[j]) {
        gs[j] = ng;
        from[j] = i;
        push(ng + Math.hypot(nx - bx, ny - by), j);
      }
    }
  }
  if (from[b] < 0) return null;
  const path = [b];
  for (let i = b; i !== a; i = from[i]) path.push(from[i]);
  return path.reverse();
}
function routedStrike(f: ArcField, g: Grid, rnd: () => number): Pick<Strike, 'main' | 'branches'> | null {
  const cell = (p: Pt) => {
    const x = Math.round((p.x - g.ox) / CELL);
    const y = Math.round((p.y - g.oy) / CELL);
    return x >= 0 && y >= 0 && x < g.w && y < g.h && g.free[y * g.w + x] ? y * g.w + x : -1;
  };
  const centre = (i: number): Pt => ({ x: g.ox + (i % g.w) * CELL, y: g.oy + ((i / g.w) | 0) * CELL });
  const ends = [...f.anchors, ...f.core].map(cell).filter((i) => i >= 0);
  if (ends.length < 2) return null;
  // per-run noise: routes wander instead of hugging one shortest line
  const cost = new Float32Array(g.w * g.h);
  for (let i = 0; i < cost.length; i++) cost[i] = 1 + rnd() * 1.6;
  for (let tries = 0; tries < 24; tries++) {
    const a = ends[Math.floor(rnd() * ends.length)];
    const b = ends[Math.floor(rnd() * ends.length)];
    const d = Math.hypot((a % g.w) - (b % g.w), ((a / g.w) | 0) - ((b / g.w) | 0)) * CELL;
    if (d < 260 || d > 980) continue;
    const route = astar(g, a, b, cost);
    if (!route || route.length * CELL > d * 1.9) continue;
    // waypoints every 3-5 cells, then roughen each span; fall back to the cell path where needed
    const main: Pt[] = [centre(route[0])];
    for (let k = 0; k < route.length - 1; ) {
      const step = Math.min(route.length - 1 - k, 3 + Math.floor(rnd() * 3));
      const p = centre(route[k]);
      const q = centre(route[k + step]);
      let span: Pt[] | null = null;
      for (const rough of [0.28, 0.14, 0]) {
        const s = rough ? bolt(p, q, rnd, 2, rough) : [p, q];
        if (pathOk(s, f)) {
          span = s;
          break;
        }
      }
      if (span) main.push(...span.slice(1));
      else for (let j = k + 1; j <= k + step; j++) main.push(centre(route[j]));
      k += step;
    }
    if (!pathOk(main, f)) continue;
    return { main, branches: forks(main, d, f, rnd) };
  }
  return null;
}

/** Strike timings for one run (seeded). */
export function planTimes(seed: number, local: boolean): StrikeTiming[] {
  const rnd = rng32(seed);
  return local ? schedule(rnd, 2, 3) : schedule(rnd, 4, 6);
}

/** Path of strike i (own seeded stream, so strikes can be planned lazily, one at a time). */
export function planPath(f: ArcField, grid: Grid | null, seed: number, i: number): Pick<Strike, 'main' | 'branches'> | null {
  const rnd = rng32((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  return grid ? routedStrike(f, grid, rnd) ?? localStrike(f, rnd) : localStrike(f, rnd);
}

/** All strikes for one run (pure: same field + seed → same arcs). */
export function planArcs(f: ArcField, seed: number, local: boolean): Strike[] {
  const grid = local ? null : makeGrid(f);
  const out: Strike[] = [];
  planTimes(seed, local).forEach((t, i) => {
    const s = planPath(f, grid, seed, i);
    if (s) out.push({ ...t, ...s });
  });
  return out;
}

/* ---------------- DOM side ---------------- */

/** Whole boxes never touched: 7-seg glass, speed/gear/rpm, lamps, every control. */
const KEEP_BOX = '.cc-glass, .cc-big, .cc-gear, .cc-rpm, .cc-readout, .cc-ampm i, .cc-colon, svg text, button, [role="button"], input, select, a[href]';
/** Glow half-width + margin kept clear around every keep-out box (HUD design px). */
const KEEP_PAD = 7;

/** Measure anchors / keep-out boxes from the live layout, in unscaled HUD px. */
export function measureField(root: HTMLElement, local: boolean): ArcField | null {
  if (!root.offsetWidth) return null;
  const rr = root.getBoundingClientRect();
  const s = rr.width / root.offsetWidth || 1;
  const toRect = (r: DOMRect | DOMRectReadOnly, pad: number): Rect => ({ l: (r.left - rr.left) / s - pad, t: (r.top - rr.top) / s - pad, r: (r.right - rr.left) / s + pad, b: (r.bottom - rr.top) / s + pad });
  const box = (el: Element, pad = 0) => toRect(el.getBoundingClientRect(), pad);
  const keepOut: Rect[] = [];
  for (const el of root.querySelectorAll(KEEP_BOX)) for (const r of el.getClientRects()) if (r.width > 2 && r.height > 2) keepOut.push(toRect(r, KEEP_PAD));
  // every visible text run (labels, units, captions), measured tight to the glyphs
  const range = document.createRange();
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode;
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2) keepOut.push(toRect(r, KEEP_PAD));
  }
  const core = [...root.querySelectorAll('.cc-core-wire circle, .cc-core-nodes circle')].map((el) => {
    const r = box(el);
    return { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
  });
  const perimeter = (r: Rect, step: number): Pt[] => {
    const pts: Pt[] = [];
    for (let x = r.l; x <= r.r; x += step) pts.push({ x, y: r.t }, { x, y: r.b });
    for (let y = r.t + step; y < r.b; y += step) pts.push({ x: r.l, y }, { x: r.r, y });
    return pts;
  };
  const corePanel = root.querySelector('.cc-charge');
  if (!corePanel) return null;
  if (local) {
    // inset by the glow half-width so even the outer glow stays inside the panel
    return { anchors: [...perimeter(box(corePanel, -11), 18), ...core], core, keepOut, bounds: box(corePanel, -8) };
  }
  const anchors = perimeter(box(root, -14), 24);
  for (const el of root.querySelectorAll('.cc-panel, .cc-bank')) if (el.getClientRects().length) anchors.push(...perimeter(box(el, 4), 24));
  return { anchors, core, keepOut, bounds: box(root, -4) };
}

/** Stroke stack, outer glow → white-blue core: [screen px width, colour, alpha]. No blur filters. */
const STROKES: [number, string, number][] = [
  [10, '#3d9bff', 0.3],
  [6, '#4da6ff', 0.48],
  [3.4, '#6cbcff', 0.8],
  [1.8, '#e8f4ff', 0.96],
];

/** Opacity keyframes of one strike's glow envelope (WAAPI, compositor-only). */
function envelopeKeyframes(s: StrikeTiming): Keyframe[] {
  const T = s.fadeIn + s.hold + s.fadeOut;
  return [
    { opacity: 0, easing: 'ease-in-out' },
    { opacity: 1, offset: s.fadeIn / T },
    { opacity: 1, offset: (s.fadeIn + s.hold) / T, easing: 'ease-in-out' },
    { opacity: 0, offset: 1 },
  ];
}

/** Draw one strike once onto its own small canvas (glow = stacked strokes). */
function strikeCanvas(st: Pick<Strike, 'main' | 'branches'>, scale: number, widthMul: number): HTMLCanvasElement {
  const k = scale * Math.min(window.devicePixelRatio || 1, 1.5);
  const pad = (STROKES[0][0] * widthMul) / scale / 2 + 2;
  const all = [st.main, ...st.branches].flat();
  const l = Math.min(...all.map((p) => p.x)) - pad;
  const t = Math.min(...all.map((p) => p.y)) - pad;
  const w = Math.max(...all.map((p) => p.x)) + pad - l;
  const h = Math.max(...all.map((p) => p.y)) + pad - t;
  const c = document.createElement('canvas');
  c.className = 'cc-tj-arcs-canvas';
  c.style.cssText = `left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
  c.width = Math.ceil(w * k);
  c.height = Math.ceil(h * k);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.setTransform(k, 0, 0, k, -l * k, -t * k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [px, colour, alpha] of STROKES) {
    ctx.strokeStyle = colour;
    for (const [pts, mul] of [[st.main, 1] as const, ...st.branches.map((b) => [b, 0.7] as const)]) {
      ctx.lineWidth = (px * widthMul * mul) / scale;
      ctx.globalAlpha = alpha * (mul === 1 ? 1 : 0.8);
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }
  return c;
}

/**
 * Plans the run's strike timings at the start of each run and, at each strike's time, its path
 * (lazily, one per timer) onto its own small canvas, drawn ONCE; only the canvas opacity animates
 * (WAAPI, compositor). No rAF, no per-frame drawing; each canvas is removed when its glow ends.
 * `seed` null → random per run.
 */
export function useTimeJumpArcs(
  rootRef: RefObject<HTMLElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  { phase, run }: TimeJumpState,
  opts: { enabled: boolean; driveWindow: boolean; seed: number | null },
): void {
  const live = phase !== 'idle' && opts.enabled;
  const releasing = phase === 'out';
  const { driveWindow, seed } = opts;
  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!live || !root || !host) return;
    // Reduce Motion (OS or the in-app motion switch) / Reduce Transparency: no arcs at all
    if (root.closest('.motion-off') || matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)').matches) return;
    const local = driveWindow || !!root.closest('[data-drive-window="true"]');
    const field = measureField(root, local);
    if (!field) return;
    const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
    const runSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
    const times = planTimes(runSeed, local);
    let grid: Grid | null = null;
    const t0 = performance.now();
    // QA hooks (harmless data attributes): run start and the strike timings
    host.dataset.t0 = t0.toFixed(2);
    host.dataset.strikes = times.map((st) => `${st.at}:${st.fadeIn}:${st.hold}:${st.fadeOut}`).join(',');
    const timers: number[] = [];
    times.forEach((st, i) => {
      timers.push(window.setTimeout(() => {
        if (!local && !grid) grid = makeGrid(field);
        const path = planPath(field, grid, runSeed, i);
        if (!path) return;
        const c = strikeCanvas(path, scale, local ? 0.78 : 1);
        c.dataset.at = String(st.at);
        host.appendChild(c);
        c.animate(envelopeKeyframes(st), { duration: st.fadeIn + st.hold + st.fadeOut, fill: 'both' });
        timers.push(window.setTimeout(() => c.remove(), st.fadeIn + st.hold + st.fadeOut + 16));
      }, Math.max(0, st.at - (performance.now() - t0))));
    });
    return () => {
      for (const id of timers) clearTimeout(id);
      host.textContent = '';
      delete host.dataset.t0;
      delete host.dataset.strikes;
    };
  }, [rootRef, hostRef, run, live, driveWindow, seed]);
  // early release: lit strikes fade out with the light (TIME_JUMP_OUT_MS), no hard cut
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!releasing || !host) return;
    for (const c of host.querySelectorAll('canvas')) c.animate([{ opacity: getComputedStyle(c).opacity }, { opacity: 0 }], { duration: TIME_JUMP_OUT_MS, fill: 'forwards' });
  }, [hostRef, releasing]);
}
