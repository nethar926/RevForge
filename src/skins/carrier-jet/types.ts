/*
 * Carrier Jet cold-start hardware: prop interfaces for the presentational parts in ./parts/.
 * Every part is stateless: props in, intents out. The host (frontend) owns every state machine, timer and
 * gesture. Ids are Dan's system ids from `getJetSystemList()` (audio/cj-cold-start @ 65a210c).
 * Reduce Motion is CSS only: `@media (prefers-reduced-motion: reduce)` or any `[data-rf-reduce-motion]` ancestor.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ------------------------------------------------------------------ system list (from the audio layer) */

/** Shelf group, in panel order. Same strings as `JetSystemEntry['group']`. */
export type CjSystemGroup = 'POWER' | 'FUEL' | 'ENGINES' | 'SYSTEMS' | 'LIGHTS';

/**
 * One entry of `getJetSystemList(variant)`. Structurally the same as the audio layer's `JetSystemEntry`
 * (`id` there is the `JetSystem` union), so the list can be passed straight in. Only `id`, `label`, `group`,
 * `side`, `order`, `kind` and `required` are read here.
 */
export interface CjSystemEntry {
  /** Dan's system id, e.g. 'batt', 'apu', 'engL'. Every intent reports this id. */
  id: string;
  /** Neutral panel label from the audio layer ("L engine start"). Used only when the host gives no `label`. */
  label: string;
  /** Shelf group the switch is drawn in. */
  group: CjSystemGroup;
  /** 'toggle' | 'guarded' | 'hold' | 'pull' (advisory: the host decides the gesture). */
  kind: 'toggle' | 'guarded' | 'hold' | 'pull';
  /** Engine side. Within a group the shelf keeps physical order: unsided, then L, then R. */
  side?: 'L' | 'R';
  /** 1-based startup order for this variant. Shown as the amber step number when `required`. */
  order: number;
  /** Part of the minimum start; only these show a step number. */
  required?: boolean;
  /** Advisory only; not read by the parts. */
  requires?: readonly string[];
}

/* ------------------------------------------------------------------ toggle */

/** Lever position. 'momentary' = spring-loaded and currently held (lever up, amber HOLD). */
export type CjToggleState = 'off' | 'on' | 'momentary';

/**
 * Pointer / key handlers passed straight to a part's `<button>` (for hold-to-start switches). No `onClick`:
 * taps arrive through the part's own intent callback.
 */
export type CjPressHandlers = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave' | 'onKeyDown' | 'onKeyUp' | 'onContextMenu'
>;

/** Bat-handle toggle (shelf switch). Fixed viewBox 60×96; never smaller than `TOGGLE_MIN`. */
export interface CjToggleProps {
  /** Dan's system id; echoed back in `onToggle`. */
  id: string;
  /** Engraved label above the lever, e.g. 'BATT', 'L ENG'. Up to 2 lines of ~7 characters; split on spaces. */
  label: string;
  /** Lever position: 'off' = down, 'on' = up, 'momentary' = up and held (amber). */
  state: CjToggleState;
  /** Backlight: lit lamp + glowing legend (green when on, amber when momentary). Off = smoked lamp, plain legend. */
  lit: boolean;
  /**
   * Locked out. Still drawn at full size (dimmed lever, lock + its normal legend unlit), still focusable, announced as
   * dimmed (`aria-disabled`). `onToggle` is not called.
   */
  disabled?: boolean;
  /** Why it is locked ("Battery first"). Becomes the button's accessible description (aria-describedby). */
  disabledReason?: string;
  /** Full VoiceOver name, e.g. "Battery". State is announced by role="switch" + aria-checked. */
  ariaLabel: string;
  /**
   * Tap intent with the position the user asked for: 'on' from 'off', 'off' from 'on' or 'momentary'.
   * The host decides whether to accept it.
   */
  onToggle: (id: string, next: CjToggleState) => void;
  /** Throw legend under the lever. Default: OFF / ON / HOLD (same text, unlit, when disabled). E.g. 'AUTO', 'RUN', 'CRANK'. */
  legend?: string;
  /** Amber step number at the top right (e.g. 1, '2·3'). The shelf fills it from `order` for required entries. */
  step?: number | string;
  /** Step cue ring: 'next' = green edge (the next switch to throw), 'busy' = amber edge (in progress). Static. */
  cue?: 'next' | 'busy';
  /** Optional hold gesture handlers (engine start, APU start). */
  pressHandlers?: CjPressHandlers;
}

