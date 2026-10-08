import { getBuiltin, resolveLegacyPackId } from '../audio';
import { FALLBACK_ENGINE_ID, resolveListedEngineId } from '../themes/visibility';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TEXT_SIZE, isTextSize, type TextSize } from './useA11yPrefs';
import {
  DEFAULT_GEAR_COUNT,
  DEFAULT_MAX_TOP_SPEED_MPH,
} from './gearLogic';
import { storageKey } from '../lib/storageKey';

export type ThemeId = 'night' | 'day' | 'neon' | 'mono';
export type LayoutDensity = 'comfortable' | 'compact' | 'spacious';
/** @deprecated Prefer GaugeCluster; kept for persisted prefs + Gauge prop mapping. */
export type GaugeStyle = 'arc' | 'bar' | 'numeric';
export type GaugeCluster = 'classic' | 'digital' | 'minimal' | 'skin-native';
export type TelemetryDensity = 'full' | 'compact' | 'minimal';
export type SpeedUnit = 'mph' | 'kph';
/** Ion Twin SPEED glyph mode — aurebesh default; latin/dual for cabin glanceability. */
export type IonTwinSpeedScript = 'aurebesh' | 'latin' | 'dual';

export interface ControlMapping {
  revPad: 'throttle';
  speedSlider: 'speed';
  mute: 'masterGain';
}

export interface UiPrefs {
  theme: ThemeId;
  accent: string;
  density: LayoutDensity;
  /** Legacy arc/bar/numeric — kept in sync with gaugeCluster. */
  gaugeStyle: GaugeStyle;
  /** Secondary cluster preference (Customize “Gauge cluster”). */
  gaugeCluster: GaugeCluster;
  /** LOAD/REVS/ACCEL strip density. */
  telemetryDensity: TelemetryDensity;
  speedUnit: SpeedUnit;
  showKeepAliveTip: boolean;
  masterMuted: boolean;
  masterVolume: number;
  selectedEngineId: string;
  mapping: ControlMapping;
  /** Optional Ion Twin lock chirp; off by default. */
  ionTwinLockSfx: boolean;
  /** Optional MANUAL upshift bark; off by default. Also mirrored to `ds-upshift-sfx`. */
  upshiftSfx: boolean;
  /**
   * Ion Twin SPEED script. Default aurebesh (always-on, not hold Easter egg).
   * Latin / dual-ghost for Customize glanceability under cabin motion.
   */
  ionTwinSpeedScript: IonTwinSpeedScript;
  /** Appearance: phosphor/glow bloom strength 0..1. */
  bloomGlow: number;
  /** Appearance: CRT/HUD scanline strength 0..1. */
  scanlineStrength: number;
  /** Appearance: instrument HUD opacity 0.25..1. */
  hudOpacity: number;
  /** Appearance: bezel/frame intensity 0..1. */
  hudBezel: number;
  /** Drive Dynamics: indicated gear count 4–8. */
  gearCount: number;
  /** Drive Dynamics: gauge / threshold top speed (mph). */
  maxTopSpeedMph: number;
  /** Drive Dynamics: idle RPM floor — for @Audio Synth. */
  idleRpmMin: number;
  /** Drive Dynamics: idle RPM ceiling / jitter band — for @Audio Synth. */
  idleRpmMax: number;
  /** Display & Accessibility: in-app Text size (HIG Dynamic Type stand-in). */
  textSize: TextSize;
  /** Display & Accessibility: Bold text (chrome weight +100). */
  boldText: boolean;
  /** Display & Accessibility: in-app Increase Contrast (OR'd with prefers-contrast). */
  increaseContrast: boolean;
  /** Display & Accessibility: in-app Reduce Transparency (OR'd with prefers-reduced-transparency). */
  reduceTransparency: boolean;
  /** Display & Accessibility: in-app Reduce Motion (OR'd with prefers-reduced-motion). */
  reduceMotion: boolean;
}

/** Primary prefs blob. */
export const UI_PREFS_KEY = 'drivesynth.ui.v1';
const KEY = UI_PREFS_KEY;

/** Dedicated mirrors so @Audio Synth can read without parsing the UI blob. */
export const DYNAMICS_KEYS = {
  gearCount: 'revforge.dynamics.gearCount',
  maxTopSpeedMph: 'revforge.dynamics.maxTopSpeedMph',
  idleRpmMin: 'revforge.dynamics.idleRpmMin',
  idleRpmMax: 'revforge.dynamics.idleRpmMax',
} as const;

