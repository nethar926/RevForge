import type { ComponentType } from 'react';
import type { EngineKind } from '../audio/types';

/**
 * Live drive telemetry handed to a pack's HUD/cluster component.
 * ThemeStage derives these from the existing rAF simulation (no new loops).
 */
export interface PackHudProps {
  /** 0..1 engine speed between idle and redline. */
  rpmNorm: number;
  /** Absolute engine RPM (0 when engine is off). */
  rpm: number;
  /** 0..1 speed against the configured speed scale. */
  speedNorm: number;
  /** Absolute speed in `unit`. */
  speed: number;
  unit: 'mph' | 'kph';
  /** Smoothed engine load 0..1. */
  load: number;
  /** Driver throttle 0..1 (load stands in when GPS-driven). */
  throttle: number;
  /** 0 = neutral. */
  gear: number;
  /** Trip distance in metres (simulation odometer). */
  distanceM: number;
  shifting: boolean;
  overrun: boolean;
  running: boolean;
  demo: boolean;
  /** RPM at which the cluster should show redline. */
  redlineRpm: number;
  /** False when the user switched "Animated environment" off. */
  motion: boolean;
}

/** How the pack behaves under prefers-reduced-motion / Animated environment off. */
export type ReducedMotionBehavior =
  /** Animated light sources freeze to a static centred glow; meters still update. */
  | 'static-glow'
  /** All decorative animation stops; meters still update. */
  | 'freeze';

/** Legacy id → canonical id maps applied to saved prefs before first render. */
export interface PackMigrations {
  /** Theme Lab / cluster preset ids (drivesynth.theme.v2, saved combinations). */
  theme?: Record<string, string>;
  /** Engine / patch ids (drivesynth.ui.v1 selectedEngineId, deep links). */
  engine?: Record<string, string>;
}

/**
 * A theme pack binds ONE cluster/HUD + ONE engine (+ optional scene) under a
 * single id. Selecting the pack selects theme and engine together.
 * Additive: themes and engines that are not part of a pack keep working as-is.
 */
export interface ThemePack {
  /** Canonical pack id, e.g. 'night-pursuit'. */
  id: string;
  /** User-facing name, e.g. 'Night Pursuit'. */
  displayName: string;
  /** One-line descriptor for pickers. */
  tagline: string;
  /** Experimental packs only show under the Experimental group once opted in. */
  experimental: boolean;
  /** Theme catalog preset id rendered on Drive (ThemeStage). */
  themeId: string;
  /** Pack-owned HUD/cluster component; ThemeStage mounts it for `themeId`. */
  Hud: ComponentType<PackHudProps>;
  /** Linked engine pack id in the audio registry (BUILTIN_PATCHES). */
  engineId: string;
  engineKind: EngineKind;
  /** Optional RoadView atmosphere id to pair (not used by Full Screen packs). */
  sceneId?: string;
  migrations: PackMigrations;
  reducedMotion: ReducedMotionBehavior;
}
