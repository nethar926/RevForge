import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CarrierJetSwitchPanel } from '../../skins/carrier-jet';
import { cjMaxDemote, cjNavAction, cjNavItems, type CjNavAction } from '../carrier-jet.nav';
import { compassFlowAvailable, getCompassSnapshot, subscribeCompass, toggleCompass } from '../heading';
import { useRfLayout } from '../layout';
import './carrier-jet-controls.css';
import { cjPanelNeed } from './cjNavFit';

export interface CjNavRowProps {
  /** Switch id of the current page (carrier-jet.nav currentCjPage). */
  current: string | null;
  /** Same state as the top-chrome / Tuner mute. */
  muted: boolean;
  /** Tuner's Lab target (DashLab when listed, else EngineForge). */
  labPanel?: 'dashlab' | 'studio';
  /** Route / panel / drive / mute actions; MORE and COMPASS are handled here. */
  onAction: (action: CjNavAction) => void;
}

/**
 * Carrier Jet replacement for the ☰ / Tuner menu button: Visual Skins' switch panel, wired.
 * Fits its slot: switches that do not fit move into MORE (CJ_DEMOTE_ORDER). MORE opens / closes the
 * tray (Escape or a tap outside closes it and returns focus to MORE). COMPASS appears only where the
 * iOS compass permission flow exists (phone layouts), and taps run requestPermission from the gesture.
 * Placement: the top bar slot until the drive dock exists, then CarrierJetMount's bottom bank (setCjNavSlot).
 * Variant: 'compact' on Tesla / desktop (board, drive window: every legend shown); phones keep 'auto'
 * (compact in phone-landscape, portrait order DRIVE GARAGE MUTE COMPASS … MORE in portrait).
 */
/*
 * Bottom-bank slot (CarrierJetMount's .cjm-bank-nav). The mount publishes it once the drive dock exists; while
 * one is published the row renders there (createPortal) instead of the top bar slot.
 */
let navSlot: HTMLElement | null = null;
const slotSubs = new Set<() => void>();
/** Publish (el) or withdraw (null, el = the slot being withdrawn) the bottom-bank nav slot. */
export function setCjNavSlot(el: HTMLElement | null, prev?: HTMLElement) {
  if (el === null && prev && navSlot !== prev) return;
  if (navSlot === el) return;
  navSlot = el;
  for (const f of slotSubs) f();
}
export const getCjNavSlot = () => navSlot;
const subscribeCjNavSlot = (f: () => void) => {
  slotSubs.add(f);
  return () => void slotSubs.delete(f);
};

export function CjNavRow({ current, muted, labPanel = 'studio', onAction }: CjNavRowProps) {
  const layout = useRfLayout(false);
  const compass = useSyncExternalStore(subscribeCompass, getCompassSnapshot, getCompassSnapshot);
  const showCompass = compassFlowAvailable(layout);
  const [moreOpen, setMoreOpen] = useState(false);
  const [demote, setDemote] = useState(0);
  const [hostW, setHostW] = useState(0);
  const hostRef = useRef<HTMLElement>(null);
  const slot = useSyncExternalStore(subscribeCjNavSlot, getCjNavSlot, () => null);
  const place = slot ? 'bank' : 'top';
  const { items, overflow } = cjNavItems({ current, muted, moreOpen, compass: showCompass ? compass.state : undefined, demote });

  // Re-fit from scratch whenever the slot width or the switch set changes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHostW(Math.round(el.clientWidth)));
    setHostW(Math.round(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [slot]);
  const fitKey = useRef('');
  useLayoutEffect(() => {
    const key = `${hostW}|${showCompass}|${place}`;
    if (fitKey.current !== key) {
      fitKey.current = key;
      if (demote !== 0) {
        setDemote(0);
        return;
      }
    }
    const host = hostRef.current;
    const panel = host?.querySelector<HTMLElement>('.cjs');
    if (!host || !panel) return;
    if (cjPanelNeed(panel) > host.clientWidth + 0.5 && demote < cjMaxDemote(showCompass)) setDemote(demote + 1);
  });

  const focusMore = () => hostRef.current?.querySelector<HTMLElement>('[data-sw-id="more"]')?.focus();
  const closeMore = useCallback((refocus: boolean) => {
    setMoreOpen(false);
    if (refocus) requestAnimationFrame(focusMore);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const away = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [moreOpen]);

  const onSelect = (id: string) => {
    const a = cjNavAction(id, labPanel);
    if (!a) return;
    if (a.type === 'more') {
      setMoreOpen((o) => !o);
      return;
    }
    if (a.type === 'compass') {
      toggleCompass();
      return;
    }
    if (a.type !== 'mute') setMoreOpen(false);
    onAction(a);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && moreOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeMore(true);
    }
  };
  // Top bar and Tesla bottom bank: compact cells (every legend shown; the bank grows them, carrier-jet-controls.css);
  // phones 'auto' (compact in phone-landscape, portrait order in portrait).
  const nav = (
    <nav ref={hostRef} className="cjnav" aria-label="Carrier Jet navigation" data-rf-layout={layout} data-cjnav-place={place} data-demote={demote || undefined} onKeyDown={onKeyDown}>
      <CarrierJetSwitchPanel items={items} overflow={overflow} onSelect={onSelect} variant={layout === 'board' || layout === 'window' ? 'compact' : 'auto'} />
    </nav>
  );
  return slot ? createPortal(nav, slot) : nav;
}
