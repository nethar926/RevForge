import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CarrierJetAfterburnerGuard, CarrierJetHud, useCarrierJetVariant } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { readPackAbZone, sendPackEngineCommand, subscribePackAbZone } from '../runtime';
import { getAbArmed, setAbArmed, subscribeAbArmed } from '../abArmed';
import type { PackHudProps } from '../types';
import { useFitBox } from './useFitBox';
import { useRfLayout } from '../layout';
import { useHeading } from '../heading';
import { setCjNavSlot, setCjNavSpds } from './CjNavRow';
import { CjHeadingEase } from './CjHeadingEase';
import './pack-fit.css';
import './carrier-jet-mount.css';
import './carrier-jet-controls.css';
import './carrier-jet-v2.css';
import { FEATURES } from '../../features';
import { GpsRadarPlate } from '../../skins/carrier-jet/parts/index';
import { getGpsStatus, subscribeGpsStatus } from '../../hooks/gpsFixes';
import { cjGps, plateAria } from '../carrier-jet/plate';
import { getMapView, setRadar, subscribeMapView } from '../carrier-jet/mapView';
import { getCjPrefs, reducedMotion, subscribeCjPrefs } from '../carrier-jet/cjPrefs';
import { useCjPark, useColdStart } from './CjColdStart';
import { CjV2Layer } from './CjV2Layer';

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
 * CJ v2 (preview build only, FEATURES.cjV2 → data-cjm-v2; carrier-jet-v2.css): the AB guard is FAR LEFT at every size
 * Meghan's GPS+RADAR plate FAR LEFT (DOM first = VoiceOver first), then one stack: the AB guard on top, the switch row
 * under it (carrier-jet-v2.css grid); Hold to rev and Shutdown to the right;
 * Board 2 re-grids the MATRIX look and CjV2Layer adds ACCEL (GPS), MAP / radar scope, edge keys and CONFIG.
 */
const readSysReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const subSysReduced = (f: () => void) => {
  if (typeof matchMedia === 'undefined') return () => undefined;
  const m = matchMedia('(prefers-reduced-motion: reduce)');
  m.addEventListener?.('change', f);
  return () => m.removeEventListener?.('change', f);
};

