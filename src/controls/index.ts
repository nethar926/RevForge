/**
 * Headless drag-or-tap controls (framework). Logic + a plain default look; skins supply art through render props,
 * className / unstyled and the data-* state on each root. See frontend-handoff/prefer-taps/MEGHAN-controls-api.md.
 */
export { SlideConfirm, type SlideConfirmProps, type SlideConfirmState } from './SlideConfirm.tsx';
export { RangeDial, type RangeDialProps, type RangeDialState } from './RangeDial.tsx';
export { RadialMenu, type RadialItem, type RadialItemState, type RadialMenuProps, type RadialMenuState } from './RadialMenu.tsx';
export { MagneticSelect, type MagneticOption, type MagneticOptionState, type MagneticSelectProps, type MagneticSelectState } from './MagneticSelect.tsx';
export { AccessOptionsGroup, PreferTapsSetting } from './PreferTapsSetting.tsx';
export { useInteractionMode, usePreferTaps, useReducedMotion } from './useInteractionMode.ts';
export { interactionModeAt, resolveInteractionMode, STOP_DWELL_MS, type InteractionMode } from './interactionMode.ts';
export type { ControlBaseProps } from './controlBase.ts';
