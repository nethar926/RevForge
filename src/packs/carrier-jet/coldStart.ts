/**
 * Carrier Jet cold start — host state machine (pure TS: no React / DOM / audio, so node tests import it).
 *
 * Inputs are Dan's panel list (getJetSystemList(variant)) and checklist (getJetChecklist(variant)), a snapshot of
 * the engine's switch state (getJetSystems / onJetSystemChange) and the host's own UI state (cover lifts, the switch
 * being held, Park). Output is the per-switch view Meghan's parts take (state / lit / disabled / disabledReason /
 * cue / step / legend), the annunciators, the current checklist line, and the next action for QUICK START.
 *
 * The audio layer is permissive (any order, never refuses); start order and the Park lockout live here:
 *  - `requires` (advisory in the audio list) gates switching ON. Switching OFF is always allowed in Park.
 *  - 'apu' / 'aircart' as a requirement means READY (spooled), an engine means RUN, 'crossbleed' means open with the
 *    right engine running (its bleed source), a guard means lifted.
 *  - Throttle 'requires engX' is met while that engine cranks (throttle to idle "when it turns") — or once the host
 *    has wired the throttle (Dan's light-off gate engages only after the first throttle call), in which case the
 *    engine start in turn waits for the throttle at IDLE, so a wired throttle at cutoff never deadlocks a start.
 *  - Outside Park everything is locked with 'Available in Park'.
 *
 * Sequence (step numbers on the switches, `next` cue on the next one):
 *  APU (default): POWER (batt, avionics, nav platform) → FUEL (L, R pumps) → APU ARM (cover) → APU START held to READY
 *    → L ENG (ign, guarded start held to RUN, idle) → R ENG (same) → APU off → SYSTEMS → LIGHTS → caution reset.
 *  GND AIR (Tomcat air cart): POWER → GND AIR (to ready) → R ENG (pump, ign, start, idle) → X-BLEED open → L ENG
 *    (pump, ign, start, idle) → X-BLEED closed, GND AIR off → SYSTEMS → LIGHTS → caution reset.
 */
import type { JetEnginePhase, JetStartMode, JetSystem, JetSystemEntry } from '../../audio/types.ts';

/** Host start mode (Meghan's CjStartMode). */
export type CsMode = 'apu' | 'gndAir';
export const csVariant = (m: CsMode): 'apu' | 'aircart' => (m === 'apu' ? 'apu' : 'aircart');
export const csEngineMode = (m: CsMode): JetStartMode => (m === 'apu' ? 'apu' : 'groundcart');

/** Never on the shelf (they live on the cold-start bank): Meghan's CJ_SHELF_BOTTOM_ROW_IDS. */
export const CS_BANK_IDS = ['quickStartGuard', 'quickStart', 'emergencyStop'] as const;
/** Host-local cover ids (not Dan systems). */
export type CsGuardId = 'apuGuard' | 'engL' | 'engR';
export const CS_GUARDED: readonly CsGuardId[] = ['engL', 'engR'];

/** Engraved short labels (≤ 7 characters a line); Dan's long labels become the VoiceOver name. */
export const CS_SHORT: Readonly<Record<string, string>> = {
  batt: 'BATT', seatbelt: 'SEAT BELT', avionics: 'AVION', inertialNav: 'INS', navLights: 'POS LT', anticollision: 'BEACON',
  apu: 'APU', aircart: 'GND AIR', crossbleed: 'X-BLEED', fuelPumpL: 'FUEL L', fuelPumpR: 'FUEL R', ignL: 'L IGN', ignR: 'R IGN',
  engL: 'L ENG', engR: 'R ENG', throttleL: 'L IDLE', throttleR: 'R IDLE', hydraulics: 'HYD', canopy: 'CANOPY', oxygen: 'OXY',
  masterCaution: 'CAUT RST', quickStartGuard: 'QUICK START', quickStart: 'START', emergencyStop: 'EMER STOP',
};

