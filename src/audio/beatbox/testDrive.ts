/**
 * Beat Box test-drive helper: a tiny pure-TS vehicle + auto-gearbox model (no DOM, no storage)
 * that turns two pedals into { rpm, throttle, gear, speed } for a Beat Box engine.
 *
 *   const td = createTestDrive({ engine: 'crossplane-v8', drive: 0.7 });
 *   td.gas(true); const s = td.tick(1 / 60);   // → { rpm, throttle, gear, speed, ... }
 *
 * Behaviour:
 *   idle        idle rpm with a slow ±~25 rpm wander.
 *   launch      clutch slip holds the revs up until the wheels catch up.
 *   upshift     at shiftRpm (scaled by drive: 62 %…95 % of redline): ~80–150 ms fuel cut
 *               (throttle 0), rpm glides down by the ratio step, then power returns.
 *   lift        overrun: throttle 0, stays in gear, slow coast, rpm falls with speed (the
 *               engine's pop gate fires on this lift).
 *   brake       holds the gear while rpm falls with speed, then steps down near the bottom of
 *               the range with a short rev-match blip, and goes to neutral → idle at a stop.
 *   neutral     standing still with the brake held, gas free-revs the engine (blips).
 *   limiter     fuel-cut bounce only at limiterRpm (free-revving / in gear at the cap).
 * gear 0 = neutral. speed in km/h.
 */
import { getBeatboxEngine, type BeatboxEngineId, type BeatboxEngineInfo } from './engines.ts';

export interface TestDriveState {
  rpm: number;
  throttle: number;
  gear: number;
  /** km/h */
  speed: number;
  shifting: boolean;
  limiter: boolean;
}

export interface TestDriveOptions {
  engine?: BeatboxEngineId | BeatboxEngineInfo;
  idleRpm?: number;
  redline?: number;
  limiterRpm?: number;
  /** Overall ratios (gearbox × final drive), first gear first. */
  gears?: number[];
  /** 0..1: how hard the gas pedal pushes and how late it shifts (default 0.7). */
  drive?: number;
}

export interface TestDrive {
  gas(on: boolean): void;
  brake(on: boolean): void;
  setDrive(drive: number): void;
  tick(dt: number): TestDriveState;
  readonly state: TestDriveState;
  reset(): void;
}

const clip = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const WHEEL_R = 0.33;
const rpmPerMps = (ratio: number) => (ratio * 60) / (2 * Math.PI * WHEEL_R);

