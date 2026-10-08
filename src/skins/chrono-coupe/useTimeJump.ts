import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Length of one time-jump light run (matches Audio's cue; Frontend holds the prop this long). */
export const TIME_JUMP_MS = 2000;
/** Early drop: fade whatever is lit to dark over this long, then unmount. */
export const TIME_JUMP_OUT_MS = 240;

export type TimeJumpPhase = 'idle' | 'on' | 'out';

export interface TimeJumpState {
  phase: TimeJumpPhase;
  /** Increments on every rising edge; used as a React key so animations restart. */
  run: number;
}

/**
 * Preview / screenshot override, read inside the skin (no Frontend wiring needed):
 * - `?cc88=1`    → loop the time-jump light: held 2.0 s, released 2.0 s, repeating
 * - `?cc88=dw`   → same, with the drive-window (localized) variant forced on
 * - `?cc88=drop` → same loop, but released early at 0.8 s (checks the clean early end)
 * - `?cc88=arcs` → same loop with the electric arcs forced on (even if the prop is false/unset)
 * - `?cc88arcs=0|1` → arcs off / on (wins over the prop and `cc88=arcs`)
 *   Neither override turns arcs on under Reduce Motion, "Animated environment" off or Reduce Transparency.
 * Absent or `0` → no override. Demo runs use a fixed arc seed per run (repeatable screenshots).
 */
export interface Cc88Demo {
  driveWindow: boolean;
  /** How long each demo run holds the trigger (ms). */
  holdMs: number;
  /** Force the arcs on (`cc88=arcs`). */
  arcs: boolean;
}

/** `?cc88arcs=0|1` (undefined when absent). */
export function cc88ArcsFromQuery(): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('cc88arcs');
  if (v == null) return undefined;
  return !(v === '0' || v === 'false');
}

export function cc88FromQuery(): Cc88Demo | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('cc88');
  if (v == null || v === '0' || v === 'false') return null;
  return { driveWindow: v === 'dw', holdMs: v === 'drop' ? 800 : TIME_JUMP_MS, arcs: v === 'arcs' };
}

/** Demo loop for `?cc88`: true for `holdMs`, false for the rest of a 4 s cycle, repeating. */
export function useCc88Demo(demo: Cc88Demo | null): boolean {
  const [on, setOn] = useState(false);
  const holdMs = demo?.holdMs ?? 0;
  useEffect(() => {
    if (!holdMs) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = (next: boolean) => {
      setOn(next);
      t = setTimeout(() => tick(!next), next ? holdMs : 2 * TIME_JUMP_MS - holdMs);
    };
    t = setTimeout(() => tick(true), 600);
    return () => clearTimeout(t);
  }, [holdMs]);
  return holdMs > 0 && on;
}

/**
 * Rising edge of `active` → phase 'on' (new run). The light itself is a 2.0 s CSS
 * keyframe run that ends dark, so the layers unmount at 2.0 s even if the prop is held.
 * Falling edge while 'on' → phase 'out': the fade wrappers drop to 0 over
 * TIME_JUMP_OUT_MS (no hard cut from a lit frame), then unmount. Idle renders nothing.
 */
export function useTimeJump(active: boolean): TimeJumpState {
  const [state, setState] = useState<TimeJumpState & { prev: boolean }>({ phase: 'idle', run: 0, prev: false });
  let cur = state;
  if (active !== state.prev) {
    // edge of the prop: adjust state during render (no effect round-trip)
    cur = active
      ? { phase: 'on', run: state.run + 1, prev: true }
      : { ...state, phase: state.phase === 'on' ? 'out' : state.phase, prev: false };
    setState(cur);
  }
  const { phase, run } = cur;
  useEffect(() => {
    if (phase === 'idle') return;
    const t = setTimeout(() => setState((s) => (s.run === run ? { ...s, phase: 'idle' } : s)), (phase === 'on' ? TIME_JUMP_MS : TIME_JUMP_OUT_MS) + 40);
    return () => clearTimeout(t);
  }, [phase, run]);
  return { phase, run };
}

/**
 * While the light runs, place its layers on the FLUX core: writes the core centre as
 * CSS vars in unscaled HUD px (`--cc-tj-x/y` on the HUD root, `--cc-tj-px/py` on the
 * FLUX panel). Measured once per run; no observers.
 */
export function useCoreAnchor(rootRef: RefObject<HTMLElement | null>, run: number, live: boolean): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!live || !root) return;
    const core = root.querySelector<SVGGraphicsElement>('.cc-core-wire circle');
    const panel = root.querySelector<HTMLElement>('.cc-charge');
    if (!core || !panel || !root.offsetWidth) return;
    const rr = root.getBoundingClientRect();
    const scale = rr.width / root.offsetWidth || 1;
    const c = core.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    root.style.setProperty('--cc-tj-x', `${((cx - rr.left) / scale).toFixed(1)}px`);
    root.style.setProperty('--cc-tj-y', `${((cy - rr.top) / scale).toFixed(1)}px`);
    panel.style.setProperty('--cc-tj-px', `${((cx - pr.left) / scale).toFixed(1)}px`);
    panel.style.setProperty('--cc-tj-py', `${((cy - pr.top) / scale).toFixed(1)}px`);
    return () => {
      for (const k of ['--cc-tj-x', '--cc-tj-y']) root.style.removeProperty(k);
      for (const k of ['--cc-tj-px', '--cc-tj-py']) panel.style.removeProperty(k);
    };
  }, [rootRef, run, live]);
}

/** Reduce Motion / motion off: one steady glow, fade in, hold, fade out (no flicker, no sweep). */
const STEADY: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.65 }, { opacity: 0 }];
const STEADY_LAYERS = '.cc-tj-halo, .cc-tj-wire, .cc-tj-panel-glow, .cc-tj-bloom, .cc-tj-ring';

/**
 * WAAPI side of the time-jump light (opacity only). The app's reduced-motion and
 * "Animated environment" off rules stop every CSS animation and transition in the stage,
 * so the two pieces that must still move gently live here:
 * - `still` runs: the steady 2.0 s fade on the glow layers (CSS chooses which are shown);
 * - early release (phase 'out'): freeze every light layer where it is and fade the
 *   `.cc-tj-fade` wrappers to dark over TIME_JUMP_OUT_MS, never a hard cut from a lit frame.
 */
export function useTimeJumpMotion(rootRef: RefObject<HTMLElement | null>, { phase, run }: TimeJumpState, still: boolean): void {
  const live = phase !== 'idle';
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !live || !still || typeof Element.prototype.animate !== 'function') return;
    const anims = [...root.querySelectorAll(STEADY_LAYERS)].map((el) => el.animate(STEADY, { duration: TIME_JUMP_MS, fill: 'both' }));
    return () => anims.forEach((a) => a.cancel());
  }, [rootRef, run, live, still]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || phase !== 'out' || typeof Element.prototype.animate !== 'function') return;
    for (const a of root.getAnimations({ subtree: true })) {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (target?.closest('.cc-tj-fade')) a.pause();
    }
    const fades = [...root.querySelectorAll('.cc-tj-fade')].map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TIME_JUMP_OUT_MS, fill: 'forwards' }));
    return () => fades.forEach((a) => a.cancel());
  }, [rootRef, phase, run]);
}
