/**
 * Pack CONFIG (SPDS-style) — ONE table-driven system for every theme (framework; pure, node-testable).
 * Built to Meghan's settings map (drivesynth-skins/carrier-jet/config-map/MAP.md, pending Wilson's OK), item by item.
 * A theme supplies only a PackConfigSpec: its ROLE tab (PILOT jets · CAPTAIN Stellar Helm · default DRIVER), its
 * looks (alt skins; the LOOK group appears only with more than one), and optional extras per page/group.
 *
 * Root: RTN · ROLE · TLM · SND · MAP · OPT. K1 = RTN on every page (SPEED cell); tiles are also tapped directly.
 *   ROLE  VEHICLE (OPAC · BRT⚑ · SCAN⚑ · BEZEL⚑ · SCALE⚑ · FONTS P⚑ · COLORS P⚑) + DYNAMICS (TOP SPD · IDLE LO ·
 *         IDLE HI · JITTER · JIT % · MEDIA — all P)
 *   TLM   LOOK (the theme's looks) · UNITS (SPEED · DIST⚑ · TEMP⚑ · PRESS⚑) · READOUT (DENSITY⚑)
 *   SND   PACK ▸ P · AUDIO (MUTE · VOL = SYS read-only · SW SND · BKGND) · ALERTS (CALLS · HI-SPD · AB UNARM — REQ)
 *   MAP   GPS P · FIX + RETRY · COMPASS (phones) · RADAR · STYLE · RNG · MODE · (i) MAP CREDIT (REQ)
 *   OPT   ENGINE STARTUP P (APU / STANDARD) · MOTION (REQ) · ALERTS ▸ · TIP · DIAG ▸ P · ABOUT · RESET ▸ P
 * ⚑ = KEEP, FLAGGED (Meghan's map). P = Park only: disabled with PARK_REASON while moving. View changes are live.
 * Nothing is dead: every tile does something or says why not (disabledReason).
 */
import type { CjNavAction } from './carrier-jet.nav.ts';
import type { CjPrefs } from './carrier-jet/cjPrefs.ts';
import { applyMapKey, stepRange, type MapView } from './carrier-jet/mapView.ts';
import type { PackShellUi } from './runtime.ts';

export const DEFAULT_ROLE = 'DRIVER';
export type PageId = 'home' | 'role' | 'telemetry' | 'sound' | 'map' | 'options';

export interface ConfigCtx {
  park: boolean;
  muted: boolean;
  look: string;
  map: MapView;
  prefs: CjPrefs;
  /** Drive settings from the shell (undefined off Drive, e.g. Theme Lab previews). */
  ui?: PackShellUi;
  /** iOS compass permission flow exists here (phones). */
  compass?: { available: boolean; state: string };
}
export type ConfigEffect =
  | { type: 'page'; page: PageId }
  | { type: 'rtn' }
  | { type: 'nav'; action: CjNavAction }
  | { type: 'ui'; partial: Partial<PackShellUi> }
  | { type: 'mute' }
  | { type: 'prefs'; partial: Partial<CjPrefs> }
  | { type: 'map'; next: MapView }
  | { type: 'look'; id: string }
  | { type: 'retry-gps' }
  | { type: 'compass' }
  | { type: 'info'; text: string };

export interface ConfigItem {
  id: string;
  /** Tile legend (caps). */
  label: string;
  group?: string;
  value?: (c: ConfigCtx) => string;
  /** Always shown beside the item (e.g. OBEY SPEED LIMITS). */
  note?: string;
  aria?: (c: ConfigCtx) => string;
  parkOnly?: boolean;
  on?: (c: ConfigCtx) => boolean;
  /** Needs the Drive shell's settings. */
  needsUi?: boolean;
  /** Read-only tile: always this reason (e.g. VOL follows the system volume). */
  readOnly?: string;
  /** Present only when true. */
  when?: (c: ConfigCtx) => boolean;
  /** Meghan's ⚑ KEEP, FLAGGED note, or a stub note (listed in the handoff). */
  flag?: string;
  effect?: (c: ConfigCtx) => ConfigEffect;
}
export interface ConfigPage { id: PageId; title: string; items: ConfigItem[] }

