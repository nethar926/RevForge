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
export function cjNavAction(id: string, labPanel: 'dashlab' | 'studio' = 'studio'): CjNavAction | null {
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
}

/** Items for CarrierJetSwitchPanel: row (MORE last) + overflow tray. */
export function cjNavItems({ current, muted, moreOpen, compass, demote = 0 }: CjNavInput): { items: CjSwitchItem[]; overflow: CjSwitchItem[] } {
  const page = (id: string): CjSwitchItem => ({ id, label: LABELS[id], kind: 'page', on: current === id });
  const all: CjSwitchItem[] = [
    ...CJ_ROW_PAGES.map(page),
    ...(compass ? [{ id: 'compass', label: LABELS.compass, kind: 'toggle' as const, state: compass }] : []),
    { id: 'mute', label: LABELS.mute, kind: 'toggle', on: muted },
  ];
  const present = CJ_DEMOTE_ORDER.filter((id) => all.some((i) => i.id === id));
  const gone = new Set<string>(present.slice(0, Math.max(0, Math.min(demote, present.length))));
  const row = all.filter((i) => !gone.has(i.id));
  const moved = all.filter((i) => gone.has(i.id));
  return { items: [...row, { id: 'more', label: LABELS.more, kind: 'more', on: moreOpen }], overflow: [...moved, ...CJ_TRAY_PAGES.map(page)] };
}

export const cjMaxDemote = (hasCompass: boolean) => CJ_DEMOTE_ORDER.length - (hasCompass ? 0 : 1);