/* ------------------------------------------------------------------ guarded cover */

/** Stripe paint for a guard: red/yellow (AB, QUICK START, L/R ENG, APU) or yellow/black (PULL surround). */
export type CjGuardStripe = 'red-yellow' | 'yellow-black';

/**
 * Spring-loaded hinged cover over a switch (L/R ENG, QUICK START, APU). A 44-unit hinge band sits above the
 * child. Closed: the cover is one button over band + child and the child is `inert`. Open: the cover is the
 * band only (folded-up underside strip) and the child is live. The host owns `guardOpen`.
 */
export interface CjGuardedCoverProps {
  /** Id echoed in `onGuardToggle` (e.g. 'quickStartGuard', or the guarded switch id 'engL'). */
  id: string;
  /** Cover lifted (true) or down (false). */
  guardOpen: boolean;
  /** Tap on the cover (closed → lift) or on the folded strip (open → close). */
  onGuardToggle: (id: string) => void;
  /** The guarded control, normally a `BatToggle` or the QUICK START key. */
  children: ReactNode;
  /** Short name for the default aria label: "<name> guard, closed" / "<name> guard, open". */
  name: string;
  /** Override the full aria label of the cover button. */
  ariaLabel?: string;
  /** Default 'red-yellow' (the sheet's striped guards). */
  stripe?: CjGuardStripe;
  /** Locked: cover drawn dull with a lock tab, `aria-disabled`, `onGuardToggle` not called. */
  disabled?: boolean;
  /** Why it is locked; accessible description of the cover. */
  disabledReason?: string;
  /** Child viewBox width in units (default 60 = a toggle). The band and stripes scale with it. */
  childWidth?: number;
  /** Child viewBox height in units (default 96 = a toggle). */
  childHeight?: number;
}

/* ------------------------------------------------------------------ start blocks */

/** APU READY lamp: dark, amber steady while spooling, green steady when ready. Never flashes. */
export type CjApuReady = 'off' | 'spooling' | 'ready';

/**
 * Option A (APU) start block, 128×140: guarded START switch (lift the cover = ARM) + APU READY lamp.
 * Ids default to Dan's 'apu'.
 */
export interface CjApuBlockProps {
  /** Cover lifted = ARM. */
  arm: boolean;
  /** START lever up. */
  start: boolean;
  /** READY lamp. */
  ready: CjApuReady;
  /** Cover tap → host flips `arm`. Called with `guardId`. */
  onArmToggle: (id: string) => void;
  /** START tap with the asked-for position. Called with `id`. */
  onStartToggle: (id: string, next: CjToggleState) => void;
  /** System id for START (default 'apu'). */
  id?: string;
  /** Id for the cover (default 'apuGuard'; not a Dan system, host-local). */
  guardId?: string;
  /** Hold-to-start handlers on the START lever. */
  startPressHandlers?: CjPressHandlers;
  /** Locked (e.g. before BATT). Full size, dimmed, aria-disabled. */
  disabled?: boolean;
  /** Accessible description while locked. */
  disabledReason?: string;
  /** Step number on the START switch (sheet: '2·3'). */
  step?: number | string;
  /**
   * Throw legend on the START switch in place of START / OFF, e.g. 'PARK' while the APU is locked in Drive.
   * Upper-cased. With `disabled`: lock + legend unlit grey (the shelf's locked style). Omit / '' → START / OFF.
   */
  legend?: string;
}

/** Engine fed by start air / crossbleed: lights the L or R side lamp of X-BLEED. */
export type CjAirSide = 'L' | 'R' | null;

/**
 * Option B (ground air) block, 140×96: GND AIR toggle + X-BLEED toggle with L / R side lamps.
 * Ids are Dan's 'aircart' and 'crossbleed'.
 */