export interface PackLook { id: string; label: string }
export interface PackConfigSpec {
  /** ROLE tab label; default DRIVER. */
  role?: string;
  /** Short legend for the role tab (PLT / CPT / DRV); default first three letters. */
  roleShort?: string;
  looks: readonly PackLook[];
  extras?: Partial<Record<Exclude<PageId, 'home'>, ConfigItem[]>>;
}

export const PARK_REASON = 'Park to change';
export const DRIVE_REASON = 'Available on Drive';
export const MAP_CREDIT = '© OpenStreetMap contributors · Tiles: OpenFreeMap';
export const ABOUT_TEXT = 'RevForge · Carrier Jet preview. Fonts: B612, Barlow, VT323, Oswald (SIL OFL 1.1). Map: ' + MAP_CREDIT;
export const RTN: ConfigItem = { id: 'rtn', label: 'RTN', aria: () => 'Return', effect: () => ({ type: 'rtn' }) };

const cycle = <T,>(all: readonly T[], v: T): T => all[(Math.max(0, all.indexOf(v)) + 1) % all.length];
/** Cycle a 0..1-ish knob through stops (next stop above the current value, wrapping). */
const knob = (stops: readonly number[], v: number) => stops.find((s) => s > v + 0.001) ?? stops[0];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const onOff = (b: boolean) => (b ? 'ON' : 'OFF');
const UP = (s: string) => s.toUpperCase();
const nav = (action: CjNavAction) => (): ConfigEffect => ({ type: 'nav', action });
const OPTIONS_PANEL = nav({ type: 'panel', panel: 'tune' });
const CUSTOMIZE = nav({ type: 'route', to: '/customize' });

export const roleLabel = (spec: Pick<PackConfigSpec, 'role'>) => (spec.role ?? DEFAULT_ROLE).toUpperCase();
export const roleShort = (spec: Pick<PackConfigSpec, 'role' | 'roleShort'>) => (spec.roleShort ?? roleLabel(spec).slice(0, 3)).toUpperCase();

/** The REQUIRED set every theme carries (Meghan's map: REQ). Ids are checked by tests. */
export const REQUIRED_IDS = ['calls', 'hiSpd', 'abUnarm', 'mapCredit', 'motion'] as const;

