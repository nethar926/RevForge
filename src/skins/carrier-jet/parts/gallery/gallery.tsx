/* Dev-only gallery: every cold-start part in every state. Not linked from the app; open with
 * `npx vite` → /src/skins/carrier-jet/parts/gallery/index.html. */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ApuBlock, BatToggle, BezelKey, GndAirBlock, GpsPlate, GpsRadarPlate, GuardedCover, PullHandle, QuickStartGuard, RadarToggle, SwitchShelf,
  APU_BLOCK_MIN, BEZEL_KEY_MIN, GND_AIR_MIN, GPS_RADAR_PLATE_MIN, GPS_RADAR_PLATE_MIN_NARROW, PLATE_MIN, PLATE_MIN_NARROW, PULL_MIN, PULL_MIN_NARROW,
  QUICK_START_MIN, QUICK_START_MIN_NARROW, RADAR_MIN, RADAR_MIN_NARROW, SHELF_SLOTS, TOGGLE_MIN, GUARDED_TOGGLE_MIN,
  type CjAnnunciator, type CjGps,
} from '../index';
import { CarrierJetAfterburnerGuard } from '../../AfterburnerGuard';
import { jetSystemListFixture, shelfStateApuStep5, shelfStateCartB4 } from './fixtures';

const noop = () => {};
const Item = ({ cap, w, children, id }: { cap: string; w?: number; children: ReactNode; id?: string }) => (
  <div className="gal-item" data-item={id ?? cap}>
    <div className="gal-cap">{cap}</div>
    <div style={{ width: w }}>{children}</div>
  </div>
);
const Panel = ({ children }: { children: ReactNode }) => <div className="gal-panel cjp-metal" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>{children}</div>;
const Sec = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section className="gal-sec" id={id}><h2>{title}</h2><div className="gal-row">{children}</div></section>
);

const tg = { id: 'batt', label: 'BATT', ariaLabel: 'Battery', onToggle: noop } as const;
const anns = (mode: 'apu' | 'gndAir'): CjAnnunciator[] => mode === 'apu'
  ? [{ id: 'apuReady', label: 'APU READY', tone: 'green' }, { id: 'seatbelt', label: 'SEAT BELT', tone: 'white' }, { id: 'gen', label: 'GEN', tone: 'green' }, { id: 'live', label: 'BOARD LIVE', tone: 'off' }]
  : [{ id: 'cart', label: 'AIR CART', tone: 'off' }, { id: 'xb', label: 'X-BLEED', tone: 'amber' }, { id: 'gen', label: 'GEN', tone: 'green' }, { id: 'seatbelt', label: 'SEAT BELT', tone: 'off' }, { id: 'live', label: 'BOARD LIVE', tone: 'off' }];

function Shelf({ mode, open, w, h }: { mode: 'apu' | 'gndAir'; open: 'closed' | 'opening' | 'open'; w: number; h: number }) {
  const list = jetSystemListFixture(mode === 'apu' ? 'apu' : 'aircart');
  const sw = mode === 'apu' ? shelfStateApuStep5(list) : shelfStateCartB4(list);
  const block = mode === 'apu'
    ? <ApuBlock arm start ready="ready" onArmToggle={noop} onStartToggle={noop} step="2·3" />
    : <GndAirBlock aircart={false} crossbleed side="L" onToggle={noop} steps={{ aircart: 7 }} />;
  return (
    <div className="gal-slot" style={{ width: w, height: h }} data-shelf-slot={`${mode}-${w}`}>
      <SwitchShelf systems={list} switches={sw} onToggle={noop} guards={{ engL: true, engR: false }} onGuardToggle={noop} mode={mode} block={block} open={open} annunciators={anns(mode)} />
    </div>
  );
}