/** The slice of Dan's JetSystemsState the host reads. */
export interface CsSystems {
  /** Switch booleans by id (missing = off). */
  on: Partial<Record<string, boolean>>;
  engines: { L: JetEnginePhase; R: JetEnginePhase };
  apuSpool: number;
  apuReady: boolean;
  cartSpool: number;
  cartReady: boolean;
  /** Emergency stop pending (tone, then fuel cut). */
  emergency?: boolean;
}
export const CS_DARK: CsSystems = Object.freeze({ on: Object.freeze({}), engines: Object.freeze({ L: 'off', R: 'off' }), apuSpool: 0, apuReady: false, cartSpool: 0, cartReady: false }) as CsSystems;

export interface CsInput {
  list: readonly JetSystemEntry[];
  /** getJetChecklist(variant).startup */
  checklist?: readonly string[];
  mode: CsMode;
  sys: CsSystems;
  /** Cover lifted, by host id (apuGuard, engL, engR). */
  guards: Partial<Record<CsGuardId, boolean>>;
  /** Id currently held down (hold switch: apu START, engL, engR), else null. */
  held: string | null;
  park: boolean;
  /** Throttles the host has set at least once (Dan's light-off gate engages from then on). */
  wired?: Partial<Record<'throttleL' | 'throttleR', boolean>>;
  /** Caution reset pressed since the last dark cockpit (momentary: the engine keeps no state). */
  cautionReset?: boolean;
  /** QUICK START running. */
  auto?: boolean;
}

/** One numbered step. `id` is the switch it lives on; `on` the wanted position ('off' steps: APU off …). */
export interface CsStep {
  key: string;
  id: string;
  on: boolean;
  /** 'arm' = lift a cover (apuGuard); 'hold' = held to READY / RUN; 'press' = momentary; else a plain toggle. */
  act: 'toggle' | 'arm' | 'hold' | 'press';
  /** Checklist line matcher. */
  line: RegExp;
}

const LINE: Record<string, RegExp> = {
  batt: /battery on/i, seatbelt: /seat belt sign on/i, avionics: /avionics on/i, inertialNav: /nav platform on/i,
  navLights: /position lights/i, anticollision: /beacon/i, apu: /apu on/i, 'apu:off': /apu off/i, apuGuard: /apu on/i,
  aircart: /ground air on/i, 'aircart:off': /ground air off/i, crossbleed: /crossbleed open/i, 'crossbleed:off': /crossbleed closed/i,
  fuelPumpL: /left fuel pump/i, ignL: /left ignition/i, engL: /hold left engine start/i, throttleL: /left engine start, throttle/i,
  fuelPumpR: /right fuel pump/i, ignR: /right ignition/i, engR: /hold right engine start/i, throttleR: /right engine start, throttle/i,
  hydraulics: /hydraulics on/i, canopy: /canopy closed/i, oxygen: /oxygen on/i, masterCaution: /caution reset/i,
};
const step = (id: string, act: CsStep['act'] = 'toggle', on = true): CsStep => {
  const key = on ? id : `${id}:off`;
  return { key, id, on, act, line: LINE[key] ?? LINE[id] ?? /$^/ };
};

/** Group rank in the start order (user's order: power → fuel → APU → engines → systems → lights). */
function rank(e: JetSystemEntry, mode: CsMode): number {
  if (e.id === 'apu' || e.id === 'aircart') return mode === 'apu' ? 2 : 1;
  if (!e.required && e.group === 'SYSTEMS') return 5;
  if (!e.required && e.group === 'LIGHTS') return 6;
  if (e.group === 'POWER') return 0;
  if (mode === 'apu') return e.group === 'FUEL' ? 1 : 3;
  return 2; // GND AIR: Dan's order (R side, crossbleed, L side)
}