export interface CjGndAirBlockProps {
  /** Air cart connected / blowing (GND AIR lever up, CART). */
  aircart: boolean;
  /** Crossbleed valve open (X-BLEED lever up, OPEN). */
  crossbleed: boolean;
  /** Side receiving start air; that side lamp lights green. null = both dark. */
  side: CjAirSide;
  /** Tap on either switch, with Dan's id ('aircart' | 'crossbleed') and the asked-for position. */
  onToggle: (id: 'aircart' | 'crossbleed', next: CjToggleState) => void;
  /** Lock reasons per switch; a present key locks that switch (full size, aria-disabled, description). */
  disabledReasons?: Partial<Record<'aircart' | 'crossbleed', string>>;
  /** Step numbers (Option B: GND AIR 2, X-BLEED shows on L ENG). */
  steps?: Partial<Record<'aircart' | 'crossbleed', number | string>>;
}

/* ------------------------------------------------------------------ shelf */

export type CjShelfOpen = 'closed' | 'opening' | 'open';
export type CjStartMode = 'apu' | 'gndAir';

/** Per-switch view state for the shelf, keyed by system id. Label / aria default to the entry's label. */
export type CjShelfSwitch = Omit<CjToggleProps, 'id' | 'onToggle' | 'label' | 'ariaLabel'> & {
  label?: string;
  ariaLabel?: string;
};

/** Annunciator push-light in the shelf header. */
export interface CjAnnunciator {
  id: string;
  /** 11px+ legend, e.g. 'APU READY'. */
  label: string;
  /** 'off' = smoked, else lit steady in that colour. */
  tone: 'off' | 'green' | 'amber' | 'white' | 'red';
}

/**
 * Park-only switch shelf. Fills its box (designed for 1248×641 at 1280 and 757×376 at 773) and lays the
 * groups out in two rows (POWER · FUEL · LIGHTS over ENGINES · SYSTEMS). Renders from the host's `systems`
 * list; no switch list is hard-coded.
 */
export interface CjSwitchShelfProps {
  /** `getJetSystemList(variant)` (or any list of the same shape), in Dan's order. */
  systems: readonly CjSystemEntry[];
  /** View state per id. Missing ids render 'off', unlit. */
  switches: Readonly<Record<string, CjShelfSwitch>>;
  /** Tap on any plain switch: system id + asked-for position. */
  onToggle: (id: string, next: CjToggleState) => void;
  /** Guarded switches: id → cover open. Ids listed here are drawn under a striped cover (Scott: engL, engR). */
  guards?: Readonly<Record<string, boolean>>;
  /** Cover tap for an id in `guards`. */
  onGuardToggle?: (id: string) => void;
  /** Start mode: which ids the `block` replaces ('apu' → apu; 'gndAir' → aircart + crossbleed). */
  mode: CjStartMode;
  /** The host-picked `ApuBlock` / `GndAirBlock`, drawn where the replaced ids sit. Omit → plain toggles. */
  block?: ReactNode;
  /** 'closed' (hidden, inert) · 'opening' (300ms slide up; instant under Reduce Motion) · 'open'. */
  open: CjShelfOpen;
  /** Header push-lights (APU READY, SEAT BELT, GEN, BOARD LIVE …). */
  annunciators?: readonly CjAnnunciator[];
  /** Ids never drawn on the shelf. Default `CJ_SHELF_BOTTOM_ROW_IDS` (QUICK START, its cover, EMER STOP). */
  exclude?: readonly string[];
  /** Show amber step numbers from `order` on required entries (default true). Per-switch `step` wins. */
  showSteps?: boolean;
  /** Region label (default "Switch shelf"). */
  ariaLabel?: string;
}

/* ------------------------------------------------------------------ bottom bank */

/** PULL handle phase. 'pulling' uses `progress`; 'fired' latches at STOPPED. */
export type CjPullPhase = 'rest' | 'pulling' | 'fired';

/**
 * EMER STOP T-handle. Purely visual: no onClick, no gesture. Forward a ref to the grip `<button>` (64×44 hit,
 * moves with the handle) and attach the pointer gesture + VoiceOver action there.
 */
