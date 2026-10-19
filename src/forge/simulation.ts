/** Drivetrain derived from RevForge, with neutral, timestamped GPS and shared audio RPM. */
export interface Drivetrain {
  topSpeedMps?:number;
  warningRpm?:number;
  idleRpm: number;
  redline: number;
  shiftRpm: number;
  gears: number;
  finalDrive: number;
}
export interface Simulation {
  speedMps: number;
  rpm: number;
  gear: number;
  load: number;
  accel: number;
  distance: number;
  shiftTime: number;
  shifting: boolean;
  overrun: boolean;
}
export interface Controls {
  pedal: number;
  brake: boolean;
  mode: "auto" | "manual";
  shift: number;
  source: "demo" | "gps";
  gpsSpeed: number | null;
}
export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const gearRatio = (config: Drivetrain, gear: number) =>
  config.gears <= 1
    ? 1
    : 3.9 - 3.18 * ((gear - 1) / (config.gears - 1)) ** 0.85;
export const wheelRpm = (speed: number, config: Drivetrain, gear: number) =>
  gear <= 0
    ? config.idleRpm
    : config.gears <= 1
      ? config.idleRpm +
        clamp(speed / (config.topSpeedMps??72), 0, 1) * (config.redline - config.idleRpm)
      : config.topSpeedMps ? speed/config.topSpeedMps*config.redline*gearRatio(config,gear)/gearRatio(config,config.gears) : (speed / 2.05) * 60 * gearRatio(config, gear) * config.finalDrive;
export function createSimulation(config: Drivetrain): Simulation {
  return {
    speedMps: 0,
    rpm: config.idleRpm,
    gear: 1,
    load: 0.08,
    accel: 0,
    distance: 0,
    shiftTime: 0,
    shifting: false,
    overrun: false,
  };
}
export function stepSimulation(
  state: Simulation,
  config: Drivetrain,
  elapsed: number,
  input: Controls,
): void {
  const dt = clamp(elapsed, 0, 0.05);
  const pedal = clamp(input.pedal, 0, 1);
  state.gear = clamp(state.gear, 0, config.gears);
  state.shiftTime = Math.max(0, state.shiftTime - dt);
  const shift = (direction: number) => {
    const next = clamp(state.gear + Math.sign(direction), 0, config.gears);
    // Reject destructive downshifts; neutral remains available for parked revving.
    if (
      state.shiftTime > 0 ||
      next === state.gear ||
      (next > 0 &&
        direction < 0 &&
        wheelRpm(state.speedMps, config, next) > config.redline)
    )
      return;
    state.gear = next;
    state.shiftTime = 0.18;
  };
  if (input.mode === "manual" && config.gears > 1 && input.shift)
    shift(input.shift);
  if (input.mode === "auto" && state.gear === 0) state.gear = 1;
  const previousSpeed = state.speedMps;
  if (input.source === "gps") {
    // GPS is measured speed, never a target that the pedal can override.
    const target = input.gpsSpeed === null ? 0 : clamp(input.gpsSpeed, 0, 100);
    const response = 1 - Math.exp(-dt / (input.gpsSpeed === null ? 1.2 : 0.45));
    state.speedMps += (target - state.speedMps) * response;
  } else {
    const drive =
      state.gear === 0
        ? 0
        : pedal * 5.8 * (0.55 + (1 - state.gear / config.gears) * 0.5);
    const drag =
      state.speedMps > 0
        ? 0.3 + 0.012 * state.speedMps + 0.0007 * state.speedMps ** 2
        : 0;
    const limiter = state.rpm >= config.redline * 0.985 ? 0.08 : 1;
    state.speedMps = clamp(
      state.speedMps + (drive * limiter - drag - (input.brake ? 8.5 : 0)) * dt,
      0,
      config.topSpeedMps??100,
    );
  }
  state.accel =
    dt > 0 ? clamp((state.speedMps - previousSpeed) / dt, -10, 8) : 0;
  if (state.speedMps < 0.005) state.speedMps = 0;
  state.distance += state.speedMps * dt;
  if (input.mode === "auto" && config.gears > 1 && !state.shiftTime) {
    const rpm = wheelRpm(state.speedMps, config, state.gear);
    if (
      rpm > config.shiftRpm &&
      state.gear < config.gears &&
      state.accel > -0.4
    )
      shift(1);
    else if (
      rpm < Math.max(config.idleRpm * 1.5, config.shiftRpm * 0.28) &&
      state.gear > 1
    )
      shift(-1);
  }
  const targetRpm =
    state.gear === 0
      ? config.idleRpm + pedal * (config.redline - config.idleRpm)
      : Math.max(
          config.idleRpm + (state.speedMps < 2 ? pedal * 1500 : 0),
          wheelRpm(state.speedMps, config, state.gear),
        );
  // live (GPS) drive: a held REV (pedal) free-revs over the measured feed, then eases back to it on release
  const revRpm = input.source === "gps" && pedal > 0 ? Math.max(targetRpm, config.idleRpm + pedal * 0.75 * (config.redline - config.idleRpm)) : targetRpm;
  state.rpm +=
    (clamp(revRpm, config.idleRpm, config.redline) - state.rpm) *
    (1 - Math.exp(-dt * 12));
  const load =
    input.source === "gps"
      ? Math.max(pedal, input.gpsSpeed === null ? 0 : clamp(0.12 + state.accel / 5, 0, 1))
      : input.brake
        ? 0
        : pedal;
  state.load += (load - state.load) * (1 - Math.exp(-dt * 8));
  state.shifting = state.shiftTime > 0;
  state.overrun =
    state.accel < -0.25 &&
    state.rpm > config.idleRpm * 1.6 &&
    state.load < 0.15;
}