/** The numbered start sequence for a mode, from Dan's list. */
export function csSequence(list: readonly JetSystemEntry[], mode: CsMode): CsStep[] {
  const ids = new Set(list.map((e) => e.id as string));
  const block = mode === 'apu' ? 'apu' : 'aircart';
  const entries = list
    .filter((e) => !(CS_BANK_IDS as readonly string[]).includes(e.id) && e.kind !== 'pull' && e.kind !== 'guarded')
    .filter((e) => e.id !== 'masterCaution' && (e.id !== (mode === 'apu' ? 'aircart' : 'apu')))
    .slice()
    .sort((a, b) => rank(a, mode) - rank(b, mode) || a.order - b.order);
  const out: CsStep[] = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (mode === 'apu' && ids.has('apu')) out.push(step('apu', 'toggle', false));
    if (mode === 'gndAir') {
      if (ids.has('crossbleed')) out.push(step('crossbleed', 'toggle', false));
      if (ids.has('aircart')) out.push(step('aircart', 'toggle', false));
    }
  };
  for (const e of entries) {
    if (rank(e, mode) >= 5) cleanup();
    if (e.id === block && mode === 'apu') out.push(step('apuGuard', 'arm'));
    out.push(step(e.id, e.id === 'engL' || e.id === 'engR' || (e.id === 'apu' && mode === 'apu') ? 'hold' : 'toggle'));
  }
  cleanup();
  if (ids.has('masterCaution')) out.push(step('masterCaution', 'press'));
  return out;
}

const side = (id: string): 'L' | 'R' | null => (/L$/.test(id) ? 'L' : /R$/.test(id) ? 'R' : null);
const isOn = (s: CsSystems, id: string) => !!s.on[id];

/** A requirement is met (start order meaning, see the header). */
export function csMet(req: string, inp: CsInput, forId?: string): boolean {
  const s = inp.sys;
  if (req === 'apu') return isOn(s, 'apu') && s.apuReady;
  if (req === 'aircart') return isOn(s, 'aircart') && s.cartReady;
  if (req === 'engL' || req === 'engR') {
    const ph = s.engines[req === 'engL' ? 'L' : 'R'];
    if (forId && /^throttle/.test(forId)) return ph !== 'off' || !!inp.wired?.[forId as 'throttleL' | 'throttleR'];
    return ph === 'run';
  }
  if (req === 'crossbleed') return isOn(s, 'crossbleed') && s.engines.R === 'run';
  if (req === 'apuGuard') return !!inp.guards.apuGuard;
  return isOn(s, req);
}

const REQ_NAME: Record<string, string> = {
  apu: 'APU ready', aircart: 'Ground air ready', engL: 'L engine running', engR: 'R engine running', crossbleed: 'Crossbleed open', apuGuard: 'APU arm',
};
export const CS_PARK_REASON = 'Available in Park';

/** Why switching `id` ON is locked right now, or null when allowed. */
export function csLockReason(id: string, inp: CsInput): string | null {
  if (!inp.park) return CS_PARK_REASON;
  const e = inp.list.find((x) => x.id === id);
  const reqs = [...(e?.requires ?? [])];
  // Ground air: the engines take cart air (R) / crossbleed (L), never the APU, whatever the list says.
  if (id === 'apu') reqs.push('apuGuard');
  const sd = side(id);
  if ((id === 'engL' || id === 'engR') && sd && inp.wired?.[`throttle${sd}`] && !isOn(inp.sys, `throttle${sd}`)) reqs.push(`throttle${sd}`);
  for (const r of reqs) {
    if (!csMet(r, inp, id)) {
      const name = REQ_NAME[r] ?? inp.list.find((x) => x.id === r)?.label ?? r;
      return `${name} first`;
    }
  }
  return null;
}

/** Step done? */
export function csStepDone(st: CsStep, inp: CsInput): boolean {
  const s = inp.sys;
  if (st.act === 'arm') return !!inp.guards.apuGuard || isOn(s, 'apu');
  if (!st.on) return !isOn(s, st.id);
  if (st.act === 'press') return !!inp.cautionReset;
  if (st.id === 'apu') return isOn(s, 'apu') && s.apuReady;
  if (st.id === 'aircart') return isOn(s, 'aircart') && s.cartReady;
  if (st.id === 'engL' || st.id === 'engR') return s.engines[st.id === 'engL' ? 'L' : 'R'] === 'run';
  return isOn(s, st.id);
}

/**
 * Index of the first step not yet done (sequence length = complete). Steps are read from the live state, so
 * everything before the last engine that reached RUN counts as behind us (APU START is "undone" again once the APU
 * is switched off after the engines, and a cockpit that was already running starts past the engine steps).
 */
