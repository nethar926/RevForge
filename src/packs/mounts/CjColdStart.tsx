/**
 * CJ v3 cold start (preview only, FEATURES.cjV2; Tomcat engine with Dan's cold-start API via packs/jetBridge).
 * Host side of Meghan's parts (src/skins/carrier-jet/parts): the Park-only switch shelf over the board, the checklist
 * pamphlet on the shelf, the SHELF key, the EMER STOP PULL handle and the guarded QUICK START.
 *  - State machine / lockouts / step numbers: packs/carrier-jet/coldStart.ts (pure). PULL gesture: pullGesture.ts.
 *  - Park: speed ≤ 0.5 for 1.5 s; leaving Park: speed > 2 (parkStep). The full sequence runs only in Park, but the
 *    shelf is reachable at all times: SHELF toggles it in Park or Drive; it tucks away once on the shift into Drive and
 *    once on completing in Park (shelfAutoClose), never repeatedly. Leaving Park mid-sequence auto-finishes (jetQuickStart),
 *    and QUICK START works while driving, so the engine is never locked out.
 *  - Hold switches (APU START, L / R ENG) start on a tap (VoiceOver-safe) and show CRANK / busy until READY / RUN.
 *  - PULL fires only on a ≥ 40 px pull of the grip (pointer captured) or the VoiceOver "Emergency stop" button; a tap
 *    never fires. It is never an edge key.
 *  - Reduce Motion: the shelf appears (no slide) and the pamphlet goes straight to the open card.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { ApuBlock, GndAirBlock, PullHandle, QuickStartGuard, SwitchShelf } from '../../skins/carrier-jet/parts/index';
import type { CjShelfOpen, CjToggleState } from '../../skins/carrier-jet/parts/index';
import type { JetCue, JetSystem } from '../../audio/types';
import { getPackJet, subscribePackJet } from '../jetBridge';
import { csCoverNext, csEngineMode, csFromJet, csHoldStart, csTap, csVariant, csView, CS_DARK, CS_PARK_REASON, parkStep, PARK_DWELL_MS, shelfAutoClose, shelfAutoStep, shelfStartLit, shelfToggle, SHELF_START_ARIA, type CsGuardId, type CsInput, type CsMode, type CsSystems, type ParkState } from '../carrier-jet/coldStart';
import { PULL_REST, pullAction, pullDown, pullMove, pullUp, type PullResult, type PullState } from '../carrier-jet/pullGesture';
import { getCjPrefs, setCjPrefs, subscribeCjPrefs } from '../carrier-jet/cjPrefs';
import { ckPlan, ckTitle } from '../carrier-jet/checklistModes';
import { hostCueFor } from '../carrier-jet/hostCues';
import { MasterCaution } from '../../skins/carrier-jet/concept/MasterCaution';
import { CjPamphlet, type CkPage } from './CjPamphlet';

/** Park from the HUD speed (one source of truth for the cold start AND CONFIG's Park-only tiles). */
export function useCjPark(speedMph: number): boolean {
  const [st, setSt] = useState<ParkState>(() => parkStep({ park: false, stillSince: null }, speedMph, Date.now() - PARK_DWELL_MS));
  const next = parkStep(st, speedMph, Date.now());
  const changed = next.park !== st.park || next.stillSince !== st.stillSince;
  useEffect(() => {
    if (changed) setSt(next);
  });
  useEffect(() => {
    if (st.park || st.stillSince === null) return;
    const t = setTimeout(() => setSt((p) => parkStep(p, speedMph, Date.now())), Math.max(0, st.stillSince + PARK_DWELL_MS - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [st, speedMph]);
  return next.park;
}

interface Snap { cold: boolean; sys: CsSystems; auto: boolean }
const NO_SNAP: Snap = { cold: false, sys: CS_DARK, auto: false };
const HOLD_IDS = new Set(['engL', 'engR']);

export type PamphletPhase = 'closed' | 'lift' | 'stand' | 'open';

export interface ColdStart {
  /** Cold start available (Tomcat engine with cold start on). false: no cold-start controls at all. */
  on: boolean;
  park: boolean;
  live: boolean;
  shelf: CjShelfOpen;
  toggleShelf(): void;
  quickStart(): void;
  pamphlet: PamphletPhase;
  setPamphlet(open: boolean): void;
  say: string;
  /** SEAT BELT sign on (Dan's seatbelt system), for the dash lamp. */
  seatbelt: boolean;
  render: {
    shelf: (size?: 'wide' | 'narrow') => ReactElement | null;
    shelfKey: (size: 'wide' | 'narrow') => ReactElement | null;
    pullQs: (size: 'wide' | 'narrow') => ReactElement | null;
  };
}

export function useColdStart({ park, mode, reduced, tesla = false }: { park: boolean; mode: CsMode; reduced: boolean; tesla?: boolean }): ColdStart {
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  const api = useSyncExternalStore(subscribePackJet, getPackJet, () => null);
  const [snap, setSnap] = useState<Snap>(NO_SNAP);
  useEffect(() => {
    if (!api) return setSnap(NO_SNAP);
    let last = '';
    const read = () => {
      try {
        const st = api.getJetSystems();
        const n: Snap = { cold: !!st.coldStart && api.getJetColdStart(), sys: csFromJet(st), auto: !!st.autoRunning };
        const k = JSON.stringify(n);
        if (k !== last) {
          last = k;
          setSnap(n);
        }
      } catch {
        setSnap(NO_SNAP);
      }
    };
    read();
    const off = api.onJetSystemChange(read);
    const t = setInterval(read, 250); // spool levels (APU / cart / engines) change without an event
    return () => {
      off();
      clearInterval(t);
    };
  }, [api]);
  // ENGINE STARTUP (CONFIG › OPT): the engine's own sequence follows the setting (also sent by audioBridge on load).
  useEffect(() => {
    try {
      api?.setJetStartMode(csEngineMode(mode));
    } catch {
      /* engine not ready */
    }
  }, [api, mode]);

  const variant = csVariant(mode);
  const list = api?.getJetSystemList?.(variant) ?? [];
  const checklist = api?.getJetChecklist?.(variant) ?? { startup: [], shutdown: [] };
  const [guards, setGuards] = useState<Partial<Record<CsGuardId, boolean>>>({});
  const [cautionReset, setCautionReset] = useState(false);
  const [shelf, setShelf] = useState<CjShelfOpen>('closed');
  const [pamphlet, setPamphletPhase] = useState<PamphletPhase>('closed');
  /** Pamphlet page picked on its tabs (null: the current step's phase); forgotten when the pamphlet closes. */
  const [page, setPage] = useState<CkPage | null>(null);
  const [qsOpen, setQsOpen] = useState(false);
  const [pull, setPull] = useState<PullState>(PULL_REST);
  const [say, setSay] = useState('');
  const sys = snap.sys;
  const on = !!api && snap.cold && list.length > 0;
  const inp: CsInput = { list, checklist: checklist.startup, mode, sys, guards, held: null, park, cautionReset, auto: snap.auto };
  const view = csView(inp);
  const live = view.live;

  const cue = (c: JetCue) => {
    if (!getCjPrefs().switchSound) return;
    try {
      api?.playJetCue(c);
    } catch {
      /* engine not ready */
    }
  };
  const set = (id: string, v: boolean) => {
    try {
      api?.setJetSystem(id as JetSystem, v);
    } catch {
      /* engine not ready */
    }
    // named cue hooks for Dan (hostCues.ts): seat belt ON → seatbeltTone, O2 ON → o2Chimes (unknown to his voice = silent)
    const hc = hostCueFor(id, v);
    if (hc) cue(hc as unknown as JetCue);
  };
  const announce = (t: string) => setSay(t);
  useEffect(() => {
    if (!say) return;
    const t = setTimeout(() => setSay(''), 4000);
    return () => clearTimeout(t);
  }, [say]);

  // dark cockpit → covers down, caution reset forgotten
  useEffect(() => {
    if (sys.on.batt || sys.engines.L !== 'off' || sys.engines.R !== 'off') return;
    setCautionReset(false);
    setGuards({});
  }, [sys.on.batt, sys.engines.L, sys.engines.R]);
  // Shelf auto-close (shelfAutoClose): edges only (shift into Drive, completion in Park), never repeatedly; SHELF reopens it.
  // (Was: closed whenever out of Park or both engines ran, level-triggered, so after step 12 it shut and SHELF couldn't hold it open.)
  const prevShelfCtx = useRef({ park, complete: view.complete });
  useEffect(() => {
    const prev = prevShelfCtx.current;
    prevShelfCtx.current = { park, complete: view.complete };
    if (shelfAutoClose(prev, { park, complete: view.complete, on }) && shelf !== 'closed') {
      setShelf('closed');
      setPamphletPhase('closed');
    }
  }, [park, view.complete, on]); // eslint-disable-line react-hooks/exhaustive-deps
  // discoverability (Tesla): auto-open once per Park entry with the engines off (Options › AUTO SHELF); first start
  // done → the SHELF key's START legend goes out for good
  const autoArmed = useRef(true);
  useEffect(() => {
    const r = shelfAutoStep(autoArmed.current, { park, live, on, auto: prefs.shelfAutoOpen, tesla });
    autoArmed.current = r.armed;
    if (r.open && shelf === 'closed') setShelf('opening');
  }, [park, live, on, prefs.shelfAutoOpen, tesla]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (on && live && !prefs.cjFirstStartDone) setCjPrefs({ cjFirstStartDone: true });
  }, [on, live, prefs.cjFirstStartDone]);
  useEffect(() => {
    if (shelf !== 'opening') return;
    const t = setTimeout(() => setShelf('open'), reduced ? 0 : 300);
    return () => clearTimeout(t);
  }, [shelf, reduced]);
  // leaving Park mid-sequence: auto-finish (NOTES decision 6, proposed) so the engine is never left half-started
  const prevPark = useRef(park);
  useEffect(() => {
    const was = prevPark.current;
    prevPark.current = park;
    if (!was || park || !on || live) return;
    const started = ['batt', 'apu', 'aircart', 'engL', 'engR'].some((k) => sys.on[k]) || sys.engines.L !== 'off' || sys.engines.R !== 'off';
    if (started) {
      try {
        api?.jetQuickStart?.();
      } catch {
        /* engine not ready */
      }
      announce('Left Park: finishing the start');
    }
  }, [park]); // eslint-disable-line react-hooks/exhaustive-deps
  // pamphlet: flat → rotates up (~400 ms) → pause (~600 ms) → open; Reduce Motion: straight to open
  useEffect(() => {
    if (pamphlet === 'lift') {
      const t = setTimeout(() => setPamphletPhase('stand'), 400);
      return () => clearTimeout(t);
    }
    if (pamphlet === 'stand') {
      const t = setTimeout(() => {
        cue('pamphletOpen');
        setPamphletPhase('open');
      }, 600);
      return () => clearTimeout(t);
    }
  }, [pamphlet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pamphlet === 'closed') setPage(null);
  }, [pamphlet]);
  const setPamphlet = (open: boolean) => {
    if (open) {
      cue('pamphletLift');
      setPamphletPhase(reduced ? 'open' : 'lift');
    } else {
      cue('pamphletClose');
      setPamphletPhase('closed');
    }
  };
  // PULL: latched STOPPED returns to rest once the stop has run down
  useEffect(() => {
    if (pull.phase !== 'fired' || sys.emergency || sys.engines.L !== 'off' || sys.engines.R !== 'off') return;
    const t = setTimeout(() => setPull(PULL_REST), 1500);
    return () => clearTimeout(t);
  }, [pull.phase, sys.emergency, sys.engines.L, sys.engines.R]);
  useEffect(() => {
    if (live) setQsOpen(false);
  }, [live]);

  const toggleShelf = () => {
    cue('toggle');
    setShelf(shelfToggle);
    if (shelf !== 'closed') setPamphletPhase('closed');
  };
  const onToggle = (id: string, next: CjToggleState) => {
    const want = next !== 'off';
    const hold = HOLD_IDS.has(id) || (id === 'apu' && mode === 'apu');
    const it = hold && want ? csHoldStart(id, inp) : csTap(id, want, inp);
    if (it.type === 'set') {
      set(it.system, it.on);
      if (it.system === 'masterCaution') setCautionReset(true);
    } else if (it.type === 'none') announce(`${view.switches[id]?.name ?? id}: ${it.reason}`);
  };
  const onGuard = (id: string) => {
    if (!park) return announce(`${id === 'apuGuard' ? 'APU arm' : id === 'engL' ? 'L engine' : 'R engine'} guard: ${CS_PARK_REASON}`);
    const g = id as CsGuardId;
    const open = !guards[g];
    cue(open ? 'guardOpen' : 'guardClose');
    setGuards((p) => ({ ...p, [g]: open }));
  };
  const quickStart = () => {
    setShelf('closed');
    try {
      if (api?.jetQuickStart) api.jetQuickStart();
      else {
        set('quickStartGuard', true);
        set('quickStart', true);
      }
    } catch {
      /* engine not ready */
    }
    announce('Quick start running');
  };
  const applyPull = (r: PullResult, el?: HTMLElement | null, pid?: number) => {
    setPull(r.state);
    for (const e of r.effects) {
      if (e === 'capture' && el && pid !== undefined) el.setPointerCapture?.(pid);
      if (e === 'release' && el && pid !== undefined && el.hasPointerCapture?.(pid)) el.releasePointerCapture(pid);
      if (e === 'detent') cue('detent');
      if (e === 'fire') {
        try {
          api?.jetEmergencyStop();
        } catch {
          /* engine not ready */
        }
        announce('Emergency stop');
      }
    }
  };
  // The pamphlet card lies on the shelf in measured free space (Meghan's shelf lays its groups out from the list, so
  // the free space moves with the mode and the box): first the bay right of row 1's last group, else the strip above
  // row 1's right-hand groups (beside the header annunciators), else the panel corner.
  const shelfRef = useRef<HTMLDivElement>(null);
  type Bay = { at: 'row1' | 'head'; left: number; top: number; width: number; height: number };
  const [bay, setBay] = useState<Bay | null>(null);
  useLayoutEffect(() => {
    const host = shelfRef.current;
    if (!host || shelf === 'closed') return;
    let dead = false;
    const read = () => {
      if (dead) return;
      const o = host.getBoundingClientRect();
      const row = host.querySelector<HTMLElement>('.cjp-shelf-row');
      const groups = row ? [...row.querySelectorAll<HTMLElement>(':scope > .cjp-group')].map((g) => g.getBoundingClientRect()) : [];
      const panel = host.querySelector<HTMLElement>('.cjp-shelf-panel')?.getBoundingClientRect();
      const head = host.querySelector<HTMLElement>('.cjp-shelf-head');
      if (!groups.length || !panel || !head) return setBay(null);
      const right = panel.right - 14;
      const last = groups[groups.length - 1];
      let n: Bay | null = null;
      if (right - (last.right + 8) >= 92) n = { at: 'row1', left: last.right + 8 - o.left, top: last.top - o.top, width: Math.min(132, right - last.right - 8), height: Math.min(123, last.height) };
      else {
        const used = [...head.children].reduce((m, e) => Math.max(m, e.getBoundingClientRect().right), head.getBoundingClientRect().left);
        const top = head.getBoundingClientRect().top - 2;
        // start right of the header text and of any row-1 group that rises too close under the header
        const x0 = groups.filter((g) => g.top - 4 - top < 46).reduce((m, g) => Math.max(m, g.right + 8), used + 10);
        const under = groups.filter((g) => g.right > x0 && g.left < right).reduce((m, g) => Math.min(m, g.top), panel.bottom);
        if (right - x0 >= 120 && under - 4 - top >= 46) n = { at: 'head', left: x0 - o.left, top: top - o.top, width: Math.min(200, right - x0), height: Math.min(64, under - 4 - top) };
      }
      setBay((p) => (p && n && p.at === n.at && Math.abs(p.left - n.left) < 0.5 && Math.abs(p.width - n.width) < 0.5 && Math.abs(p.top - n.top) < 0.5 && Math.abs(p.height - n.height) < 0.5 ? p : n));
    };
    queueMicrotask(read);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => queueMicrotask(read));
    ro?.observe(host);
    return () => {
      dead = true;
      ro?.disconnect();
    };
  }, [shelf, mode]);
  // MASTER CAUTION (sheet panel 4) replaces CAUT RST in place: the skin cell stays for the layout, hidden
  // (data-mc on the host, mount CSS), and Meghan's 64×64 push button sits centred on it.
  const [mcAt, setMcAt] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const host = shelfRef.current;
    if (!host || shelf === 'closed') return;
    let dead = false;
    const read = () => {
      if (dead) return;
      const o = host.getBoundingClientRect();
      const r = host.querySelector<HTMLElement>(".cjp-cell:has(> .cjp-toggle[data-sys='masterCaution'])")?.getBoundingClientRect();
      const n = r ? { left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height } : null;
      setMcAt((p) => (p && n && Math.abs(p.left - n.left) < 0.5 && Math.abs(p.top - n.top) < 0.5 && Math.abs(p.width - n.width) < 0.5 && Math.abs(p.height - n.height) < 0.5 ? p : n));
    };
    queueMicrotask(read);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => queueMicrotask(read));
    ro?.observe(host);
    return () => {
      dead = true;
      ro?.disconnect();
    };
  }, [shelf, mode]);
  const pamphRef = useRef<HTMLDivElement>(null);
  // centre the current line inside the card's own scroll only (the page tabs stay put; the browser's into-view scroll would also
  // scroll the pamphlet's clipped ancestors, which is how the tabs used to slide up to "E-START" at 773)
  useEffect(() => {
    if (pamphlet !== 'open') return;
    const card = pamphRef.current?.querySelector<HTMLElement>('.ckp-card');
    const li = card?.querySelector<HTMLElement>('.ckp-li[aria-current="step"]');
    if (!card || !li) return;
    const c = card.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    card.scrollTop += r.top - c.top - (c.height - r.height) / 2;
  }, [pamphlet, view.cursor, page]);
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const grip = {
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullDown(pullRef.current, e.pointerId, e.clientY, e.isPrimary), e.currentTarget, e.pointerId),
    onPointerMove: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullMove(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerCancel: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId), e.currentTarget, e.pointerId),
    onLostPointerCapture: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId)),
  };

  const shelfEl = (size: 'wide' | 'narrow' = 'wide') => {
    if (!on) return null;
    const block = mode === 'apu'
      ? <ApuBlock arm={view.apu.arm} start={view.apu.start} ready={view.apu.ready} onArmToggle={() => onGuard('apuGuard')} onStartToggle={(_id, n) => onToggle('apu', n)} disabled={view.apu.disabled} disabledReason={view.apu.disabledReason} step={view.apu.step} legend={view.apu.parkLegend ? 'PARK' : undefined} />
      : <GndAirBlock aircart={view.gndAir.aircart} crossbleed={view.gndAir.crossbleed} side={view.gndAir.side} onToggle={(id, n) => onToggle(id, n)} disabledReasons={view.gndAir.disabledReasons} steps={view.gndAir.steps} />;
    const step = view.checklist;
    const coverNext = csCoverNext(view, inp);
    const plan = ckPlan(mode);
    return (
      <div ref={shelfRef} className="cjcs-shelf" data-mc={mcAt ? '' : undefined} data-cue-apu={mode === 'apu' ? view.apu.cue : undefined} data-cue-aircart={mode === 'apu' ? undefined : view.gndAir.cues.aircart} data-cue-crossbleed={mode === 'apu' ? undefined : view.gndAir.cues.crossbleed} data-open={shelf} data-motion={reduced ? 'static' : 'live'} data-rf-reduce-motion={reduced || undefined}>
        <SwitchShelf systems={list} switches={view.switches} onToggle={onToggle} guards={{ engL: !!guards.engL, engR: !!guards.engR }} onGuardToggle={onGuard} mode={mode} block={block} open={shelf} annunciators={view.annunciators} />
        {shelf !== 'closed' && (
          <button type="button" className="cjcs-card" data-bay={bay?.at ?? 'corner'} style={bay ? { left: bay.left, top: bay.top, width: bay.width, height: bay.height, right: 'auto', bottom: 'auto' } : undefined} aria-haspopup="dialog" aria-expanded={pamphlet !== 'closed'} aria-label={`Pilot checklist${step ? `, step ${step.code.replace(/^(\d+)([a-z])$/, '$1 $2')}, ${step.index} of ${step.total}: ${step.text}` : ''}`} onClick={() => setPamphlet(pamphlet === 'closed')}>
            <small aria-hidden="true">REVFORGE</small>
            <strong aria-hidden="true">PILOT CHECKLIST</strong>
            <small aria-hidden="true">{step ? `STEP ${step.code} · ${step.index}/${step.total}` : live ? 'BOARD LIVE' : 'NORMAL PROCEDURES'}</small>
          </button>
        )}
        {shelf !== 'closed' && mcAt && (
          <div className="cjcs-mc" style={{ left: mcAt.left + mcAt.width / 2, top: mcAt.top + mcAt.height / 2 }}>
            <MasterCaution lit={view.caution.lit} step={view.caution.step} onPress={() => onToggle('masterCaution', 'momentary')} />
          </div>
        )}
        {pamphlet !== 'closed' && (
          <div ref={pamphRef} className="cjcs-pamph" data-phase={pamphlet} data-size={size} role="dialog" aria-modal="false" aria-label="Pilot checklist" onKeyDown={(e) => e.key === 'Escape' && setPamphlet(false)}>
            {pamphlet === 'open' ? (
              <div className="cjcs-pages">
                <div className="cjcs-startup">
                  <CjPamphlet plan={plan} title={ckTitle(mode)} cursor={view.cursor} size={size} page={page ?? undefined} onPage={setPage} />
                  <p>{page === 'SHUTDOWN' ? 'Our own wording · not for real aircraft' : 'Or lift QUICK START and press it once.'}</p>
                </div>
              </div>
            ) : (
              // cover (seen while the card lifts): name, plus the next step's badge code only while a closed guard hides it on the shelf
              <div className="cjcs-cover" aria-hidden="true">
                <small>REVFORGE</small>
                <strong>MATRIX PILOT CHECKLIST</strong>
                {coverNext && <b className="cjcs-cover-next" data-code={coverNext}>NEXT <span>{coverNext}</span></b>}
                <small>NORMAL PROCEDURES</small>
              </div>
            )}
            <button type="button" className="cjcs-pclose" aria-label="Close checklist" onClick={() => setPamphlet(false)}>✕</button>
          </div>
        )}
      </div>
    );
  };
  const shelfKey = (size: 'wide' | 'narrow') => {
    if (!on) return null;
    const legend = shelf === 'closed' ? '▲ OPEN' : '▼ CLOSE';
    const start = shelfStartLit({ on, firstStartDone: prefs.cjFirstStartDone });
    const name = start ? SHELF_START_ARIA : 'Switch shelf';
    return (
      <button type="button" className="cjcs-shelfkey" data-size={size} data-start={start || undefined} data-motion={reduced ? 'static' : 'live'} aria-expanded={shelf !== 'closed'} aria-label={park ? name : `${name}. Switches: ${CS_PARK_REASON}`} onClick={toggleShelf}>
        {start && <span className="cjcs-start" aria-hidden="true">START</span>}
        <strong aria-hidden="true">SHELF</strong>
        <small aria-hidden="true">{legend}</small>
      </button>
    );
  };
  const pullQs = (size: 'wide' | 'narrow') => {
    if (!on) return null;
    return (
      <>
        <div className="cjcs-pull">
          <PullHandle phase={pull.phase} progress={pull.progress} size={size} gripProps={grip} ariaDescription="Pull the handle down past the line to stop the engines. A tap does nothing." />
          {/* VoiceOver / keyboard: the only non-pull path (visually hidden, so a finger can't tap it) */}
          <button type="button" className="cjp-sr" data-cjcs-sr onClick={() => applyPull(pullAction(pullRef.current))}>Emergency stop, stop the engines now</button>
        </div>
        {!live && (
          <div className="cjcs-qs">
            <QuickStartGuard guardOpen={qsOpen} onGuardToggle={() => { cue(qsOpen ? 'guardClose' : 'guardOpen'); setQsOpen((o) => !o); }} onStart={quickStart} running={snap.auto} size={size} />
          </div>
        )}
      </>
    );
  };
  return { on, park, live, shelf, toggleShelf, quickStart, pamphlet, setPamphlet, say, seatbelt: !!sys.on.seatbelt, render: { shelf: shelfEl, shelfKey, pullQs } };
}