export function buildConfig(spec: PackConfigSpec): Record<PageId, ConfigPage> {
  const role = roleLabel(spec);
  const ex = spec.extras ?? {};
  const tab = (page: Exclude<PageId, 'home'>, label: string, name: string): ConfigItem => ({
    id: `tab-${page}`, label, value: () => name, aria: () => `${name} page`, effect: () => ({ type: 'page', page }),
  });
  const alerts: ConfigItem[] = [
    {
      id: 'calls', group: 'ALERTS', label: 'CALLS', value: (c) => UP(c.prefs.calloutMode), note: 'Voice falls back to TTS, then tone',
      aria: (c) => `Callouts, ${c.prefs.calloutMode}. Voice falls back to text to speech, then tone`, flag: 'NEW: stored + guarded engine call (setJetPrefs); no callout code at 51beec9',
      effect: (c) => ({ type: 'prefs', partial: { calloutMode: cycle(['voice', 'tone', 'off'] as const, c.prefs.calloutMode) } }),
    },
    {
      id: 'hiSpd', group: 'ALERTS', label: 'HI-SPD', value: (c) => onOff(c.prefs.highSpeedCallouts), note: 'OBEY SPEED LIMITS', on: (c) => c.prefs.highSpeedCallouts,
      aria: (c) => `High-speed callouts, ${c.prefs.highSpeedCallouts ? 'on' : 'off'}. Obey speed limits`, flag: 'NEW: stored + guarded engine call',
      effect: (c) => ({ type: 'prefs', partial: { highSpeedCallouts: !c.prefs.highSpeedCallouts } }),
    },
    {
      id: 'abUnarm', group: 'ALERTS', label: 'AB UNARM', value: (c) => UP(c.prefs.abUnarmedCall), aria: (c) => `AB unarmed call, ${c.prefs.abUnarmedCall}`,
      flag: 'NEW: stored + guarded engine call', effect: (c) => ({ type: 'prefs', partial: { abUnarmedCall: cycle(['silent', 'tone', 'voice'] as const, c.prefs.abUnarmedCall) } }),
    },
  ];
  const looks: ConfigItem[] = spec.looks.length > 1
    ? spec.looks.map((l) => ({
      id: `look-${l.id}`, group: 'LOOK', label: l.label, value: (c: ConfigCtx) => (c.look === l.id ? 'SELECTED' : 'LOOK'), on: (c: ConfigCtx) => c.look === l.id,
      aria: (c: ConfigCtx) => `${l.label} look${c.look === l.id ? ', selected' : ''}`, effect: (): ConfigEffect => ({ type: 'look', id: l.id }),
    }))
    : [];
  return {
    home: {
      id: 'home', title: 'CONFIG',
      items: [RTN, tab('role', roleShort(spec), role), tab('telemetry', 'TLM', 'Telemetry UI'), tab('sound', 'SND', 'Sound'), tab('map', 'MAP', 'Map'), tab('options', 'OPT', 'Options')],
    },
    role: {
      id: 'role', title: role,
      items: [
        RTN,
        { id: 'opac', group: 'VEHICLE', label: 'OPAC', needsUi: true, value: (c) => pct(c.ui!.hudOpacity), aria: (c) => `HUD opacity ${pct(c.ui!.hudOpacity)}`, effect: (c) => ({ type: 'ui', partial: { hudOpacity: knob([0.25, 0.5, 0.75, 1], c.ui!.hudOpacity) } }) },
        { id: 'brt', group: 'VEHICLE', label: 'BRT', needsUi: true, flag: 'bloomGlow: written, read only by applyAppearanceCss vars — unverified on CJ', value: (c) => pct(c.ui!.bloomGlow), aria: (c) => `Glow ${pct(c.ui!.bloomGlow)}`, effect: (c) => ({ type: 'ui', partial: { bloomGlow: knob([0, 0.5, 1], c.ui!.bloomGlow) } }) },
        { id: 'scan', group: 'VEHICLE', label: 'SCAN', needsUi: true, flag: 'scanlineStrength: unverified on CJ', value: (c) => pct(c.ui!.scanlineStrength), aria: (c) => `Scanlines ${pct(c.ui!.scanlineStrength)}`, effect: (c) => ({ type: 'ui', partial: { scanlineStrength: knob([0, 0.5, 1], c.ui!.scanlineStrength) } }) },
        { id: 'bezel', group: 'VEHICLE', label: 'BEZEL', needsUi: true, flag: 'hudBezel: unverified on CJ', value: (c) => pct(c.ui!.hudBezel), aria: (c) => `Bezel ${pct(c.ui!.hudBezel)}`, effect: (c) => ({ type: 'ui', partial: { hudBezel: knob([0, 0.5, 1], c.ui!.hudBezel) } }) },
        { id: 'scale', group: 'VEHICLE', label: 'SCALE', needsUi: true, flag: 'CJ board reflows without scale(); may do nothing on CJ', value: (c) => pct(c.ui!.hudScale), aria: (c) => `Dashboard scale ${pct(c.ui!.hudScale)}`, effect: (c) => ({ type: 'ui', partial: { hudScale: knob([0.65, 0.85, 1, 1.15, 1.35], c.ui!.hudScale) } }) },
        { id: 'fonts', group: 'VEHICLE', label: 'FONTS ▸', parkOnly: true, flag: 'opens Tuner › Options (FontPicker); CJ uses fixed fonts', value: () => 'Options screen', aria: () => 'Fonts, opens options', effect: OPTIONS_PANEL },
        { id: 'colors', group: 'VEHICLE', label: 'COLORS ▸', parkOnly: true, flag: 'opens Options (recolor at top); unverified on CJ', value: () => 'Options screen', aria: () => 'Colors, opens options with recolor', effect: OPTIONS_PANEL },
        { id: 'topSpd', group: 'DYNAMICS', label: 'TOP SPD ▸', parkOnly: true, value: () => 'Dynamics screen', aria: () => 'Top speed, opens drive dynamics', effect: CUSTOMIZE },
        { id: 'idleLo', group: 'DYNAMICS', label: 'IDLE LO ▸', parkOnly: true, value: () => 'Dynamics screen', aria: () => 'Idle low, opens drive dynamics', effect: CUSTOMIZE },
        { id: 'idleHi', group: 'DYNAMICS', label: 'IDLE HI ▸', parkOnly: true, value: () => 'Dynamics screen', aria: () => 'Idle high, opens drive dynamics', effect: CUSTOMIZE },
        { id: 'jitter', group: 'DYNAMICS', label: 'JITTER', parkOnly: true, needsUi: true, value: (c) => onOff(c.ui!.jitter), on: (c) => !!c.ui?.jitter, aria: (c) => `Idle jitter, ${c.ui!.jitter ? 'on' : 'off'}`, effect: (c) => ({ type: 'ui', partial: { jitter: !c.ui!.jitter } }) },
        { id: 'jitPct', group: 'DYNAMICS', label: 'JIT %', parkOnly: true, needsUi: true, value: (c) => pct(c.ui!.jitterAmount), aria: (c) => `Idle jitter intensity ${pct(c.ui!.jitterAmount)}`, effect: (c) => ({ type: 'ui', partial: { jitterAmount: knob([0.1, 0.25, 0.5, 0.75, 1], c.ui!.jitterAmount) } }) },
        { id: 'media', group: 'DYNAMICS', label: 'MEDIA', parkOnly: true, needsUi: true, flag: 'Tesla input check stays on Tuner › Options', value: (c) => onOff(c.ui!.media), on: (c) => !!c.ui?.media, aria: (c) => `Media-button controls, ${c.ui!.media ? 'on' : 'off'}`, effect: (c) => ({ type: 'ui', partial: { media: !c.ui!.media } }) },
        ...(ex.role ?? []),
      ],
    },
    telemetry: {
      id: 'telemetry', title: 'TELEMETRY UI',
      items: [
        RTN,
        ...looks,
        { id: 'speed', group: 'UNITS', label: 'SPEED', needsUi: true, value: (c) => (c.ui!.speedUnit === 'mph' ? 'MPH' : 'KM/H'), aria: (c) => `Speed units, ${c.ui!.speedUnit === 'mph' ? 'miles per hour' : 'kilometres per hour'}`, effect: (c) => ({ type: 'ui', partial: { speedUnit: c.ui!.speedUnit === 'mph' ? 'kph' : 'mph' } }) },
        { id: 'dist', group: 'UNITS', label: 'DIST', flag: 'stored; no readout uses it yet', value: (c) => UP(c.prefs.distUnit), aria: (c) => `Distance units, ${c.prefs.distUnit === 'mi' ? 'miles' : 'kilometres'}`, effect: (c) => ({ type: 'prefs', partial: { distUnit: c.prefs.distUnit === 'mi' ? 'km' : 'mi' } }) },
        { id: 'temp', group: 'UNITS', label: 'TEMP', flag: 'stored; no readout uses it yet', value: (c) => (c.prefs.tempUnit === 'f' ? '°F' : '°C'), aria: (c) => `Temperature, ${c.prefs.tempUnit === 'f' ? 'Fahrenheit' : 'Celsius'}`, effect: (c) => ({ type: 'prefs', partial: { tempUnit: c.prefs.tempUnit === 'f' ? 'c' : 'f' } }) },
        { id: 'press', group: 'UNITS', label: 'PRESS', flag: 'stored; no readout uses it yet', value: (c) => UP(c.prefs.pressUnit), aria: (c) => `Pressure, ${c.prefs.pressUnit === 'psi' ? 'P S I' : 'bar'}`, effect: (c) => ({ type: 'prefs', partial: { pressUnit: c.prefs.pressUnit === 'psi' ? 'bar' : 'psi' } }) },
        { id: 'density', group: 'READOUT', label: 'DENSITY', needsUi: true, flag: 'telemetryDensity: only the unrouted DrivePage reads it', value: (c) => UP(c.ui!.telemetryDensity), aria: (c) => `Readout density, ${c.ui!.telemetryDensity}`, effect: (c) => ({ type: 'ui', partial: { telemetryDensity: cycle(['full', 'compact', 'minimal'] as const, c.ui!.telemetryDensity) } }) },
        ...(ex.telemetry ?? []),
      ],
    },
    sound: {
      id: 'sound', title: 'SOUND',
      items: [
        RTN,
        { id: 'pack', group: 'PACK', label: 'PACK ▸', parkOnly: true, value: () => 'Engine · pack', aria: () => 'Pack, opens the engine collection', effect: nav({ type: 'panel', panel: 'garage' }) },
        { id: 'mute', group: 'AUDIO', label: 'MUTE', value: (c) => onOff(c.muted), on: (c) => c.muted, aria: (c) => `Mute, ${c.muted ? 'on' : 'off'}`, effect: () => ({ type: 'mute' }) },
        { id: 'vol', group: 'AUDIO', label: 'VOL', value: () => 'SYS', readOnly: 'Follows the system volume', aria: () => 'Volume follows the system volume' },
        { id: 'swSnd', group: 'AUDIO', label: 'SW SND', value: (c) => onOff(c.prefs.switchSound), on: (c) => c.prefs.switchSound, aria: (c) => `Switch sounds, ${c.prefs.switchSound ? 'on' : 'off'}`, effect: (c) => ({ type: 'prefs', partial: { switchSound: !c.prefs.switchSound } }) },
        { id: 'bkgnd', group: 'AUDIO', label: 'BKGND', needsUi: true, value: (c) => onOff(c.ui!.background), on: (c) => !!c.ui?.background, aria: (c) => `Background audio, ${c.ui!.background ? 'on' : 'off'}`, effect: (c) => ({ type: 'ui', partial: { background: !c.ui!.background } }) },
        ...alerts,
        ...(ex.sound ?? []),
      ],
    },
    map: {
      id: 'map', title: 'MAP',
      items: [
        RTN,
        { id: 'gps', label: 'GPS', parkOnly: true, needsUi: true, value: (c) => (c.ui!.demo ? 'DEMO' : 'LIVE'), aria: (c) => `GPS source, ${c.ui!.demo ? 'demo' : 'live'}`, effect: (c) => ({ type: 'ui', partial: { demo: !c.ui!.demo } }) },
        { id: 'fix', label: 'FIX · RETRY', needsUi: true, value: (c) => UP(c.ui!.gpsLabel || '—').slice(0, 14), aria: (c) => `GPS fix, ${c.ui!.gpsLabel}. Retry`, effect: () => ({ type: 'retry-gps' }) },
        { id: 'compass', label: 'COMPASS', when: (c) => !!c.compass?.available, value: (c) => UP(c.compass?.state ?? ''), aria: (c) => `Compass, ${c.compass?.state}`, effect: () => ({ type: 'compass' }) },
        { id: 'radar', label: 'RADAR', value: (c) => onOff(c.map.radar), on: (c) => c.map.radar, aria: (c) => `Radar, ${c.map.radar ? 'on' : 'off'}`, effect: (c) => ({ type: 'map', next: { ...c.map, radar: !c.map.radar } }) },
        { id: 'style', label: 'STYLE', value: (c) => `${c.map.northUp ? 'N-UP' : 'TRK-UP'} ${c.map.zoom}MI`, aria: (c) => `Map style, ${c.map.northUp ? 'north up' : 'track up'}, ${c.map.zoom} miles`, effect: (c) => ({ type: 'map', next: c.map.northUp ? applyMapKey(c.map, 'orient') : { ...applyMapKey(c.map, 'orient'), zoom: c.map.zoom === 10 ? 2 : stepRange(c.map.zoom, 1) } }) },
        { id: 'rng', label: 'RNG', value: (c) => `${c.map.range} MI`, aria: (c) => `Radar range ${c.map.range} miles`, effect: (c) => ({ type: 'map', next: { ...c.map, range: c.map.range === 10 ? 2 : stepRange(c.map.range, 1) } }) },
        { id: 'mode', label: 'MODE', value: (c) => (c.map.mode === 'map' ? 'MAP' : 'TERR'), aria: (c) => `Radar mode, ${c.map.mode === 'map' ? 'map' : 'terrain'}`, effect: (c) => ({ type: 'map', next: applyMapKey(c.map, 'mode') }) },
        { id: 'mapCredit', label: '(i) CREDIT', value: () => 'OSM · OpenFreeMap', aria: () => `Map credit: ${MAP_CREDIT}`, effect: () => ({ type: 'info', text: MAP_CREDIT }) },
        ...(ex.map ?? []),
      ],
    },
    options: {
      id: 'options', title: 'OPTIONS',
      items: [
        RTN,
        { id: 'start', label: 'ENGINE STARTUP', parkOnly: true, flag: 'stored only (cold start parked on frontend/cj-cold-start); stored values apu | gndAir unchanged', value: (c) => (c.prefs.startMode === 'apu' ? 'APU' : 'STANDARD'), aria: (c) => `Engine startup, ${c.prefs.startMode === 'apu' ? 'A P U' : 'standard, ground air cross-bleed'}`, effect: (c) => ({ type: 'prefs', partial: { startMode: c.prefs.startMode === 'apu' ? 'gndAir' : 'apu' } }) },
        { id: 'motion', label: 'MOTION', value: (c) => UP(c.prefs.motion), aria: (c) => `Motion, ${c.prefs.motion === 'auto' ? 'follows system' : c.prefs.motion}`, effect: (c) => ({ type: 'prefs', partial: { motion: cycle(['auto', 'reduced', 'full'] as const, c.prefs.motion) } }) },
        { id: 'alerts', label: 'ALERTS ▸', value: () => 'Calls · hi-spd · AB', aria: () => 'Alerts, opens the sound page', effect: () => ({ type: 'page', page: 'sound' }) },
        { id: 'tip', label: 'TIP', needsUi: true, value: (c) => onOff(c.ui!.showKeepAliveTip), on: (c) => !!c.ui?.showKeepAliveTip, aria: (c) => `Keep-tab-open tip, ${c.ui!.showKeepAliveTip ? 'on' : 'off'}`, effect: (c) => ({ type: 'ui', partial: { showKeepAliveTip: !c.ui!.showKeepAliveTip } }) },
        { id: 'diag', label: 'DIAG ▸', parkOnly: true, value: () => 'Sensor test', aria: () => 'Diagnostics, sensor test', effect: nav({ type: 'route', to: '/diag' }) },
        { id: 'about', label: 'ABOUT', value: () => 'Credits', aria: () => `About. ${ABOUT_TEXT}`, effect: () => ({ type: 'info', text: ABOUT_TEXT }) },
        { id: 'reset', label: 'RESET ▸', parkOnly: true, value: () => 'Interface options', aria: () => 'Reset, opens interface options', flag: 'opens /customize (Reset to defaults lives there)', effect: CUSTOMIZE },
        ...(ex.options ?? []),
      ],
    },
  };
}