export function csCursor(seq: readonly CsStep[], inp: CsInput): number {
  let from = 0;
  seq.forEach((st, i) => {
    if (st.act === 'hold' && st.id !== 'apu' && csStepDone(st, inp)) from = i + 1;
  });
  // …except the engines themselves and the throttles (a running engine still wants its L / R IDLE switch thrown).
  for (let i = 0; i < seq.length; i++) {
    if (csStepDone(seq[i], inp)) continue;
    if (i < from && !/^(throttle|eng)/.test(seq[i].id)) continue;
    return i;
  }
  return seq.length;
}

export interface CsSwitchView {
  label: string;
  ariaLabel: string;
  state: 'off' | 'on' | 'momentary';
  lit: boolean;
  disabled?: boolean;
  disabledReason?: string;
  legend?: string;
  step?: number | string;
  cue?: 'next' | 'busy';
}
export interface CsAnnunciator { id: string; label: string; tone: 'off' | 'green' | 'amber' | 'white' | 'red' }
export interface CsView {
  seq: CsStep[];
  cursor: number;
  complete: boolean;
  /** Current step (null when complete). */
  next: CsStep | null;
  switches: Record<string, CsSwitchView>;
  apu: { arm: boolean; start: boolean; ready: 'off' | 'spooling' | 'ready'; disabled: boolean; disabledReason?: string; step?: string; cue?: 'next' | 'busy' };
  gndAir: { aircart: boolean; crossbleed: boolean; side: 'L' | 'R' | null; disabledReasons: Partial<Record<'aircart' | 'crossbleed', string>>; steps: Partial<Record<'aircart' | 'crossbleed', number | string>>; cues: Partial<Record<'aircart' | 'crossbleed', 'next'>> };
  annunciators: CsAnnunciator[];
  /** Checklist line for the current step (1-based index, text) or null. */
  checklist: { index: number; total: number; text: string } | null;
  /** Both engines running. */
  live: boolean;
}