export function CarrierJetMount(props: PackHudProps) {
  const { ref, fit } = useFitBox(1280, 520, 740, 720);
  const abZone = useSyncExternalStore(subscribePackAbZone, readPackAbZone, () => undefined);
  const driveWindow = !!props.driveWindow;
  const layout = useRfLayout(driveWindow);
  const fullBoard = driveWindow || layout === 'portrait' || layout === 'phone-landscape';
  // Drive window: always the full board (explicit false, so neither the host's compact request nor
  // the skin's 'auto' size threshold swaps in the essential layout). Elsewhere an explicit host
  // request forces compact, otherwise the skin decides from its own size (full at 1280×800).
  // CJ v2 Board 2 (MATRIX look, board / window): the skin's reflowed board (container-unit sizing), re-gridded by
  // carrier-jet-v2.css; the full 1280 layout's fixed-size blocks do not fit the Board 2 cells.
  const [look] = useCarrierJetVariant();
  const board2 = FEATURES.cjV2 && look === 'carrier-jet' && (layout === 'board' || layout === 'window');
  const compact: boolean | 'auto' = board2 ? true : fullBoard ? false : props.compact === true ? true : 'auto';
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
  // CJ v3 NAV → SPDS (Tesla, preview): no NAV panel in the bank; DRIVE / MORE are right-bank edge keys (CjV2Layer).
  const spds = FEATURES.cjV2 && tesla;
  useLayoutEffect(() => {
    if (!docked || !navSlot || spds) return;
    setCjNavSlot(navSlot);
    return () => setCjNavSlot(null, navSlot);
  }, [docked, navSlot, spds]);
  useLayoutEffect(() => {
    if (!spds || !docked) return;
    setCjNavSpds(true);
    return () => setCjNavSpds(false);
  }, [spds, docked]);
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
      const cb = (nav?.offsetParent as HTMLElement | null) ?? bankEl; // the dock (the bank is unpositioned in the window)
      const w = Math.floor(tr.left - 8 - cb.getBoundingClientRect().left);
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
  const v2 = FEATURES.cjV2;
  // CJ v2 (Tesla): the bank leads the dock line, so it must lead the dock's DOM too (VoiceOver follows the DOM, not
  // CSS order): move the portaled bank to the dock's first child. Same parent, so React's portal bookkeeping holds.
  useLayoutEffect(() => {
    const bankEl = bankRef.current;
    const dock = vp.dock;
    if (!v2 || !tesla || !dock || !bankEl || bankEl.parentElement !== dock) return;
    const lead = () => { if (dock.firstElementChild !== bankEl) dock.prepend(bankEl); };
    lead();
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(lead);
    mo.observe(dock, { childList: true });
    return () => mo.disconnect();
  });
  // CJ v3 cold start: one Park for the shelf and CONFIG's Park-only tiles (≤ 0.5 mph for 1.5 s; leaves above 2).
  const speedMph = props.unit === 'kph' ? props.speed / 1.609344 : props.speed;
  const park = useCjPark(speedMph);
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  const sysReduced = useSyncExternalStore(subSysReduced, readSysReduced, () => false);
  const reduced = reducedMotion(prefs, sysReduced || !props.motion);
  const cold = useColdStart({ park, mode: prefs.startMode, reduced, tesla });
  const coldOn = v2 && cold.on;
  // Phones (no shelf / PULL / QUICK START placement yet): skip the cold start, so the engine is never locked out.
  const coldPhone = coldOn && !tesla && !cold.live;
  useLayoutEffect(() => {
    if (coldPhone) cold.quickStart();
  }, [coldPhone]); // eslint-disable-line react-hooks/exhaustive-deps
  // EMER STOP PULL + QUICK START: a second dock group AFTER Shutdown (Hold to rev must stay directly before Shutdown,
  // whose pair styling is the skin's). Kept last in the dock's DOM, like the bank is kept first.
  const bankBRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bankBRef.current;
    const dock = vp.dock;
    if (!el || !dock || el.parentElement !== dock) return;
    const last = () => { if (dock.lastElementChild !== el) dock.append(el); };
    last();
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(last);
    mo.observe(dock, { childList: true });
    return () => mo.disconnect();
  });
  const gpsStatus = useSyncExternalStore(subscribeGpsStatus, getGpsStatus, getGpsStatus);
  const mapView = useSyncExternalStore(subscribeMapView, getMapView, getMapView);
  const onRadar = (on: boolean) => {
    if (getCjPrefs().switchSound) sendPackEngineCommand(ID.id, { type: 'jet-cue', cue: 'toggle' });
    setRadar(on);
  };
  const plate = v2 ? (
    <div className="cjm-bank-plate" role="group" aria-label={plateAria(props.demo, cjGps(gpsStatus), mapView.radar)}>
      <GpsRadarPlate gps={props.demo ? 'none' : cjGps(gpsStatus)} radarOn={mapView.radar} onRadarToggle={onRadar} size={layout === 'board' ? 'wide' : 'narrow'} />
    </div>
  ) : null;
  const guard = <CarrierJetAfterburnerGuard armed={armed} guardOpen={guardOpen} onArm={onArm} onGuardToggle={() => setGuardOpen((o) => !o)} variant={guardVariant} />;
  const bank = (
    <div ref={bankRef} className="cjm-bank" data-rf-layout={layout} data-cjm-bank={docked ? 'docked' : undefined} data-cjm-v2={v2 || undefined}>
      {plate}
      <div className="cjm-bank-ab">{guard}</div>
      {spds ? coldOn && <div className="cjm-bank-shelf">{cold.render.shelfKey(layout === 'board' ? 'wide' : 'narrow')}</div> : <div className="cjm-bank-nav" ref={setNavSlot} />}
    </div>
  );
  const bankB = spds && coldOn && vp.dock ? (
    <div ref={bankBRef} className="cjm-bank-b" data-rf-layout={layout} role="group" aria-label="Engine start and stop">
      {cold.render.pullQs(layout === 'board' ? 'wide' : 'narrow')}
    </div>
  ) : null;
  return (
    <div
      ref={ref}
      className="rf-pack-fit cjm"
      data-pack={ID.id}
      data-box={driveWindow ? 'drive' : undefined}
      data-rf-layout={layout}
      data-cjm-v2={v2 || undefined}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      {/* CJ v3: GPS-only heading (~1 Hz in the car) eased on the shortest arc between fixes; Reduce Motion snaps. */}
      <CjHeadingEase heading={heading} ease={v2 && !reduced}>
        {(h) => (
          <>
            <div className="cjm-fill">
              <CarrierJetHud {...props} compact={compact} driveWindow={false} abZone={abZone} heading={h} headingStale={headingStale} />
            </div>
            {v2 && <CjV2Layer layout={layout} park={park} demo={props.demo} motion={props.motion} heading={h} headingStale={headingStale} />}
          </>
        )}
      </CjHeadingEase>
      {spds && coldOn && cold.render.shelf()}
      {coldOn && <p className="cjcs-say" role="status" aria-live="polite">{cold.say}</p>}
      {bankB && vp.dock && createPortal(bankB, vp.dock)}
      {bankHost ? createPortal(layout === 'portrait' ? <div className="cjm-below">{bank}</div> : bank, bankHost) : layout !== 'portrait' && <div className="cjm-ab">{bank}</div>}
    </div>
  );
}