export function createTestDrive(opts: TestDriveOptions = {}): TestDrive {
  const info = typeof opts.engine === 'string' ? getBeatboxEngine(opts.engine) : opts.engine;
  const idle = opts.idleRpm ?? info?.idleRpm ?? 800;
  const red = opts.redline ?? info?.redline ?? 6500;
  const lim = opts.limiterRpm ?? info?.limiterRpm ?? red + 200;
  const gears = (opts.gears ?? info?.gears ?? [12, 8, 6, 4.6, 3.7, 3]).slice();
  let drive = clip(opts.drive ?? 0.7);

  let gasOn = false, brakeOn = false;
  let v = 0; // m/s
  let rpm = idle;
  let thr = 0;
  let gear = 0;
  let cut = 0; // shift fuel-cut time left (s)
  let shiftT = 0; // time since last shift (s)
  let blip = 0; // rev-match blip time left (s)
  let limCut = 0;
  let t = 0;
  const st: TestDriveState = { rpm: idle, throttle: 0, gear: 0, speed: 0, shifting: false, limiter: false };

  const shiftRpm = () => red * (0.62 + 0.33 * drive);
  const torque = (r: number) => clip(0.62 + 0.55 * Math.sin(Math.PI * clip(r / red, 0, 1.05)) - 0.12 * clip((r / red - 0.85) / 0.15), 0.3, 1.2);

  function reset() {
    gasOn = brakeOn = false; v = 0; rpm = idle; thr = 0; gear = 0; cut = 0; shiftT = 0; blip = 0; limCut = 0; t = 0;
  }

  function tick(dtIn: number): TestDriveState {
    const dt = clip(dtIn, 0, 0.1);
    t += dt;
    shiftT += dt;
    const idleNow = idle + 18 * Math.sin(t * 1.9) + 9 * Math.sin(t * 4.7 + 1.3) + 6 * Math.sin(t * 0.63 + 0.4);
    // pedal → throttle (fast, but not a step)
    const pedal = gasOn ? 0.55 + 0.45 * drive : 0;
    thr += (pedal - thr) * (1 - Math.exp(-dt / (pedal > thr ? 0.06 : 0.04)));
    let thrOut = thr;
    if (blip > 0) { blip -= dt; thrOut = Math.max(thrOut, 0.25 + 0.25 * drive); }
    if (cut > 0) { cut -= dt; thrOut = 0; }
    if (limCut > 0) { limCut -= dt; thrOut = 0; }

    const stopped = v < 0.6;
    // gear selection at rest: neutral when not driving away (or brake held = free rev)
    if (stopped && (!gasOn || brakeOn)) gear = 0;
    if (gear === 0 && gasOn && !brakeOn) { gear = 1; shiftT = 0; }

    if (gear === 0) {
      // free revving: inertia-limited climb, quick fall back to idle
      const up = thrOut * (5200 + 3000 * drive) * torque(rpm);
      const down = (rpm - idleNow) * (thrOut > 0.05 ? 0.3 : 1.25) + 450 * (1 - thrOut) * clip((rpm - idleNow) / 400);
      rpm += (up - down) * dt;
      if (rpm < idleNow) rpm += (idleNow - rpm) * (1 - Math.exp(-dt / 0.15));
      v = Math.max(0, v - 9 * dt);
    } else {
      const ratio = gears[gear - 1];
      const wheelRpm = v * rpmPerMps(ratio);
      // drive force (≈ torque × ratio), drag, engine braking, brake
      const aDrive = thrOut * 8.2 * torque(rpm) * Math.pow(ratio / gears[0], 0.8);
      const aDrag = 0.15 + 0.00042 * v * v + (thrOut < 0.05 ? 0.55 * Math.pow(ratio / gears[0], 0.7) * clip(rpm / red * 2) : 0);
      const aBrake = brakeOn ? 8.5 : 0;
      v = Math.max(0, v + (aDrive - aDrag - aBrake) * dt);
      // clutch slip at launch: revs held up until the wheels catch up
      const slipRpm = gear === 1 && gasOn ? idle + (0.16 + 0.12 * drive) * (red - idle) * thrOut + 0.55 * wheelRpm : 0;
      const target = Math.max(wheelRpm, slipRpm, idleNow);
      rpm += (target - rpm) * (1 - Math.exp(-dt / (cut > 0 || shiftT < 0.15 ? 0.045 : 0.03)));
      // upshift
      if (gasOn && !brakeOn && gear < gears.length && rpm >= shiftRpm() && cut <= 0 && shiftT > 0.35) {
        gear++;
        cut = 0.08 + 0.07 * (1 - drive);
        shiftT = 0;
      }
      // downshift while braking / coasting: hold the gear, step down near the bottom of the range
      const floor = idle + 0.2 * (red - idle);
      if (!gasOn && gear > 1 && rpm < floor && shiftT > 0.3) {
        const next = (v * rpmPerMps(gears[gear - 2]));
        if (next < shiftRpm() * 0.8) { gear--; shiftT = 0; blip = 0.1 + 0.06 * drive; }
      }
      if (!gasOn && v < 2.2) gear = 0; // clutch in near a stop
    }
    // limiter bounce (only reachable at the rpm cap)
    if (rpm >= lim && limCut <= 0) limCut = 0.045 + 0.03 * (1 - drive);
    rpm = Math.min(rpm, lim + 60);
    st.rpm = rpm;
    st.throttle = clip(limCut > 0 || cut > 0 ? 0 : thrOut);
    st.gear = gear;
    st.speed = v * 3.6;
    st.shifting = cut > 0;
    st.limiter = limCut > 0;
    return st;
  }

  return {
    gas: (on) => { gasOn = !!on; },
    brake: (on) => { brakeOn = !!on; },
    setDrive: (d) => { drive = clip(d); },
    tick,
    get state() { return st; },
    reset,
  };
}