/** Items present in this context (drops `when` misses). */
export const visibleItems = (p: ConfigPage, c: ConfigCtx) => p.items.filter((i) => !i.when || i.when(c));

/** Why an item can't run right now (undefined = live). */
export function disabledReason(it: ConfigItem, c: ConfigCtx): string | undefined {
  if (it.readOnly) return it.readOnly;
  if (it.needsUi && !c.ui) return DRIVE_REASON;
  if (it.parkOnly && !c.park) return PARK_REASON;
  return undefined;
}
export function itemValue(it: ConfigItem, c: ConfigCtx): string {
  if (it.needsUi && !c.ui) return '';
  return it.value ? it.value(c) : '';
}
export function itemAria(it: ConfigItem, c: ConfigCtx): string {
  const base = it.needsUi && !c.ui ? it.label : it.aria ? it.aria(c) : `${it.label}${it.value ? `, ${it.value(c)}` : ''}`;
  const why = disabledReason(it, c);
  return why ? `${base}. ${why}` : base;
}
/** Run an item: the effect, or null when disabled. */
export const runItem = (it: ConfigItem, c: ConfigCtx): ConfigEffect | null => (disabledReason(it, c) || !it.effect ? null : it.effect(c));

/** Tile paging: slot 0 = RTN, then `slots - 1` tiles; overflow pages put NEXT ▸ in the last slot. */
export function pageTiles(items: ConfigItem[], slots: number, sub: number): { tiles: (ConfigItem | 'next')[]; subs: number } {
  const rest = items.filter((i) => i.id !== 'rtn');
  const room = slots - 1;
  if (rest.length <= room) return { tiles: [RTN, ...rest], subs: 1 };
  const per = room - 1;
  const subs = Math.ceil(rest.length / per);
  const s = ((sub % subs) + subs) % subs;
  return { tiles: [RTN, ...rest.slice(s * per, s * per + per), 'next'], subs };
}
