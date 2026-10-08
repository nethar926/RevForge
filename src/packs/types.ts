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
  /**
   * Compact variant request. ThemeStage passes `true` in drive-window mode (else undefined);
   * mounts may override (e.g. 'auto' = the skin decides from its own fit scale).
   */
  compact?: boolean | 'auto';
  /**
   * Drive-window layout mode (Tesla in Drive: browser shrinks to ~5:4, or height ≤ 640).
   * Mirrors `data-drive-window="true"` on `.theme-stage`. Optional; safe to ignore.
   */
  driveWindow?: boolean;
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
  /**
   * Default true. False when the pack borrows a shared engine preset: that engine
   * stays visible without the opt-in and picking it does NOT switch to the pack theme.
   */
  ownsEngine?: boolean;
  /** Optional RoadView atmosphere id to pair (not used by Full Screen packs). */
  sceneId?: string;
  migrations: PackMigrations;
  reducedMotion: ReducedMotionBehavior;
  /** Optional picker thumbnail (decorative; CSS animation only, honours Reduce Motion). */
  Thumb?: ComponentType;
  /** gh-pages preview folder for this pack (`preview/<slug>/`); also accepted by `?pack=`. */
  previewSlug?: string;
}

/**
 * Pure-data identity for a glob-registered pack (`src/packs/<id>.identity.ts`,
 * default export). ONE constant per pack: renaming a pack = editing this object.
 * Read by the theme catalog (no component imports) and by `<id>.pack.ts`.
 */
export interface PackIdentity {
  /** Canonical pack id = theme catalog id = experimental opt-in key. */
  readonly id: string;
  readonly displayName: string;
  /** gh-pages preview folder Build Lead deploys to. */
  readonly previewSlug: string;
  readonly tagline: string;
  /**
   * Engine mapping. `preferred` is the pack's dedicated Audio engine id; until it
   * is registered in BUILTIN_PATCHES the pack falls back to the shared `fallback`
   * preset (and then does not own/gate that preset).
   */
  readonly engine: { readonly preferred: string; readonly fallback: string; readonly kind: EngineKind };
  /** Theme catalog fields (Full Screen › Experimental). */
  readonly theme: { readonly accent: string; readonly secondary: string; readonly description: string; readonly feature: string };
}
