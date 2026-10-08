import { useLayoutEffect, type RefObject } from 'react';
import { TIME_JUMP_MS, type TimeJumpState } from './useTimeJump';

/*
 * Time-jump arcs: thin, branching electric arcs that jump across the HUD during the 2.0 s
 * time-jump light. Procedural (midpoint displacement), regenerated every strike, drawn once
 * per run as small SVG strike layers whose opacity is the only thing that animates.
 * Nothing exists while idle; Reduce Motion / motion off render none; Reduce Transparency hides them.
 */

export interface Pt { x: number; y: number }
export interface Rect { l: number; t: number; r: number; b: number }
export interface Strike {
  /** Start inside the 2.0 s run (ms). */
  at: number;
  /** Lit time (ms, 60–140); the after-glow fade adds 0.8× this. */
  life: number;
  /** Main bolt and branches, in HUD design px. */
  main: Pt[];
  branches: Pt[][];
}
export interface ArcField {
  /** Endpoints: frame rim, panel edges, FLUX core. */
  anchors: Pt[];
  /** FLUX core points (centre + electrodes); arcs prefer to run through the core. */
  core: Pt[];
  /** Arcs never cross these (7-seg glass, speed, text, controls), padded. */
  keepOut: Rect[];
  /** Every arc point must stay inside this box (HUD frame, or the FLUX panel in a drive window). */
  bounds: Rect;
}

export const ARC_AFTERGLOW = 0.8;
const MAX_CONCURRENT = 2;

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

/** Start times: weighted toward the first second, never more than 2 lit at once, all done by 2.0 s. */
export function schedule(rnd: () => number, min: number, max: number): { at: number; life: number }[] {
  for (let attempt = 0; attempt < 12; attempt++) {
    const n = min + Math.floor(rnd() * (max - min + 1));
    const raw = Array.from({ length: n }, () => ({ at: Math.round(30 + 1650 * Math.pow(rnd(), 1.7)), life: Math.round(60 + rnd() * 80) })).sort((a, b) => a.at - b.at);
    const out: { at: number; life: number }[] = [];
    for (const s of raw) {
      const end = (x: { at: number; life: number }) => x.at + x.life * (1 + ARC_AFTERGLOW);
      for (;;) {
        const live = out.filter((o) => o.at <= s.at && s.at < end(o));
        if (live.length < MAX_CONCURRENT) break;
        s.at = Math.ceil(Math.min(...live.map(end))) + 8;
      }
      if (s.at + s.life * (1 + ARC_AFTERGLOW) <= TIME_JUMP_MS - 20) out.push(s);
    }
    if (out.length >= min) return out;
  }
  return [];
}

/** Build one strike's bolt + 0–2 branches inside the field (null if no clean path found). */
function makeStrike(f: ArcField, rnd: () => number, local: boolean): Pick<Strike, 'main' | 'branches'> | null {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const [minLen, maxLen] = local ? [40, 220] : [110, 560];
  for (let tries = 0; tries < 160; tries++) {
    const a = rnd() < 0.3 && f.core.length ? pick(f.core) : pick(f.anchors);
    const b = pick(f.anchors);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < minLen || len > maxLen) continue;
    // later tries hug the gaps: lower roughness so a bolt can crawl along a gutter or the rim
    const main = bolt(a, b, rnd, len > 260 ? 6 : 5, tries < 70 ? 0.22 : tries < 120 ? 0.12 : 0.07);
    if (!pathOk(main, f)) continue;
    const branches: Pt[][] = [];
    const nb = Math.floor(rnd() * 3);
    for (let k = 0; k < nb; k++) {
      const i = 2 + Math.floor(rnd() * (main.length - 4));
      const p = main[i];
      const q = main[Math.min(main.length - 1, i + 2)];
      const ang = Math.atan2(q.y - p.y, q.x - p.x) + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
      const bl = len * (0.18 + rnd() * 0.22);
      const br = bolt(p, { x: p.x + Math.cos(ang) * bl, y: p.y + Math.sin(ang) * bl }, rnd, 4, 0.35);
      if (pathOk(br, f)) branches.push(br);
    }
    return { main, branches };
  }
  return null;
}

/** All strikes for one run (pure: same field + seed → same arcs). */
export function planArcs(f: ArcField, seed: number, local: boolean): Strike[] {
  const rnd = rng32(seed);
  const times = local ? schedule(rnd, 2, 3) : schedule(rnd, 4, 8);
  const out: Strike[] = [];
  for (const t of times) {
    const s = makeStrike(f, rnd, local);
    if (s) out.push({ ...t, ...s });
  }
  return out;
}

/* ---------------- DOM side ---------------- */

