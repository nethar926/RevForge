import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CarrierJetAfterburnerGuard, CarrierJetHud } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { readPackAbZone, sendPackEngineCommand, subscribePackAbZone } from '../runtime';
import { getAbArmed, setAbArmed, subscribeAbArmed } from '../abArmed';
import type { PackHudProps } from '../types';
import { useFitBox } from './useFitBox';
import { useRfLayout } from '../layout';
import { useHeading } from '../heading';
import { setCjNavSlot } from './CjNavRow';
import './pack-fit.css';
import './carrier-jet-mount.css';
import './carrier-jet-controls.css';

/**
 * Framework adapter: ThemeStage telemetry → Visual Skins' Carrier Jet HUD.
 * useFitBox picks the same on-screen box as the Chrono Coupe / Stellar Helm mounts (and advertises
 * data-fit-box for the drive-window placement), but the HUD gets a plain fill div at that size —
 * no transform scale: the skin sizes itself from its container (container units, px floors).
 * The skin owns the look: it renders the CARRIER JET / TOMCAT / SWING WING tabs and persists the
 * choice itself under storageKey('revforge.pack.carrier-jet.variant'), so no variant /
 * onVariantChange is passed.
 * Drive window (Wilson): the FULL signed-off board, laid out to fit — never the skin's essential
 * (compact) layout, which drops the look tabs, the right card, the engine strips and the AB ladder.
 * So in drive-window mode the mount asks for compact={false} and does not flag the HUD as
 * drive-window (the skin maps driveWindow → essential layout); its own drive-window state is
 * data-box="drive" (carrier-jet-mount.css), not data-drive-window, which the skin also reads.
 * data-rf-layout (packs/layout.ts): 'board' / 'window' label today's desktop / drive-window behaviour;
 * 'portrait' (coarse, ≤500 wide, tall) renders the same full drive-window board; 'phone-landscape'
 * (coarse, ≤500 tall, ≥1.6:1) the full board unscaled, for Visual Skins' native 16:9 CSS. Both phone
 * layouts pad by env(safe-area-inset-*) (carrier-jet-mount.css).
 * abZone: Audio's getAfterburnerZone / onAfterburnerZoneChange when the live engine has them
 * (feature-detected in audioBridge, read via useSyncExternalStore); otherwise undefined and the skin
 * derives the zone from load, then throttle.
 * heading (packs/heading.ts): GPS course from the app's one geolocation watch (coords.heading, else
 * the two-fix bearing), or the phone compass while it reports fresh data; held once known, throttled
 * (≤ 4 Hz, ≥ 1°). Parked (no live source): the last live heading, saved to localStorage (≤ 1 write / 5 s) and
 * restored on load, goes to the HUD with headingStale (Visual Skins' dimmed heading + NEEDS MOTION chip); no saved
 * value keeps '---' with the chip. iOS compass permission is the COMPASS switch in the CJ switch row (CjNavRow).
 * Afterburner guard (Visual Skins' CarrierJetAfterburnerGuard): guardOpen is UI state (closed on load);
 * ARM persists (packs/abArmed.ts) and goes to the engine as an 'ab-armed' pack engine command, the same
 * runtime bus the AB zone comes back on. Compact strip; placement below — carrier-jet-controls.css.
 * Bottom control bank (Wilson, Oct 16): one panel `.cjm-bank` = afterburner guard (left, nearest a left-hand
 * driver) + the CJ switch row (CjNavRow portals itself into the bank's nav slot via setCjNavSlot) once the
 * drive dock exists (after IGNITION; before it the row stays in the top bar as before). Placement:
 *  - board / window (Tesla): portaled into .rev-dock between Hold to rev and Shutdown (≥ 24px clear of
 *    Shutdown); the board reflows into ALL the space between the top bar and the bank (no scale()).
 *    Drive window: the row sits on a tier above the guard, clear of the demo throttle card.
 *  - portrait (Option A scroll): portaled to the end of .rev-viewport, below the dock: row, then guard.
 *  - phone-landscape: the 68px strip at the bottom of the board's box: guard, then row.
 * The bank is a plain slot pair (.cjm-bank-ab / .cjm-bank-nav) so new bottom-panel art can replace it.
 */
