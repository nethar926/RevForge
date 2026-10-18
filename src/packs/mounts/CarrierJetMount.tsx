import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useCjBank } from './useCjBank';
import { createPortal } from 'react-dom';
import { CarrierJetAfterburnerGuard, CarrierJetHud, useCarrierJetVariant } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { readPackAbZone, requestPackShell, sendPackEngineCommand, subscribePackAbZone } from '../runtime';
import { ShutdownGuard } from '../../skins/carrier-jet';
import { SeatBeltLamp } from '../../skins/carrier-jet/concept/SeatBeltLamp';
import { bankRowOn, sbLampAria, sbLampShown, sdGuardShown } from '../carrier-jet/seatbeltLamp';
import { playGuardCue, sdCoverTap, sdEngineStopped, sdLever, sdShown, type ShutdownGuardDeps } from '../carrier-jet/shutdownGuard';
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
import { cjMapFirst } from '../carrier-jet/geometry';
import { CJ_GRID } from '../carrier-jet/cells';
import { gridFitArgs } from '../grid/contract';
import { getPackJet, subscribePackJet } from '../jetBridge';
import { LAUNCH_OFF, launchAbZone, launchStep, readLaunchActive } from '../carrier-jet/launchLight';

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
  // the fit box CJ declares on the shared grid (CJ_GRID.fit: 1280 wide, 520..740 tall, 720 off the Drive stage)
  const { ref, fit } = useFitBox(...gridFitArgs(CJ_GRID));
  const abZoneAudio = useSyncExternalStore(subscribePackAbZone, readPackAbZone, () => undefined);
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
  // Map-first (Wilson-approved, Meghan's mock): the layout on the Tesla layouts (board / window) in Drive and in Park
  // (square-map rule, Oct 17: Park is laid out like Drive). The MAP column is sized square by CjV2Layer
  // (--cjv2-map-side); the one MapLibre map resizes from its own ResizeObserver (CjLiveMap), no remount.
  const mapFirst = cjMapFirst({ v2, tesla });
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  const sysReduced = useSyncExternalStore(subSysReduced, readSysReduced, () => false);
  const reduced = reducedMotion(prefs, sysReduced || !props.motion);
  // VDI bank from GPS turn rate (same v·ω/g as the ACCEL ball), ±30°, 0 below 3 mph / stale; Reduce Motion snaps
  const vdiBank = useCjBank(true, !!props.demo, reduced);
  const cold = useColdStart({ park, mode: prefs.startMode, reduced, tesla });
  // carrier-launch AB light (launchLight.ts): poll Dan's getLaunchActive() on the HUD tick (every render; no rAF)
  const jetApi = useSyncExternalStore(subscribePackJet, getPackJet, getPackJet);
  const [launch, setLaunch] = useState(LAUNCH_OFF);
  const launchActive = readLaunchActive(jetApi, props.running);
  useEffect(() => setLaunch((p) => launchStep(p, launchActive)), [launchActive]);
  const abZone = launchAbZone(abZoneAudio, launch.lit); // a launch lights the AB readouts like normal AB
  // Guarded SHUTDOWN (Meghan's ShutdownGuard; shutdownGuard.ts): cover = UI state, closed on load, not persisted
  const [sdOpen, setSdOpen] = useState(false);
  const sdDeps: ShutdownGuardDeps = {
    cue: (c) => playGuardCue(jetApi, getCjPrefs().switchSound, c),
    shutdown: () => void requestPackShell({ type: 'shutdown' }),
  };
  useEffect(() => setSdOpen((o) => sdEngineStopped(o, props.running, sdDeps)), [props.running]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // launch: the skin's AB ARMED plate reads LAUNCH via .cjm-bank[data-ab-launch] (carrier-jet-controls.css; no skin edit)
  const guard = <CarrierJetAfterburnerGuard armed={armed} guardOpen={guardOpen} onArm={onArm} onGuardToggle={() => setGuardOpen((o) => !o)} variant={guardVariant} />;
  const sdShow = sdShown({ v2, tesla, docked: !!vp.dock, running: props.running });
  // Meghan's sheet panel 6: with the cold start on, the guarded SHUTDOWN goes (EMER STOP PULL + the cold-start steps
  // cover stopping). The SEAT BELT lamp (panel 5) shows whenever the cold start is on, engine running or not, Park or
  // Drive (seatbeltLamp.ts). Cold start off: guarded SHUTDOWN as before.
  const sbCtx = { coldOn, spds, docked: !!vp.dock };
  const sbLamp = sbLampShown(sbCtx) ? (
    <div className="cjm-sbl" data-rf-layout={layout} data-sd-off={sdShow || undefined} role="img" aria-label={sbLampAria(cold.seatbelt)}>
      <div aria-hidden="true"><SeatBeltLamp on={cold.seatbelt} /></div>
    </div>
  ) : null;
  // Bottom row (Meghan's spec + Wilson's layout, Oct 18; William's gate): Tesla with the cold start on = ONE even row
  // along the bottom edge, DOM = visual = VoiceOver order, left (driver) to right: GPS/RADAR plate · AFTERBURNER
  // (MASTER ARM guard) · [host chips] · EMER STOP · QUICK START · FASTEN SEAT BELT · SHELF. Every size, 773 included.
  // Spacing / heights in carrier-jet-v2.css.
  const row = bankRowOn({ spds, coldOn, docked: !!vp.dock });
  const shelf = coldOn && <div className="cjm-bank-shelf">{cold.render.shelfKey(layout === 'board' ? 'wide' : 'narrow')}</div>;
  const bank = (
    <div ref={bankRef} className="cjm-bank" data-rf-layout={layout} data-ab-launch={launch.lit || undefined} data-launch-motion={reduced ? 'static' : 'live'} data-rf-reduce-motion={reduced || undefined} data-cjm-bank={docked ? 'docked' : undefined} data-cjm-v2={v2 || undefined} data-cjm-row={row || undefined}>
      {plate}
      <div className="cjm-bank-ab">{guard}</div>
      {row ? null : spds ? shelf : <div className="cjm-bank-nav" ref={setNavSlot} />}
    </div>
  );
  const shutdownGuard = sdGuardShown(sdShow, sbCtx) ? (
    <div className="cjm-sdg" data-rf-layout={layout}>
      <ShutdownGuard guardOpen={sdOpen} onGuardToggle={() => setSdOpen((o) => sdCoverTap(o, sdDeps))} on={props.running} onToggle={() => setSdOpen((o) => sdLever(o, props.running, sdDeps).open)} reduceMotion={reduced} />
    </div>
  ) : null;
  const bankB = row ? (
    <div ref={bankBRef} className="cjm-bank-b" data-rf-layout={layout} data-rf-reduce-motion={reduced || undefined} data-cjm-row>
      {/* EMER STOP: Meghan's wide pull (76 px, caption 'EMER STOP' in full) at every size; the narrow one reads 'EMER' */}
      <div className="cjm-bank-es" role="group" aria-label="Engine start and stop">
        {cold.render.pullQs(layout === 'board' ? 'wide' : 'narrow', 'wide')}
      </div>
      {sbLamp}
      {shelf}
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
      data-cj-mapfirst={mapFirst ? 'drive' : undefined}
      style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}
    >
      {/* CJ v3: GPS-only heading (~1 Hz in the car) eased on the shortest arc between fixes; Reduce Motion snaps. */}
      <CjHeadingEase heading={heading} ease={v2 && !reduced}>
        {(h) => (
          <>
            <div className="cjm-fill">
              <CarrierJetHud {...props} compact={compact} driveWindow={false} abZone={abZone} heading={h} headingStale={headingStale} bank={vdiBank} />
            </div>
            {v2 && <CjV2Layer layout={layout} park={park} demo={props.demo} motion={props.motion} heading={h} headingStale={headingStale} unit={props.unit} />}
          </>
        )}
      </CjHeadingEase>
      {spds && coldOn && cold.render.shelf(layout === 'board' ? 'wide' : 'narrow')}
      {coldOn && <p className="cjcs-say" role="status" aria-live="polite">{cold.say}</p>}
      <p className="rf-sr-only cjm-launch-say" role="status" aria-live="polite">{launch.say}</p>
      {bankB && vp.dock && createPortal(bankB, vp.dock)}
      {shutdownGuard && vp.dock && createPortal(shutdownGuard, vp.dock)}
      {bankHost ? createPortal(layout === 'portrait' ? <div className="cjm-below">{bank}</div> : bank, bankHost) : layout !== 'portrait' && <div className="cjm-ab">{bank}</div>}
    </div>
  );
}