export interface CjPullHandleProps {
  phase: CjPullPhase;
  /** 0..1 of the 40-unit travel (only read while 'pulling'). Clamped. */
  progress: number;
  /** 'wide' 76×118 (1280) or 'narrow' 66×118 (773, legend EMER). Default 'wide'. */
  size?: 'wide' | 'narrow';
  /** Grip aria label (default "Emergency stop"). */
  ariaLabel?: string;
  /** Grip accessible description (default "Pull the handle down to stop the engines"). */
  ariaDescription?: string;
  /** Extra attributes for the grip button (pointer handlers, aria-*). `onClick` is not accepted. */
  gripProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'>;
}

/** QUICK START: striped guard over the START push-light. 118×118 ('narrow' 96×118). */
/**
 * Guarded SHUTDOWN toggle (bottom row): a flip-up striped cover over a bat-handle toggle, AB-guard API.
 * 108.67×48 CSS px (the Shutdown plate's footprint). Stores nothing; the host flips every value.
 */
export interface CjShutdownGuardProps {
  /** Cover lifted (true) or down (false). Default false: closed. The host keeps it closed on load. */
  guardOpen?: boolean;
  /** Tap on the cover (closed → lift) or on the folded strip (open → close). Escape on the switch also calls it. */
  onGuardToggle: () => void;
  /** Switch position: true = lever up, RUN (engine running); false = lever down, OFF. */
  on: boolean;
  /** Switch tap (only while the cover is up and not disabled). The host decides what it does (shutdown / restart). */
  onToggle: () => void;
  /** Whole part unavailable (e.g. engine starting): cover and switch aria-disabled, stripes dull, legends unlit. */
  disabled?: boolean;
  /** Why it is unavailable; accessible description of both buttons while disabled. */
  disabledReason?: string;
  /** Force the static swap (the app's own Reduce Motion pref). The OS setting and any [data-rf-reduce-motion] ancestor already do it. */
  reduceMotion?: boolean;
  /** Default 'red-yellow' (same paint as the AB guard). */
  stripe?: CjGuardStripe;
}

export interface CjQuickStartGuardProps {
  guardOpen: boolean;
  /** Cover tap. Called with `guardId`. */
  onGuardToggle: (id: string) => void;
  /** START push-light tap (only reachable while open). Called with `id`. */
  onStart: (id: string) => void;
  /** Sequence running: key lit green RUNNING. */
  running: boolean;
  /** Dan's ids (defaults 'quickStart' / 'quickStartGuard'). */
  id?: string;
  guardId?: string;
  /** Hold handlers for the START key, if the host wants press-and-hold. */
  startPressHandlers?: CjPressHandlers;
  /** Locked (moving lockout): full size, dull guard with a lock, aria-disabled. */
  disabled?: boolean;
  disabledReason?: string;
  size?: 'wide' | 'narrow';
}

/** GPS state: none = off/disabled, acq = searching, live, fail = unavailable. */
export type CjGps = 'none' | 'acq' | 'live' | 'fail';

/** Two stacked bulbs (red top, green bottom) + permanent ACQ legend. 50×118 ('narrow' 44×118). Status only. */
export interface CjGpsPlateProps {
  gps: CjGps;
  size?: 'wide' | 'narrow';
  /** Draw without its own metal plate (inside `GpsRadarPlate`). */
  bare?: boolean;
}

/** RADAR bat toggle, engraved RADAR, ON up / OFF down. 56×118 ('narrow' 44×118). */
export interface CjRadarToggleProps {
  on: boolean;
  /** Tap intent with the asked-for value (!on). */
  onToggle: (next: boolean) => void;
  size?: 'wide' | 'narrow';
  bare?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

/** GPS + RADAR on one shared plate: 'wide' 107×118 (1280), 'narrow' 89×118 (773). */
export interface CjGpsRadarPlateProps {
  gps: CjGps;
  radarOn: boolean;
  onRadarToggle: (next: boolean) => void;
  size?: 'wide' | 'narrow';
}

/** MFD edge key: blank machined cap under a printed legend slot. 52×66, key 44×44. */
export interface CjBezelKeyProps {
  /** Legend printed on the CRT edge above the key. Empty / undefined = inert: darker cap, disabled, aria-hidden. */
  legend?: string;
  /** Legend boxed (current choice). */
  active: boolean;
  /** Press intent. Not attached while inert. */
  onPress?: () => void;
  /** VoiceOver name (default = legend). */
  ariaLabel?: string;
}
