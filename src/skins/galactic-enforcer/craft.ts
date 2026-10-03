import type { ReactElement } from 'react';
import { DroneArt, InterceptorArt } from './craftArt';

/**
 * Craft art for the Galactic Enforcer HUD — self-contained and swappable.
 * Both craft are ORIGINAL designs (from eacfb48), redrawn as pink-red
 * wireframes for the targeting-computer look. To swap art later, add an entry
 * to CRAFT and pass its id to the HUD (`targetCraft` / `statusCraft`); the HUD
 * only knows the id, the viewBox and the centre.
 */
export type CraftId = 'drone' | 'interceptor';

export interface CraftArt {
  /** Short neutral description for aria (never a franchise name). */
  label: string;
  viewBox: string;
  /** Visual centre inside the viewBox (drift/lock pivot). */
  cx: number;
  cy: number;
  /** Outline + wireframe detail; strokes inherit from `.ge-craft`. */
  art: () => ReactElement;
}

export const CRAFT: Record<CraftId, CraftArt> = {
  drone: { label: 'crescent drone', viewBox: '0 0 360 300', cx: 180, cy: 150, art: DroneArt },
  interceptor: { label: 'swept-delta interceptor', viewBox: '0 0 200 150', cx: 100, cy: 75, art: InterceptorArt },
};