/** Full view for the shelf. */
export function csView(inp: CsInput): CsView {
  const seq = csSequence(inp.list, inp.mode);
  const cursor = csCursor(seq, inp);
  const next = seq[cursor] ?? null;
  const s = inp.sys;
  const numbers: Record<string, number[]> = {};
  // every step's number on its control, off steps too (APU START 6·7·14, X-BLEED 9·14, GND AIR 4·15)
  seq.forEach((st, i) => {
    (numbers[st.id] ??= []).push(i + 1);
  });
  const switches: Record<string, CsSwitchView> = {};
  for (const e of inp.list) {
    const id = e.id as string;
    if ((CS_BANK_IDS as readonly string[]).includes(id)) continue;
    const on = isOn(s, id);
    const held = inp.held === id;
    const eng = id === 'engL' || id === 'engR' ? s.engines[id === 'engL' ? 'L' : 'R'] : null;
    const lock = on ? (inp.park ? null : CS_PARK_REASON) : csLockReason(id, inp);
    const v: CsSwitchView = {
      label: CS_SHORT[id] ?? e.label.toUpperCase(),
      ariaLabel: e.label,
      state: held ? 'momentary' : on ? 'on' : 'off',
      lit: on || held,
    };
    if (eng) {
      if (eng === 'starting') v.legend = 'CRANK';
      else if (eng === 'run') v.legend = 'RUN';
    }
    if (id === 'canopy') v.legend = on ? 'CLOSED' : 'OPEN';
    // PARK legend (Meghan's concept sheet, panel 1): a switch that still has its step ahead and is locked only because
    // the car isn't in Park. CRANK / RUN / CLOSED / OPEN keep priority; done switches keep ON / OFF.
    if (lock === CS_PARK_REASON && !held && !v.legend && seq.some((st, i) => i >= cursor && st.id === id && st.on && !csStepDone(st, inp))) v.legend = 'PARK';
    if (lock && !held) {
      v.disabled = true;
      v.disabledReason = lock;
    }
    if (numbers[id]) v.step = numbers[id].join('·');
    if (next && next.id === id) v.cue = held || eng === 'starting' ? 'busy' : 'next';
    else if (held || eng === 'starting') v.cue = 'busy';
    switches[id] = v;
  }
  // APU block: ARM (cover), START and the APU-off step all print on the START switch
  const apuStep = [...(numbers.apuGuard ?? []), ...(numbers.apu ?? [])].sort((a, b) => a - b).join('·');
  const apuLock = !inp.park ? CS_PARK_REASON : isOn(s, 'apu') ? null : csLockReason('batt', inp) ?? (isOn(s, 'batt') ? null : 'Battery first');
  const apuBusy = inp.held === 'apu' || (isOn(s, 'apu') && !s.apuReady);
  const apu: CsView['apu'] = {
    arm: !!inp.guards.apuGuard,
    start: isOn(s, 'apu') || inp.held === 'apu',
    ready: !isOn(s, 'apu') && !inp.held ? 'off' : s.apuReady ? 'ready' : 'spooling',
    disabled: !!apuLock,
    disabledReason: apuLock ?? undefined,
    step: apuStep || undefined,
    cue: next && (next.id === 'apu' || next.id === 'apuGuard') ? (apuBusy ? 'busy' : 'next') : apuBusy ? 'busy' : undefined,
  };
  const reasons: CsView['gndAir']['disabledReasons'] = {};
  for (const id of ['aircart', 'crossbleed'] as const) {
    const r = isOn(s, id) ? (inp.park ? null : CS_PARK_REASON) : csLockReason(id, inp);
    if (r) reasons[id] = r;
  }
  const steps: CsView['gndAir']['steps'] = {};
  if (numbers.aircart) steps.aircart = numbers.aircart.join('·');
  if (numbers.crossbleed) steps.crossbleed = numbers.crossbleed.join('·');
  // next cue for the GND AIR block's switches (on and off steps); drawn by the host (the skin block has no cue prop)
  const cues: CsView['gndAir']['cues'] = {};
  if (next && (next.id === 'aircart' || next.id === 'crossbleed')) cues[next.id] = 'next';
  const gndAir: CsView['gndAir'] = {
    aircart: isOn(s, 'aircart'),
    crossbleed: isOn(s, 'crossbleed'),
    side: isOn(s, 'aircart') && s.engines.R !== 'run' ? 'R' : isOn(s, 'crossbleed') && s.engines.R === 'run' && s.engines.L !== 'run' ? 'L' : null,
    disabledReasons: reasons,
    steps,
    cues,
  };
  const live = s.engines.L === 'run' && s.engines.R === 'run';
  const annunciators: CsAnnunciator[] = [
    inp.mode === 'apu'
      ? { id: 'apuReady', label: 'APU READY', tone: s.apuReady && isOn(s, 'apu') ? 'green' : isOn(s, 'apu') ? 'amber' : 'off' }
      : { id: 'cartReady', label: 'GND AIR', tone: s.cartReady && isOn(s, 'aircart') ? 'green' : isOn(s, 'aircart') ? 'amber' : 'off' },
    { id: 'seatbelt', label: 'SEAT BELT', tone: isOn(s, 'seatbelt') ? 'white' : 'off' },
    { id: 'gen', label: 'GEN', tone: s.engines.L === 'run' || s.engines.R === 'run' ? 'green' : 'off' },
    { id: 'live', label: 'BOARD LIVE', tone: live ? 'green' : 'off' },
  ];
  if (s.emergency) annunciators.push({ id: 'estop', label: 'EMER STOP', tone: 'red' });
  let checklist: CsView['checklist'] = null;
  const lines = inp.checklist ?? [];
  if (next && lines.length) {
    const i = lines.findIndex((l) => next.line.test(l));
    if (i >= 0) checklist = { index: i + 1, total: lines.length, text: lines[i] };
  }
  return { seq, cursor, complete: cursor >= seq.length, next, switches, apu, gndAir, annunciators, checklist, live };
}

/* ------------------------------------------------------------------ tap intents */

export type CsIntent =
  | { type: 'set'; system: JetSystem; on: boolean }
  | { type: 'guard'; id: CsGuardId; open: boolean }
  | { type: 'none'; reason: string };

/**
 * Tap on a plain switch (asked-for position). Hold switches (APU START, L/R ENG) ignore taps — they start from the
 * press handlers (csHoldStart) — except switching OFF, which a tap does.
 */