function Gallery() {
  const gpsStates: CjGps[] = ['none', 'fail', 'acq', 'live'];
  return (
    <>
      <h1 className="gal-h1">JET · COLD-START PARTS</h1>
      <p className="gal-sub">Production React parts (src/skins/carrier-jet/parts) at their 1× minimum sizes, after the v2 concept sheet. Dev-only gallery, not linked from the app.</p>

      <Sec id="toggles" title="BAT TOGGLE · 60×96">
        <Panel>
          <Item cap="OFF" w={TOGGLE_MIN.w}><BatToggle {...tg} state="off" lit={false} step={1} /></Item>
          <Item cap="NEXT" w={TOGGLE_MIN.w}><BatToggle {...tg} state="off" lit={false} step={1} cue="next" legend="TAP" /></Item>
          <Item cap="ON LIT" w={TOGGLE_MIN.w}><BatToggle {...tg} state="on" lit step={1} /></Item>
          <Item cap="ON UNLIT" w={TOGGLE_MIN.w}><BatToggle {...tg} state="on" lit={false} /></Item>
          <Item cap="MOMENTARY" w={TOGGLE_MIN.w}><BatToggle {...tg} id="engL" label="L ENG" ariaLabel="L engine start" state="momentary" lit cue="busy" legend="CRANK" step={7} /></Item>
          <Item cap="DISABLED" w={TOGGLE_MIN.w}><BatToggle {...tg} id="engR" label="R ENG" ariaLabel="R engine start" state="off" lit={false} disabled disabledReason="Start the left engine first" step={8} /></Item>
          <Item cap="2 LINES" w={TOGGLE_MIN.w}><BatToggle {...tg} id="seatbelt" label="SEAT BELT" ariaLabel="Seat belt sign" state="on" lit /></Item>
          <Item cap="2× SIZE" w={TOGGLE_MIN.w * 2}><BatToggle {...tg} state="on" lit step={1} /></Item>
        </Panel>
      </Sec>

      <Sec id="guarded" title="GUARDED COVER · 60×140 (L/R ENG)">
        <Panel>
          <Item cap="CLOSED" w={GUARDED_TOGGLE_MIN.w}><GuardedCover id="engL" name="L ENG" guardOpen={false} onGuardToggle={noop}><BatToggle id="engL" label="L ENG" ariaLabel="L engine start" state="off" lit={false} onToggle={noop} /></GuardedCover></Item>
          <Item cap="OPEN" w={GUARDED_TOGGLE_MIN.w}><GuardedCover id="engL" name="L ENG" guardOpen onGuardToggle={noop}><BatToggle id="engL" label="L ENG" ariaLabel="L engine start" state="off" lit={false} onToggle={noop} cue="next" legend="TAP" /></GuardedCover></Item>
          <Item cap="OPEN · RUN" w={GUARDED_TOGGLE_MIN.w}><GuardedCover id="engL" name="L ENG" guardOpen onGuardToggle={noop}><BatToggle id="engL" label="L ENG" ariaLabel="L engine start" state="on" lit legend="RUN" onToggle={noop} /></GuardedCover></Item>
          <Item cap="DISABLED" w={GUARDED_TOGGLE_MIN.w}><GuardedCover id="engR" name="R ENG" guardOpen={false} onGuardToggle={noop} disabled disabledReason="Start the left engine first"><BatToggle id="engR" label="R ENG" ariaLabel="R engine start" state="off" lit={false} disabled onToggle={noop} /></GuardedCover></Item>
          <Item cap="YELLOW/BLACK" w={GUARDED_TOGGLE_MIN.w}><GuardedCover id="x" name="CANOPY" stripe="yellow-black" guardOpen={false} onGuardToggle={noop}><BatToggle id="canopy" label="CANOPY" ariaLabel="Canopy" state="off" lit={false} onToggle={noop} /></GuardedCover></Item>
        </Panel>
      </Sec>

      <Sec id="apu" title="APU BLOCK · 128×140 (OPTION A)">
        <Panel>
          <Item cap="COLD" w={APU_BLOCK_MIN.w}><ApuBlock arm={false} start={false} ready="off" onArmToggle={noop} onStartToggle={noop} step="2·3" /></Item>
          <Item cap="ARMED" w={APU_BLOCK_MIN.w}><ApuBlock arm start={false} ready="off" onArmToggle={noop} onStartToggle={noop} step="2·3" /></Item>
          <Item cap="SPOOLING" w={APU_BLOCK_MIN.w}><ApuBlock arm start ready="spooling" onArmToggle={noop} onStartToggle={noop} step="2·3" /></Item>
          <Item cap="READY" w={APU_BLOCK_MIN.w}><ApuBlock arm start ready="ready" onArmToggle={noop} onStartToggle={noop} step="2·3" /></Item>
          <Item cap="DISABLED" w={APU_BLOCK_MIN.w}><ApuBlock arm={false} start={false} ready="off" onArmToggle={noop} onStartToggle={noop} disabled disabledReason="Battery first" step="2·3" /></Item>
        </Panel>
      </Sec>

      <Sec id="gndair" title="GND AIR + X-BLEED · 140×96 (OPTION B)">
        <Panel>
          <Item cap="OFF" w={GND_AIR_MIN.w}><GndAirBlock aircart={false} crossbleed={false} side={null} onToggle={noop} /></Item>
          <Item cap="CART → R" w={GND_AIR_MIN.w}><GndAirBlock aircart crossbleed={false} side="R" onToggle={noop} steps={{ aircart: 2 }} /></Item>
          <Item cap="X-BLEED → L" w={GND_AIR_MIN.w}><GndAirBlock aircart={false} crossbleed side="L" onToggle={noop} /></Item>
          <Item cap="DISABLED" w={GND_AIR_MIN.w}><GndAirBlock aircart={false} crossbleed={false} side={null} onToggle={noop} disabledReasons={{ aircart: 'Battery first', crossbleed: 'Right engine first' }} /></Item>
        </Panel>
      </Sec>

      <Sec id="pull" title="EMER STOP · PULL HANDLE · 76×118 / 66×118">
        <Item cap="REST" w={PULL_MIN.w}><PullHandle phase="rest" progress={0} /></Item>
        <Item cap="PULLING 0.25" w={PULL_MIN.w}><PullHandle phase="pulling" progress={0.25} /></Item>
        <Item cap="PULLING 0.6" w={PULL_MIN.w}><PullHandle phase="pulling" progress={0.6} /></Item>
        <Item cap="FIRED" w={PULL_MIN.w}><PullHandle phase="fired" progress={1} /></Item>
        <Item cap="773 REST" w={PULL_MIN_NARROW.w}><PullHandle phase="rest" progress={0} size="narrow" /></Item>
        <Item cap="773 FIRED" w={PULL_MIN_NARROW.w}><PullHandle phase="fired" progress={1} size="narrow" /></Item>
        <Item cap="2× PULLING" w={PULL_MIN.w * 2}><PullHandle phase="pulling" progress={0.6} /></Item>
      </Sec>

      <Sec id="qs" title="QUICK START GUARD · 118×118 / 96×118">
        <Item cap="CLOSED" w={QUICK_START_MIN.w}><QuickStartGuard guardOpen={false} running={false} onGuardToggle={noop} onStart={noop} /></Item>
        <Item cap="OPEN" w={QUICK_START_MIN.w}><QuickStartGuard guardOpen running={false} onGuardToggle={noop} onStart={noop} /></Item>
        <Item cap="RUNNING" w={QUICK_START_MIN.w}><QuickStartGuard guardOpen running onGuardToggle={noop} onStart={noop} /></Item>
        <Item cap="DISABLED (MOVING)" w={QUICK_START_MIN.w}><QuickStartGuard guardOpen={false} running={false} onGuardToggle={noop} onStart={noop} disabled disabledReason="Park to cold start" /></Item>
        <Item cap="773 CLOSED" w={QUICK_START_MIN_NARROW.w}><QuickStartGuard guardOpen={false} running={false} onGuardToggle={noop} onStart={noop} size="narrow" /></Item>
        <Item cap="773 OPEN" w={QUICK_START_MIN_NARROW.w}><QuickStartGuard guardOpen running={false} onGuardToggle={noop} onStart={noop} size="narrow" /></Item>
      </Sec>

      <Sec id="gps" title="GPS PLATE · 50×118 / 44×118">
        <Item cap="OFF" w={PLATE_MIN.w}><GpsPlate gps="none" /></Item>
        <Item cap="FAILED" w={PLATE_MIN.w}><GpsPlate gps="fail" /></Item>
        <div className="gal-freeze-dim"><Item cap="SEARCH · DIM" w={PLATE_MIN.w}><GpsPlate gps="acq" /></Item></div>
        <div className="gal-freeze-bright"><Item cap="SEARCH · BRIGHT" w={PLATE_MIN.w}><GpsPlate gps="acq" /></Item></div>
        <div data-rf-reduce-motion=""><Item cap="SEARCH · RM" w={PLATE_MIN.w}><GpsPlate gps="acq" /></Item></div>
        <Item cap="SEARCH · PULSING" w={PLATE_MIN.w}><GpsPlate gps="acq" /></Item>
        <Item cap="LIVE" w={PLATE_MIN.w}><GpsPlate gps="live" /></Item>
        {gpsStates.map((g) => <div key={g} className="gal-freeze-bright"><Item cap={`773 ${g.toUpperCase()}`} w={PLATE_MIN_NARROW.w}><GpsPlate gps={g} size="narrow" /></Item></div>)}
        <div className="gal-freeze-bright"><Item cap="2× SEARCH" w={PLATE_MIN.w * 2}><GpsPlate gps="acq" /></Item></div>
        <Item cap="2× OFF (ACQ ENGRAVING)" w={PLATE_MIN.w * 2}><GpsPlate gps="none" /></Item>
      </Sec>

      <Sec id="radar" title="RADAR TOGGLE · 56×118 / 44×118 · GPS+RADAR PLATE 107×118 / 89×118">
        <Item cap="RADAR OFF" w={RADAR_MIN.w}><RadarToggle on={false} onToggle={noop} /></Item>
        <Item cap="RADAR ON" w={RADAR_MIN.w}><RadarToggle on onToggle={noop} /></Item>
        <Item cap="773 OFF" w={RADAR_MIN_NARROW.w}><RadarToggle on={false} onToggle={noop} size="narrow" /></Item>
        <Item cap="773 ON" w={RADAR_MIN_NARROW.w}><RadarToggle on onToggle={noop} size="narrow" /></Item>
        <Item cap="1280 PLATE · LIVE · OFF" w={GPS_RADAR_PLATE_MIN.w}><GpsRadarPlate gps="live" radarOn={false} onRadarToggle={noop} /></Item>
        <Item cap="1280 PLATE · FAIL · ON" w={GPS_RADAR_PLATE_MIN.w}><GpsRadarPlate gps="fail" radarOn onRadarToggle={noop} /></Item>
        <Item cap="773 PLATE · LIVE · ON" w={GPS_RADAR_PLATE_MIN_NARROW.w}><GpsRadarPlate gps="live" radarOn onRadarToggle={noop} size="narrow" /></Item>
        <div className="gal-freeze-bright"><Item cap="773 PLATE · SEARCH · OFF" w={GPS_RADAR_PLATE_MIN_NARROW.w}><GpsRadarPlate gps="acq" radarOn={false} onRadarToggle={noop} size="narrow" /></Item></div>
      </Sec>

      <Sec id="bezel" title="BEZEL KEY · 52×66 (KEY 44×44)">
        <Item cap="ACTIVE" w={BEZEL_KEY_MIN.w}><BezelKey legend="RNG +" active onPress={noop} /></Item>
        <Item cap="LEGEND" w={BEZEL_KEY_MIN.w}><BezelKey legend="MODE" active={false} onPress={noop} /></Item>
        <Item cap="LONG LEGEND" w={BEZEL_KEY_MIN.w}><BezelKey legend="N/TRK-UP" active={false} onPress={noop} /></Item>
        <Item cap="INERT" w={BEZEL_KEY_MIN.w}><BezelKey active={false} /></Item>
        <Item cap="ROW · RADAR ON (773)">
          <div style={{ display: 'flex', gap: 2 }}>{['RNG +', 'RNG −', 'MODE'].map((l, i) => <div key={l} style={{ width: BEZEL_KEY_MIN.w }}><BezelKey legend={l} active={i === 2} onPress={noop} /></div>)}<div style={{ width: BEZEL_KEY_MIN.w }}><BezelKey active={false} /></div></div>
        </Item>
      </Sec>

      <Sec id="bank" title="BOTTOM BANK · GUARD END (AB GUARD · PULL · GPS+RADAR · QUICK START)">
        <Item cap="1280">
          <div className="gal-bank" data-gal-bank="1280">
            <div style={{ alignSelf: 'flex-end' }} data-bank-el="ab-guard"><CarrierJetAfterburnerGuard armed={false} onArm={noop} guardOpen={false} onGuardToggle={noop} variant="compact" /></div>
            <div style={{ width: PULL_MIN.w }} data-bank-el="pull"><PullHandle phase="rest" progress={0} /></div>
            <div style={{ width: PLATE_MIN.w }}><GpsPlate gps="live" /></div>
            <div style={{ width: RADAR_MIN.w }}><RadarToggle on={false} onToggle={noop} /></div>
            <div style={{ width: QUICK_START_MIN.w }}><QuickStartGuard guardOpen={false} running={false} onGuardToggle={noop} onStart={noop} /></div>
          </div>
        </Item>
        <Item cap="773">
          <div className="gal-bank" data-gal-bank="773">
            <div style={{ alignSelf: 'flex-end' }} data-bank-el="ab-guard"><CarrierJetAfterburnerGuard armed={false} onArm={noop} guardOpen={false} onGuardToggle={noop} variant="compact" /></div>
            <div style={{ width: PULL_MIN_NARROW.w }} data-bank-el="pull"><PullHandle phase="rest" progress={0} size="narrow" /></div>
            <div style={{ width: GPS_RADAR_PLATE_MIN_NARROW.w }}><GpsRadarPlate gps="live" radarOn onRadarToggle={noop} size="narrow" /></div>
            <div style={{ width: QUICK_START_MIN_NARROW.w }}><QuickStartGuard guardOpen={false} running={false} onGuardToggle={noop} onStart={noop} size="narrow" /></div>
          </div>
        </Item>
      </Sec>

      <section className="gal-sec" id="shelf-1280"><h2>SWITCH SHELF · 1248×641 (1280) · OPTION A · OPEN</h2><Shelf mode="apu" open="open" {...SHELF_SLOTS.w1280} /></section>
      <section className="gal-sec" id="shelf-773"><h2>SWITCH SHELF · 757×376 (773) · OPTION A / OPTION B · OPEN</h2>
        <div className="gal-row"><Shelf mode="apu" open="open" {...SHELF_SLOTS.w773} /><Shelf mode="gndAir" open="open" {...SHELF_SLOTS.w773} /></div>
      </section>
      <section className="gal-sec" id="shelf-states"><h2>SWITCH SHELF · CLOSED / OPENING (FROZEN MID-SLIDE) / OPENING UNDER REDUCE MOTION · 773</h2>
        <div className="gal-row">
          <Item cap="CLOSED"><Shelf mode="apu" open="closed" {...SHELF_SLOTS.w773} /></Item>
          <div className="gal-freeze-mid"><Item cap="OPENING"><Shelf mode="apu" open="opening" {...SHELF_SLOTS.w773} /></Item></div>
          <div data-rf-reduce-motion=""><Item cap="OPENING · RM (APPEARS)"><Shelf mode="apu" open="opening" {...SHELF_SLOTS.w773} /></Item></div>
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Gallery /></StrictMode>);
