/**
 * Carrier-launch AB light (pure; Frontend). Dan's engine API getLaunchActive() (fd583b2) is polled on the existing HUD
 * tick (the mount re-renders on each drive-sim HUD publish, ~80 ms; no extra rAF) while the engine runs. While a launch
 * is active the AB readouts light as for normal AB (zone ≥ 1) and the AB control shows LAUNCH; VoiceOver hears
 * 'Afterburner launch' once per activation (aria-live polite; cleared when the launch ends so the next one speaks).
 */
export const LAUNCH_SAY = 'Afterburner launch';
export interface LaunchLight {
  lit: boolean;
  /** aria-live text: LAUNCH_SAY from the rising edge until the launch ends, else ''. */
  say: string;
  /** Activations so far. */
  count: number;
}
export const LAUNCH_OFF: LaunchLight = { lit: false, say: '', count: 0 };
/** Next state; returns `prev` itself when nothing changed (React bail-out). */
export function launchStep(prev: LaunchLight, active: boolean): LaunchLight {
  if (active === prev.lit) return prev;
  return active ? { lit: true, say: LAUNCH_SAY, count: prev.count + 1 } : { lit: false, say: '', count: prev.count };
}
/** Poll: only while the engine runs; an engine without the API (or a throw) reads as no launch. */
export function readLaunchActive(api: { getLaunchActive?(): boolean } | null | undefined, running: boolean): boolean {
  if (!running || !api || typeof api.getLaunchActive !== 'function') return false;
  try {
    return api.getLaunchActive() === true;
  } catch {
    return false;
  }
}
/** The HUD's AB zone while a launch is lit: at least zone 1 (the normal AB light), else Audio's zone unchanged. */
export const launchAbZone = (zone: number | undefined, lit: boolean): number | undefined => (lit ? Math.max(1, zone ?? 0) : zone);