export function csTap(id: string, nextOn: boolean, inp: CsInput): CsIntent {
  if (!inp.park) return { type: 'none', reason: CS_PARK_REASON };
  if (!nextOn) return { type: 'set', system: id as JetSystem, on: false };
  const hold = id === 'engL' || id === 'engR' || (id === 'apu' && inp.mode === 'apu');
  const lock = csLockReason(id, inp);
  if (lock) return { type: 'none', reason: lock };
  if (hold) return { type: 'none', reason: 'Press and hold to start' };
  if (id === 'masterCaution') return { type: 'set', system: 'masterCaution', on: true };
  return { type: 'set', system: id as JetSystem, on: true };
}

/** Press on a hold switch: start cranking / spooling if allowed. */
export function csHoldStart(id: string, inp: CsInput): CsIntent {
  if (!inp.park) return { type: 'none', reason: CS_PARK_REASON };
  if (id !== 'engL' && id !== 'engR' && id !== 'apu') return { type: 'none', reason: 'Not a hold switch' };
  if (isOn(inp.sys, id)) return { type: 'none', reason: 'Already on' };
  if (id !== 'apu' && !inp.guards[id as CsGuardId]) return { type: 'none', reason: 'Lift the guard first' };
  const lock = csLockReason(id, inp);
  return lock ? { type: 'none', reason: lock } : { type: 'set', system: id as JetSystem, on: true };
}

/** Holding switch reached its goal (APU READY / engine RUN): release latches it on. */
export function csHoldReached(id: string, sys: CsSystems): boolean {
  if (id === 'apu') return isOn(sys, 'apu') && sys.apuReady;
  if (id === 'engL' || id === 'engR') return sys.engines[id === 'engL' ? 'L' : 'R'] === 'run';
  return true;
}

/** Released: latch when the goal was reached, else abort (switch back off). */
export function csHoldRelease(id: string, sys: CsSystems): CsIntent {
  return csHoldReached(id, sys) ? { type: 'none', reason: 'Latched' } : { type: 'set', system: id as JetSystem, on: false };
}

/* ------------------------------------------------------------------ QUICK START (auto sequence) */

export type CsAutoAction =
  | { type: 'guard'; id: CsGuardId; open: true }
  | { type: 'set'; system: JetSystem; on: boolean; hold?: boolean }
  | { type: 'wait'; for: string }
  | { type: 'done' };

/**
 * Next QUICK START action from the current state (call on a steady tick; one switch per tick with its real cue).
 * Hold steps: lift the cover, switch on (held, CRANK / spooling), wait for READY / RUN. Wired throttles at cutoff go
 * to IDLE before their engine start.
 */
export function csAutoNext(inp: CsInput): CsAutoAction {
  const v = csView({ ...inp, park: true });
  const st = v.next;
  if (!st) return { type: 'done' };
  const s = inp.sys;
  if (st.act === 'arm') return { type: 'guard', id: 'apuGuard', open: true };
  if (st.act === 'hold') {
    if (st.id !== 'apu' && !inp.guards[st.id as CsGuardId]) return { type: 'guard', id: st.id as CsGuardId, open: true };
    const sd = side(st.id);
    if (sd && inp.wired?.[`throttle${sd}`] && !isOn(s, `throttle${sd}`)) return { type: 'set', system: `throttle${sd}` as JetSystem, on: true };
    if (!isOn(s, st.id)) {
      const lock = csLockReason(st.id, { ...inp, park: true });
      return lock ? { type: 'wait', for: lock } : { type: 'set', system: st.id as JetSystem, on: true, hold: true };
    }
    return { type: 'wait', for: st.id === 'apu' ? 'APU ready' : `${st.id === 'engL' ? 'L' : 'R'} engine running` };
  }
  if (!st.on) return { type: 'set', system: st.id as JetSystem, on: false };
  if (st.act === 'press') return { type: 'set', system: st.id as JetSystem, on: true };
  if (isOn(s, st.id)) return { type: 'wait', for: st.id === 'aircart' ? 'Ground air ready' : st.id };
  const lock = csLockReason(st.id, { ...inp, park: true });
  return lock ? { type: 'wait', for: lock } : { type: 'set', system: st.id as JetSystem, on: true };
}

/* ------------------------------------------------------------------ Park */

/**
 * Park from the HUD speed the mount already gets (PackHudProps.speed, demo or GPS): Park once the speed has stayed
 * ≤ PARK_ENTER for PARK_DWELL_MS; out of Park as soon as it passes PARK_LEAVE. Pure (feed it every render / tick).
 */
