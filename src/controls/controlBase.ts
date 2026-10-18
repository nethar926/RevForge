/**
 * Shared props / helpers for the headless drag-or-tap controls. Every control:
 *  - picks its mode from useInteractionMode() unless `mode` is passed (previews, galleries, tests);
 *  - exposes its state as data-* on the root (data-rf-ctl, data-mode, data-disabled, data-dragging, data-reduced,
 *    plus per-control ones) and through render props, so a skin can draw it;
 *  - ships a plain default look (rf-ctl--default) that a skin drops with `unstyled`.
 */
import type { InteractionMode } from './interactionMode.ts';

export interface ControlBaseProps {
  /** Extra class on the root (skins). */
  className?: string;
  /** Force a mode (previews / galleries); default = the app-wide useInteractionMode(). */
  mode?: InteractionMode;
  /** Force Reduce Motion on / off; default = the OS setting or the app's MOTION override. */
  reduceMotion?: boolean;
  disabled?: boolean;
  /** Drop the default matte look (keep only the structural classes) so a skin's art stands alone. */
  unstyled?: boolean;
}

/** Root class list: rf-ctl rf-<name> [rf-ctl--default] [className]. */
export function ctlClass(name: string, p: Pick<ControlBaseProps, 'className' | 'unstyled'>): string {
  return ['rf-ctl', `rf-${name}`, p.unstyled ? '' : 'rf-ctl--default', p.className ?? ''].filter(Boolean).join(' ');
}

/** Pointer movement (px) below which a press is still a tap. */
export const TAP_SLOP_PX = 6;
/** Minimum target edge (px) for every tappable part. */
export const TARGET_MIN_PX = 44;