export const APPEARANCE_KEYS = {
  bloomGlow: 'revforge.prefs.bloomGlow',
  scanlineStrength: 'revforge.prefs.scanlineStrength',
  hudOpacity: 'revforge.prefs.hudOpacity',
  hudBezel: 'revforge.prefs.hudBezel',
} as const;

export const DEFAULT_UI: UiPrefs = {
  theme: 'night',
  accent: '#3dffb5',
  density: 'comfortable',
  gaugeStyle: 'arc',
  gaugeCluster: 'classic',
  telemetryDensity: 'full',
  speedUnit: 'mph',
  showKeepAliveTip: true,
  masterMuted: false,
  masterVolume: .65,
  selectedEngineId: FALLBACK_ENGINE_ID,
  mapping: {
    revPad: 'throttle',
    speedSlider: 'speed',
    mute: 'masterGain',
  },
  ionTwinLockSfx: false,
  upshiftSfx: false,
  ionTwinSpeedScript: 'aurebesh',
  bloomGlow: 0.55,
  scanlineStrength: 0.35,
  hudOpacity: 1,
  hudBezel: 0.45,
  gearCount: DEFAULT_GEAR_COUNT,
  maxTopSpeedMph: DEFAULT_MAX_TOP_SPEED_MPH,
  idleRpmMin: 700,
  idleRpmMax: 900,
  textSize: DEFAULT_TEXT_SIZE,
  boldText: false,
  increaseContrast: false,
  reduceTransparency: false,
  reduceMotion: false,
};

function normalizeA11y(p: Partial<UiPrefs>): Pick<UiPrefs, 'textSize' | 'boldText' | 'increaseContrast' | 'reduceTransparency' | 'reduceMotion'> {
  return {
    textSize: isTextSize(p.textSize) ? p.textSize : DEFAULT_TEXT_SIZE,
    boldText: p.boldText === true,
    increaseContrast: p.increaseContrast === true,
    reduceTransparency: p.reduceTransparency === true,
    reduceMotion: p.reduceMotion === true,
  };
}

const LEGACY_AUREBESH_KEY = 'drivesynth.ionTwin.aurebeshNumerals';