export const PARK_ENTER = 0.5;
export const PARK_LEAVE = 2;
export const PARK_DWELL_MS = 1500;
export interface ParkState { park: boolean; stillSince: number | null }
export function parkStep(prev: ParkState, speed: number, now: number): ParkState {
  const v = Number.isFinite(speed) ? Math.abs(speed) : 0;
  if (v > PARK_LEAVE) return { park: false, stillSince: null };
  if (v > PARK_ENTER) return prev.park ? { park: true, stillSince: prev.stillSince } : { park: false, stillSince: null };
  const since = prev.stillSince ?? now;
  return { park: prev.park || now - since >= PARK_DWELL_MS, stillSince: since };
}

/* ------------------------------------------------------------------ shelf discoverability (Tesla) */

/**
 * Auto-open the cold-start shelf once per Park entry while the engines are not live (Tesla board / window only;
 * phones keep their auto quick start). `armed` re-arms whenever we are out of Park, the board is live or cold start is
 * off, so a manual close stays closed until the next Park entry (or the next dark cockpit). `auto` = Options › AUTO
 * SHELF (default on). Returns the next armed flag and whether to open now. Tucking away (leave Park / live) is the
 * shelf's existing close rule.
 */
export function shelfAutoStep(armed: boolean, s: { park: boolean; live: boolean; on: boolean; auto: boolean; tesla: boolean }): { armed: boolean; open: boolean } {
  if (!s.park || s.live || !s.on) return { armed: true, open: false };
  if (armed && s.auto && s.tesla) return { armed: false, open: true };
  return { armed, open: false };
}
/**
 * Shelf auto-close (Wilson: the shelf is reachable at all times). Edge-triggered only, never repeatedly:
 *  - once on the shift into Drive (Park → not Park), even with steps left;
 *  - once on completing the sequence in Park;
 *  - or when there's no cold start to show.
 * SHELF reopens it afterwards and it stays open (while driving too, incl. a drive-away auto-finish completing) until
 * the user closes it.
 */
export function shelfAutoClose(prev: { park: boolean; complete: boolean }, cur: { park: boolean; complete: boolean; on: boolean }): boolean {
  if (!cur.on) return true;
  if (prev.park && !cur.park) return true;
  return cur.park && cur.complete && !prev.complete;
}
/** SHELF key: always toggles, Park or Drive, before or after the start. */
export const shelfToggle = (s: 'closed' | 'opening' | 'open'): 'closed' | 'opening' => (s === 'closed' ? 'opening' : 'closed');
/** The SHELF key's backlit amber START legend: until the first successful start (prefs.cjFirstStartDone). */
export const shelfStartLit = (s: { on: boolean; firstStartDone: boolean }) => s.on && !s.firstStartDone;
export const SHELF_START_ARIA = 'Shelf, start engines here';

/* ------------------------------------------------------------------ snapshot */

/** Dan's JetSystemsState (or undefined) → CsSystems. */
export function csFromJet(st: unknown): CsSystems {
  if (!st || typeof st !== 'object') return CS_DARK;
  const o = st as Record<string, unknown>;
  const on: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'boolean') on[k] = v;
  const en = (o.engines ?? {}) as { L?: JetEnginePhase; R?: JetEnginePhase };
  return {
    on,
    engines: { L: en.L ?? 'off', R: en.R ?? 'off' },
    apuSpool: Number(o.apuSpool) || 0,
    apuReady: !!o.apuReady,
    cartSpool: Number(o.cartSpool) || 0,
    cartReady: !!o.cartReady,
    emergency: !!o.emergency,
  };
}

/* ------------------------------------------------------------------ GPS plate */

/** App GPS status (hooks/useGeolocation GpsStatus) → Meghan's plate state. Demo / GPS off = 'none'. */
export function csGps(status: string): 'none' | 'acq' | 'live' | 'fail' {
  if (status === 'live') return 'live';
  if (status === 'requesting' || status === 'waiting' || status === 'stale') return 'acq';
  if (status === 'denied' || status === 'unavailable' || status === 'error') return 'fail';
  return 'none';
}
