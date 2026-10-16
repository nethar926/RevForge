/**
 * Carrier Jet switch row → existing app destinations (framework; pure, node-testable).
 *
 * The CJ pack swaps the ☰ / Tuner menu button for Visual Skins' CarrierJetSwitchPanel. Every
 * switch maps to an action the old menus already had, so nothing becomes unreachable:
 *   ☰ drawer (components/NavBar.tsx): Drive /drive · Garage /engines · Interface Options /customize ·
 *     Pro Builder /builder · Sound Builder /sound-builder · Diagnostics /diag
 *   Tuner (forge/ForgePage.tsx): Options (tune) · Visuals (themes) · Revs (garage) · Lab (dashlab|studio) ·
 *     Account (account) · Sound Builder /sound-builder. Tuner Options and Revs have no switch of
 *     their own: every Tuner panel keeps its "← TUNE" back button to the full Tuner menu, so both
 *     stay one tap away from VISUALS / LAB / ACCOUNT.
 */
import type { CjSwitchItem, CjSwitchState } from '../skins/carrier-jet/switches.ts';
import { FEATURES, type Features } from '../features.ts';

/** Switch ids owned by a hidden feature (src/features.ts; CJ preview only): no switch, no tray item, no VO node. */
export function hiddenCjPages(f: Features = FEATURES): Set<string> {
  const h = new Set<string>();
  if (!f.soundBuilder) h.add('sound-builder');
  if (!f.proBuilder) h.add('pro-builder');
  if (!f.lab) h.add('lab');
  if (!f.account) h.add('account');
  if (!f.garage) h.add('garage');
  // CJ v2 (Meghan's map #3/#11): VISUALS and Diagnostics live in CONFIG (OPTIONS opens it); row = DRIVE · OPTIONS ·
  // MUTE · (COMPASS) · MORE.
  if (f.cjV2) {
    h.add('visuals');
    h.add('diagnostics');
  }
  return h;
}

export type DrivePanel = 'tuner' | 'themes' | 'scenes' | 'garage' | 'tune' | 'studio' | 'dashlab' | 'account';
export type CjNavAction =
  | { type: 'route'; to: string }
  | { type: 'panel'; panel: DrivePanel }
  | { type: 'drive' }
  | { type: 'mute' }
  | { type: 'compass' }
  | { type: 'more' };

export const CJ_ROW_PAGES = ['drive', 'garage', 'visuals', 'options', 'sound-builder'] as const;
export const CJ_TRAY_PAGES = ['pro-builder', 'lab', 'diagnostics', 'account'] as const;

const LABELS: Record<string, string> = {
  drive: 'Drive', garage: 'Garage', visuals: 'Visuals', options: 'Options', 'sound-builder': 'Sound Builder',
  'pro-builder': 'Pro Builder', lab: 'Lab', diagnostics: 'Diagnostics', account: 'Account',
  compass: 'Compass', mute: 'Mute', more: 'More',
};

/** id → action. `labPanel` mirrors the Tuner's Lab item (DashLab when listed, else EngineForge). */
export function cjNavAction(id: string, labPanel: 'dashlab' | 'studio' = 'studio', features: Features = FEATURES): CjNavAction | null {
  if (hiddenCjPages(features).has(id)) return null;
  switch (id) {
    case 'drive': return { type: 'drive' };
    case 'garage': return { type: 'route', to: '/engines' };
    case 'visuals': return { type: 'panel', panel: 'themes' };
    case 'options': return { type: 'route', to: '/customize' };
    case 'sound-builder': return { type: 'route', to: '/sound-builder' };
    case 'pro-builder': return { type: 'route', to: '/builder' };
    case 'lab': return { type: 'panel', panel: labPanel };
    case 'diagnostics': return { type: 'route', to: '/diag' };
    case 'account': return { type: 'panel', panel: 'account' };
    case 'mute': return { type: 'mute' };
    case 'compass': return { type: 'compass' };
    case 'more': return { type: 'more' };
    default: return null;
  }
}

/** Panels a Drive URL may open on arrival (`/drive?panel=<id>`), used when a switch fires off-Drive. */
export const DRIVE_PANELS: readonly DrivePanel[] = ['tuner', 'themes', 'scenes', 'garage', 'tune', 'studio', 'dashlab', 'account'];
export const isDrivePanel = (v: unknown): v is DrivePanel => typeof v === 'string' && (DRIVE_PANELS as readonly string[]).includes(v);

/** Which switch is "current" for a route + open Drive panel. */
export function currentCjPage(pathname: string, panel: DrivePanel | null): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/drive') {
    if (panel === 'themes' || panel === 'scenes') return 'visuals';
    if (panel === 'account') return 'account';
    if (panel === 'dashlab' || panel === 'studio') return 'lab';
    return 'drive';
  }
  if (p === '/engines') return 'garage';
  if (p === '/customize') return 'options';
  if (p === '/sound-builder') return 'sound-builder';
  if (p === '/builder') return 'pro-builder';
  if (p === '/diag') return 'diagnostics';
  return null;
}

/** Order in which row switches move into MORE when the row does not fit (first = first to go). */
export const CJ_DEMOTE_ORDER = ['sound-builder', 'options', 'visuals', 'garage', 'drive', 'mute', 'compass'] as const;

export interface CjNavInput {
  current: string | null;
  muted: boolean;
  moreOpen: boolean;
  /** undefined = no device compass permission flow here → no COMPASS switch. */
  compass?: CjSwitchState;
  /** How many row switches (by CJ_DEMOTE_ORDER) move into MORE to fit the width. */
  demote?: number;
  /** Build flags (default: this build's FEATURES). */
  features?: Features;
}

/** Items for CarrierJetSwitchPanel: row (MORE last) + overflow tray. */
export function cjNavItems({ current, muted, moreOpen, compass, demote = 0, features = FEATURES }: CjNavInput): { items: CjSwitchItem[]; overflow: CjSwitchItem[] } {
  const page = (id: string): CjSwitchItem => ({ id, label: LABELS[id], kind: 'page', on: current === id });
  const hidden = hiddenCjPages(features);
  const all: CjSwitchItem[] = [
    ...CJ_ROW_PAGES.filter((id) => !hidden.has(id)).map(page),
    ...(compass ? [{ id: 'compass', label: LABELS.compass, kind: 'toggle' as const, state: compass }] : []),
    { id: 'mute', label: LABELS.mute, kind: 'toggle', on: muted },
  ];
  const present = CJ_DEMOTE_ORDER.filter((id) => all.some((i) => i.id === id));
  const gone = new Set<string>(present.slice(0, Math.max(0, Math.min(demote, present.length))));
  const row = all.filter((i) => !gone.has(i.id));
  const moved = all.filter((i) => gone.has(i.id));
  return { items: [...row, { id: 'more', label: LABELS.more, kind: 'more', on: moreOpen }], overflow: [...moved, ...CJ_TRAY_PAGES.filter((id) => !hidden.has(id)).map(page)] };
}

export const cjMaxDemote = (hasCompass: boolean, features: Features = FEATURES) =>
  CJ_DEMOTE_ORDER.length - (hasCompass ? 0 : 1) - CJ_DEMOTE_ORDER.filter((id) => hiddenCjPages(features).has(id)).length;
