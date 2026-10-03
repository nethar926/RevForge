export { SweepGauge, type SweepGaugeProps } from './SweepGauge';
export { TwinDialCluster, type TwinDialClusterProps } from './TwinDialCluster';
export { SweepHud, TwinDialHud, TwinDialSpeedHud } from './GradientGaugeHuds';

/** Picker metadata (original names, no brands). Frontend owns the picker UI. */
export const GRADIENT_GAUGE_STYLES = [
  { id: 'sweep', name: 'Sweep', blurb: 'Full-screen conic light sweep with a hard cyan edge at your speed.' },
  { id: 'twin-dial', name: 'Twin Dial', blurb: 'Speed and RPM light discs around a glowing centre readout.' },
  { id: 'twin-dial-gear', name: 'Twin Dial · Gear', blurb: 'Twin Dial with gear chip and RPM pill.' },
] as const;
export type GradientGaugeStyleId = (typeof GRADIENT_GAUGE_STYLES)[number]['id'];