export function CarrierJetMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const abZone = useSyncExternalStore(subscribePackAbZone, readPackAbZone, () => undefined);
  const driveWindow = !!props.driveWindow;
  const layout = useRfLayout(driveWindow);
  const fullBoard = driveWindow || layout === 'portrait' || layout === 'phone-landscape';
  // Drive window: always the full board (explicit false, so neither the host's compact request nor
  // the skin's 'auto' size threshold swaps in the essential layout). Elsewhere an explicit host
  // request forces compact, otherwise the skin decides from its own size (full at 1280×800).
  const compact: boolean | 'auto' = fullBoard ? false : props.compact === true ? true : 'auto';
  // stale: no live GPS / compass heading; the HUD gets the held or saved value and dims it (NEEDS MOTION).
  const { heading, stale: headingStale } = useHeading(layout);
  const armed = useSyncExternalStore(subscribeAbArmed, getAbArmed, getAbArmed);
  const [guardOpen, setGuardOpen] = useState(false);
  const onArm = () => {
    const next = !armed;
    setAbArmed(next);
    sendPackEngineCommand(ID.id, { type: 'ab-armed', armed: next });
  };
  // Tesla / desktop (board, drive window) and portrait (portaled outside any data-rf-layout ancestor): the
  // skin's compact strip, every element shown; phone-landscape: 'auto' (resolves to compact).
  const guardVariant = layout === 'phone-landscape' ? 'auto' : 'compact';
  // Where the bank lives: the drive dock (Tesla), below the dock (portrait) or the board's own strip
  // (phone-landscape). The dock is ForgePage's and appears after IGNITION, so watch the viewport for it.
  const [vp, setVp] = useState<{ viewport: HTMLElement | null; dock: HTMLElement | null }>({ viewport: null, dock: null });
  useLayoutEffect(() => {
    const viewport = ref.current?.closest<HTMLElement>('.rev-viewport') ?? null;
    const read = () => {
      const dock = viewport?.querySelector<HTMLElement>(':scope > .rev-dock') ?? null;
      setVp((p) => (p.viewport === viewport && p.dock === dock ? p : { viewport, dock }));
    };
    read();
    if (!viewport || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(read);
    mo.observe(viewport, { childList: true });
    return () => mo.disconnect();
  }, [ref]);
  const tesla = layout === 'board' || layout === 'window';
  const bankHost = tesla ? vp.dock : layout === 'portrait' ? vp.viewport : null;
  // The row joins the bank only once the dock exists (after IGNITION), wherever the bank sits.
  const [navSlot, setNavSlot] = useState<HTMLDivElement | null>(null);
  const docked = !!vp.dock;
  useLayoutEffect(() => {
    if (!docked || !navSlot) return;
    setCjNavSlot(navSlot);
    return () => setCjNavSlot(null, navSlot);
  }, [docked, navSlot]);
  // Drive window: the row tier above the guard must stay left of the demo throttle card (--cjm-nav-w).
  const bankRef = useRef<HTMLDivElement>(null);
  const viewport = vp.viewport;
  useLayoutEffect(() => {
    const bankEl = bankRef.current;
    if (!bankEl || !viewport || layout !== 'window' || !docked) return;
    const fit = () => {
      const t = viewport.querySelector<HTMLElement>(':scope > .rev-throttle');
      const nav = bankEl.querySelector<HTMLElement>(':scope > .cjm-bank-nav');
      const tr = t?.getBoundingClientRect();
      const nr = nav?.getBoundingClientRect();
      // only when the card shares the row tier's height band
      if (!tr || !nr || tr.bottom <= nr.top || tr.top >= nr.bottom) return bankEl.style.removeProperty('--cjm-nav-w');
      const w = Math.floor(tr.left - 8 - bankEl.getBoundingClientRect().left);
      bankEl.style.setProperty('--cjm-nav-w', `${Math.max(0, w)}px`);
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(viewport);
    ro?.observe(bankEl);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(fit);
    mo?.observe(viewport, { childList: true });
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      bankEl.style.removeProperty('--cjm-nav-w');
    };
  }, [layout, docked, viewport]);
  const guard = <CarrierJetAfterburnerGuard armed={armed} guardOpen={guardOpen} onArm={onArm} onGuardToggle={() => setGuardOpen((o) => !o)} variant={guardVariant} />;
  const bank = (
    <div ref={bankRef} className="cjm-bank" data-rf-layout={layout} data-cjm-bank={docked ? 'docked' : undefined}>
      <div className="cjm-bank-ab">{guard}</div>
      <div className="cjm-bank-nav" ref={setNavSlot} />
    </div>
  );
  return (
    <div
      ref={ref}
      className="rf-pack-fit cjm"
      data-pack={ID.id}
      data-box={driveWindow ? 'drive' : undefined}
      data-rf-layout={layout}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="cjm-fill">
        <CarrierJetHud {...props} compact={compact} driveWindow={false} abZone={abZone} heading={heading} headingStale={headingStale} />
      </div>
      {bankHost ? createPortal(layout === 'portrait' ? <div className="cjm-below">{bank}</div> : bank, bankHost) : layout !== 'portrait' && <div className="cjm-ab">{bank}</div>}
    </div>
  );
}