/** Never crossed as whole boxes: 7-seg glass, speed, readouts, lamps, controls. */
const KEEP_BOX = '.cc-glass, .cc-big, .cc-readout, .cc-ampm i, .cc-colon, .cc-rail button, .cc-meter-text text';
/** Text labels: never crossed, measured tight to the glyphs (so arcs may pass beside them). */
const KEEP_TEXT = '.cc h4, .cc small, .cc-plate, .cc-ampm span, .cc-thr-labels span, .cc-unit, .cc-charge-pct, .cc-redline-tag, .cc-armed-tag';

/** Measure anchors / keep-out boxes from the live layout, in unscaled HUD px. */
export function measureField(root: HTMLElement, local: boolean): ArcField | null {
  if (!root.offsetWidth) return null;
  const rr = root.getBoundingClientRect();
  const s = rr.width / root.offsetWidth || 1;
  const box = (el: Element, pad = 0): Rect => {
    const r = el.getBoundingClientRect();
    return { l: (r.left - rr.left) / s - pad, t: (r.top - rr.top) / s - pad, r: (r.right - rr.left) / s + pad, b: (r.bottom - rr.top) / s + pad };
  };
  const visible = (el: Element) => el.getClientRects().length > 0;
  const keepOut = [...root.querySelectorAll(KEEP_BOX)].filter(visible).map((el) => box(el, 4));
  const range = document.createRange();
  for (const el of root.querySelectorAll(KEEP_TEXT)) {
    if (!visible(el)) continue;
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width && r.height) keepOut.push({ l: (r.left - rr.left) / s - 4, t: (r.top - rr.top) / s - 4, r: (r.right - rr.left) / s + 4, b: (r.bottom - rr.top) / s + 4 });
  }
  const coreEls = [...root.querySelectorAll('.cc-core-wire circle, .cc-core-nodes circle')];
  const core = coreEls.map((el) => {
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
    const p = box(corePanel, -2);
    return { anchors: [...perimeter(box(corePanel, -7), 18), ...core], core, keepOut, bounds: p };
  }
  const frame = box(root, -2);
  const anchors = [...perimeter(box(root, -8), 40)];
  for (const el of root.querySelectorAll('.cc-panel, .cc-bank')) if (visible(el)) anchors.push(...perimeter(box(el, 2), 36));
  return { anchors, core, keepOut, bounds: frame };
}

const SVG = 'http://www.w3.org/2000/svg';
const d = (pts: Pt[], ox: number, oy: number) => pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x - ox).toFixed(1)} ${(p.y - oy).toFixed(1)}`).join('');

/** One small SVG layer per strike, sized to its bounds; CSS animates its opacity only. */
export function renderStrikes(host: HTMLElement, strikes: Strike[]): void {
  host.textContent = '';
  for (const st of strikes) {
    const all = [st.main, ...st.branches].flat();
    const l = Math.min(...all.map((p) => p.x)) - 4;
    const t = Math.min(...all.map((p) => p.y)) - 4;
    const w = Math.max(...all.map((p) => p.x)) + 4 - l;
    const h = Math.max(...all.map((p) => p.y)) + 4 - t;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'cc-tj-strike');
    svg.setAttribute('width', w.toFixed(1));
    svg.setAttribute('height', h.toFixed(1));
    svg.setAttribute('style', `left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;animation-delay:${st.at}ms;animation-duration:${Math.round(st.life * (1 + ARC_AFTERGLOW))}ms`);
    const add = (pts: Pt[], cls: string) => {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d(pts, l, t));
      p.setAttribute('class', cls);
      svg.appendChild(p);
    };
    for (const br of st.branches) add(br, 'cc-tj-bolt-glow cc-tj-branch');
    add(st.main, 'cc-tj-bolt-glow');
    for (const br of st.branches) add(br, 'cc-tj-bolt-core cc-tj-branch');
    add(st.main, 'cc-tj-bolt-core');
    host.appendChild(svg);
  }
}

/**
 * Plans + draws the arcs once at the start of each run (layout effect, before paint).
 * `seed` null → random per run.
 */
export function useTimeJumpArcs(
  rootRef: RefObject<HTMLElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  { phase, run }: TimeJumpState,
  opts: { enabled: boolean; driveWindow: boolean; seed: number | null },
): void {
  const live = phase !== 'idle' && opts.enabled;
  const { driveWindow, seed } = opts;
  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!live || !root || !host) return;
    // Reduce Motion / Reduce Transparency: no arcs at all (the CSS also hides the layer)
    if (matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce)').matches) return;
    const local = driveWindow || !!root.closest('[data-drive-window="true"]');
    const field = measureField(root, local);
    if (!field) return;
    renderStrikes(host, planArcs(field, seed ?? Math.floor(Math.random() * 2 ** 31), local));
    return () => {
      host.textContent = '';
    };
  }, [rootRef, hostRef, run, live, driveWindow, seed]);
}
