/**
 * Drive parameter feed scheduler (pure, node-testable; useDriveSimulation.ts). requestAnimationFrame drives the feed
 * while the page paints; a 100 ms watchdog steps it whenever no rAF frame has run for more than 150 ms, whether or not
 * the page reports hidden (a Tesla backup camera can cover the browser and throttle rAF without a visibilitychange).
 * Chromium clamps hidden-page timers to ~1 Hz, so watchdog steps may cover up to 1 s of sim time each.
 * Never double-steps: every step goes through one gate that records the step time and drops a step whose time is not
 * later than the last one (a rAF callback landing right after a watchdog step, or vice versa, steps only the new
 * interval, never the same one twice).
 */
export const FRAME_WATCHDOG_MS = 100;
export const FRAME_STALL_MS = 150;
/** Max sim seconds per step: rAF steps (frame-paced) / watchdog steps (throttled timers, hidden or covered page). */
export const FRAME_MAX_STEP_RAF_S = 0.05;
export const FRAME_MAX_STEP_WATCHDOG_S = 1.0;

export interface FrameLoopEnv {
  now(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  setInterval(f: () => void, ms: number): unknown;
  clearInterval(t: unknown): void;
}
/** step(now, dtSeconds): dt is already capped and > 0. */
export type FrameStep = (now: number, dt: number, via: 'raf' | 'watchdog') => void;

export function startFrameLoop(step: FrameStep, env: FrameLoopEnv): () => void {
  let last = env.now(); // last step (either path): the double-step gate and the dt base
  let lastRaf = last; // last rAF callback: the stall detector (so a stalled feed steps every 100 ms, not every 200)
  let handle = 0;
  let stopped = false;
  const run = (via: 'raf' | 'watchdog') => {
    const now = env.now();
    if (!(now > last)) return; // same instant (or clock went back): nothing new to step
    const cap = via === 'raf' ? FRAME_MAX_STEP_RAF_S : FRAME_MAX_STEP_WATCHDOG_S;
    const dt = Math.min(cap, (now - last) / 1000);
    last = now;
    step(now, dt, via);
  };
  const onFrame = () => {
    handle = 0;
    if (stopped) return;
    lastRaf = env.now();
    run('raf');
    // a hidden page doesn't run rAF callbacks; the pending request fires again once the page paints
    handle = env.raf(onFrame);
  };
  handle = env.raf(onFrame);
  const timer = env.setInterval(() => {
    if (stopped) return;
    if (env.now() - lastRaf > FRAME_STALL_MS) run('watchdog');
    if (!handle) handle = env.raf(onFrame);
  }, FRAME_WATCHDOG_MS);
  return () => {
    stopped = true;
    if (handle) env.caf(handle);
    handle = 0;
    env.clearInterval(timer);
  };
}
