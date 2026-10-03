/**
 * Pulse-worklet DC guard for every combustion (ICE) pack.
 *
 * Above ~3k rpm the overlapping firing pulses carry a DC offset into the exhaust waveguide;
 * the waveguide's tanh saturates on it and the downstream DC blocker leaves near-silence
 * (stock V8 lost ~25 dB at 4.5k rpm). The worklet's `dcGuard` param strips DC from the pulse
 * excitation (~12 Hz one-pole). It is rpm-gated so idle / low rpm is bit-for-bit unchanged:
 * 0 below 1500 rpm, ramping to full by 2800 rpm.
 *
 * Optional per-patch override: `params.dcGuard` (0..1) scales the guard; 0 disables it.
 */
export const ICE_DC_GUARD_RPM_START = 1500;
export const ICE_DC_GUARD_RPM_FULL = 2800;

export function iceDcGuardForRpm(rpm: number, amount: unknown = 1): number {
  const amt = amount == null || !Number.isFinite(Number(amount)) ? 1 : Math.max(0, Math.min(1, Number(amount)));
  const r = Number.isFinite(rpm) ? rpm : 0;
  const ramp = (r - ICE_DC_GUARD_RPM_START) / (ICE_DC_GUARD_RPM_FULL - ICE_DC_GUARD_RPM_START);
  return Math.max(0, Math.min(1, ramp)) * amt;
}