function clamp01(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function clampRange(n: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function normalizeDynamics(partial: Partial<UiPrefs>): Pick<
  UiPrefs,
  'gearCount' | 'maxTopSpeedMph' | 'idleRpmMin' | 'idleRpmMax' | 'bloomGlow' | 'scanlineStrength' | 'hudOpacity' | 'hudBezel'
> {
  let idleMin = clampRange(Number(partial.idleRpmMin), 400, 2000, DEFAULT_UI.idleRpmMin);
  let idleMax = clampRange(Number(partial.idleRpmMax), 400, 2500, DEFAULT_UI.idleRpmMax);
  if (idleMax < idleMin) idleMax = idleMin;
  return {
    gearCount: clampRange(Number(partial.gearCount), 4, 8, DEFAULT_UI.gearCount),
    maxTopSpeedMph: clampRange(Number(partial.maxTopSpeedMph), 60, 300, DEFAULT_UI.maxTopSpeedMph),
    idleRpmMin: idleMin,
    idleRpmMax: idleMax,
    bloomGlow: clamp01(Number(partial.bloomGlow), DEFAULT_UI.bloomGlow),
    scanlineStrength: clamp01(Number(partial.scanlineStrength), DEFAULT_UI.scanlineStrength),
    hudOpacity: clampRange(Number(partial.hudOpacity), 0.25, 1, DEFAULT_UI.hudOpacity),
    hudBezel: clamp01(Number(partial.hudBezel), DEFAULT_UI.hudBezel),
  };
}

/** Map cluster pref → Gauge style prop. */
export function clusterToGaugeStyle(cluster: GaugeCluster): GaugeStyle {
  switch (cluster) {
    case 'digital':
      return 'bar';
    case 'minimal':
    case 'skin-native':
      return 'numeric';
    case 'classic':
    default:
      return 'arc';
  }
}

/** Map legacy gaugeStyle → cluster (migration). */
export function gaugeStyleToCluster(style: GaugeStyle): GaugeCluster {
  switch (style) {
    case 'bar':
      return 'digital';
    case 'numeric':
      return 'minimal';
    case 'arc':
    default:
      return 'classic';
  }
}

/** Packs that ship a signature secondary plate. */
export function packHasSkinNativeSecondary(skinId: string): boolean {
  return (
    skinId === 'ion-twin' ||
    skinId === 'aerospace-f14' ||
    skinId === 'ice-v8' ||
    skinId === 'ev-inverter'
  );
}

/**
 * Effective secondary cluster for Drive.
 * skin-native without a pack overlay falls back to minimal.
 */
export function resolveGaugeCluster(cluster: GaugeCluster, skinId: string): GaugeCluster {
  if (cluster === 'skin-native' && !packHasSkinNativeSecondary(skinId)) {
    return 'minimal';
  }
  return cluster;
}

function migrateIonTwinSpeedScript(parsed: Partial<UiPrefs>): IonTwinSpeedScript {
  const v = parsed.ionTwinSpeedScript;
  if (v === 'aurebesh' || v === 'latin' || v === 'dual') return v;
  try {
    const legacy = localStorage.getItem(storageKey(LEGACY_AUREBESH_KEY));
    if (legacy === 'false' || legacy === '0') return 'latin';
  } catch {
    /* ignore */
  }
  return 'aurebesh';
}

function readLegacyNumber(key: string): number | undefined {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(storageKey(KEY));
    const dsUpshift = localStorage.getItem(storageKey('ds-upshift-sfx')) === '1';
    const legacyHud = readLegacyNumber('revforge.hudOpacity');
    if (!raw) {
      return {
        ...DEFAULT_UI,
        upshiftSfx: dsUpshift,
        ionTwinSpeedScript: migrateIonTwinSpeedScript({}),
        ...normalizeDynamics({
          ...DEFAULT_UI,
          hudOpacity: legacyHud ?? DEFAULT_UI.hudOpacity,
          gearCount: readLegacyNumber(DYNAMICS_KEYS.gearCount),
          maxTopSpeedMph: readLegacyNumber(DYNAMICS_KEYS.maxTopSpeedMph),
          idleRpmMin: readLegacyNumber(DYNAMICS_KEYS.idleRpmMin),
          idleRpmMax: readLegacyNumber(DYNAMICS_KEYS.idleRpmMax),
          bloomGlow: readLegacyNumber(APPEARANCE_KEYS.bloomGlow),
          scanlineStrength: readLegacyNumber(APPEARANCE_KEYS.scanlineStrength),
          hudBezel: readLegacyNumber(APPEARANCE_KEYS.hudBezel),
        }),
      };
    }
    const parsed = JSON.parse(raw) as Partial<UiPrefs> & { upshiftBarkSfx?: boolean };
    const upshiftSfx =
      typeof parsed.upshiftSfx === 'boolean'
        ? parsed.upshiftSfx
        : typeof parsed.upshiftBarkSfx === 'boolean'
          ? parsed.upshiftBarkSfx
          : dsUpshift;
    const dynamics = normalizeDynamics({
      bloomGlow: parsed.bloomGlow ?? readLegacyNumber(APPEARANCE_KEYS.bloomGlow),
      scanlineStrength: parsed.scanlineStrength ?? readLegacyNumber(APPEARANCE_KEYS.scanlineStrength),
      hudOpacity: parsed.hudOpacity ?? legacyHud ?? readLegacyNumber(APPEARANCE_KEYS.hudOpacity),
      hudBezel: parsed.hudBezel ?? readLegacyNumber(APPEARANCE_KEYS.hudBezel),
      gearCount: parsed.gearCount ?? readLegacyNumber(DYNAMICS_KEYS.gearCount),
      maxTopSpeedMph: parsed.maxTopSpeedMph ?? readLegacyNumber(DYNAMICS_KEYS.maxTopSpeedMph),
      idleRpmMin: parsed.idleRpmMin ?? readLegacyNumber(DYNAMICS_KEYS.idleRpmMin),
      idleRpmMax: parsed.idleRpmMax ?? readLegacyNumber(DYNAMICS_KEYS.idleRpmMax),
    });
    const merged: UiPrefs = {
      ...DEFAULT_UI,
      ...parsed,
      mapping: { ...DEFAULT_UI.mapping, ...parsed.mapping },
      upshiftSfx,
      ionTwinSpeedScript: migrateIonTwinSpeedScript(parsed),
      ...dynamics,
      ...normalizeA11y(parsed),
    };
    if (parsed.gaugeCluster == null && parsed.gaugeStyle != null) {
      merged.gaugeCluster = gaugeStyleToCluster(parsed.gaugeStyle);
    }
    if (
      parsed.telemetryDensity !== 'full' &&
      parsed.telemetryDensity !== 'compact' &&
      parsed.telemetryDensity !== 'minimal'
    ) {
      merged.telemetryDensity = DEFAULT_UI.telemetryDensity;
    }
    merged.gaugeStyle = clusterToGaugeStyle(merged.gaugeCluster);
    // Hidden built-in engines → Night Pursuit's engine (visibility.ts VISIBLE_ENGINE_IDS); user synths untouched.
    merged.selectedEngineId = resolveListedEngineId(resolveLegacyPackId(merged.selectedEngineId), (id) => !!getBuiltin(id));
    return merged;
  } catch {
    return { ...DEFAULT_UI };
  }
}

function persistMirrors(prefs: UiPrefs) {
  try {
    localStorage.setItem(storageKey(DYNAMICS_KEYS.gearCount), String(prefs.gearCount));
    localStorage.setItem(storageKey(DYNAMICS_KEYS.maxTopSpeedMph), String(prefs.maxTopSpeedMph));
    localStorage.setItem(storageKey(DYNAMICS_KEYS.idleRpmMin), String(prefs.idleRpmMin));
    localStorage.setItem(storageKey(DYNAMICS_KEYS.idleRpmMax), String(prefs.idleRpmMax));
    localStorage.setItem(storageKey(APPEARANCE_KEYS.bloomGlow), String(prefs.bloomGlow));
    localStorage.setItem(storageKey(APPEARANCE_KEYS.scanlineStrength), String(prefs.scanlineStrength));
    localStorage.setItem(storageKey(APPEARANCE_KEYS.hudOpacity), String(prefs.hudOpacity));
    localStorage.setItem(storageKey(APPEARANCE_KEYS.hudBezel), String(prefs.hudBezel));
    // Keep legacy Forge key in sync for existing HUD opacity readers.
    localStorage.setItem(storageKey('revforge.hudOpacity'), String(prefs.hudOpacity));
  } catch {
    /* ignore */
  }
}

function applyAppearanceCss(prefs: UiPrefs) {
  const root = document.documentElement;
  root.style.setProperty('--rf-bloom', String(prefs.bloomGlow));
  root.style.setProperty('--rf-scanline', String(prefs.scanlineStrength));
  root.style.setProperty('--hud-opacity', String(prefs.hudOpacity));
  root.style.setProperty('--rf-bezel', String(prefs.hudBezel));
  // Pack overlays read --skin-scanline-opacity / bloom multipliers.
  root.style.setProperty(
    '--skin-scanline-opacity',
    String(0.02 + prefs.scanlineStrength * 0.1),
  );
  root.style.setProperty(
    '--skin-bloom-mul',
    String(0.35 + prefs.bloomGlow * 1.25),
  );
  root.dataset.rfBloom = prefs.bloomGlow > 0.05 ? 'on' : 'off';
  root.dataset.rfScanline = prefs.scanlineStrength > 0.05 ? 'on' : 'off';
}

export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(KEY), JSON.stringify(prefs));
      if (prefs.upshiftSfx) localStorage.setItem(storageKey('ds-upshift-sfx'), '1');
      else localStorage.removeItem(storageKey('ds-upshift-sfx'));
      persistMirrors(prefs);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.setProperty('--accent', prefs.accent);
    document.documentElement.dataset.density = prefs.density;
    document.documentElement.dataset.telemetry = prefs.telemetryDensity;
    applyAppearanceCss(prefs);
  }, [prefs]);

  const update = useCallback((partial: Partial<UiPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...partial };
      if (partial.gaugeCluster != null) {
        next.gaugeStyle = clusterToGaugeStyle(partial.gaugeCluster);
      } else if (partial.gaugeStyle != null && partial.gaugeCluster == null) {
        next.gaugeCluster = gaugeStyleToCluster(partial.gaugeStyle);
      }
      const dynamics = normalizeDynamics(next);
      return { ...next, ...dynamics, ...normalizeA11y(next) };
    });
  }, []);

  const reset = useCallback(() => setPrefs({ ...DEFAULT_UI }), []);

  return { prefs, update, reset };
}
