/**
 * Dev-only harness for the switch panel and afterburner guard (not in the production bundle).
 *   npm run dev, then open /src/skins/carrier-jet/preview/switches.html
 *   ?only=panel|guard   one component only (default both)
 * Every state is drawn side by side; the first panel and first guard are live (tap / keyboard).
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CarrierJetAfterburnerGuard } from '../AfterburnerGuard';
import { CarrierJetSwitchPanel } from '../SwitchPanel';
import { CJ_SWITCH_ITEMS, CJ_SWITCH_OVERFLOW, type CjSwitchItem, type CjSwitchState } from '../switches';

const only = new URLSearchParams(location.search).get('only');
const noop = () => {};
const withState = (more: boolean, compass: CjSwitchState, mute = false, page = 'drive'): CjSwitchItem[] =>
  CJ_SWITCH_ITEMS.map((i) =>
    i.kind === 'page' ? { ...i, on: i.id === page } : i.id === 'compass' ? { ...i, state: compass } : i.id === 'mute' ? { ...i, on: mute } : i.kind === 'more' ? { ...i, on: more } : i,
  );

function LivePanel() {
  const [page, setPage] = useState('drive');
  const [more, setMore] = useState(false);
  const [mute, setMute] = useState(false);
  const [compass, setCompass] = useState<CjSwitchState>('off');
  const onSelect = (id: string) => {
    if (id === 'more') setMore((m) => !m);
    else if (id === 'mute') setMute((m) => !m);
    else if (id === 'compass') setCompass((c) => (c === 'on' ? 'off' : c === 'off' ? 'denied' : 'on'));
    else setPage(id);
  };
  return <CarrierJetSwitchPanel items={withState(more, compass, mute, page)} overflow={CJ_SWITCH_OVERFLOW.map((i) => ({ ...i, on: i.id === page }))} onSelect={onSelect} />;
}
function LiveGuard() {
  const [armed, setArmed] = useState(true);
  const [open, setOpen] = useState(false);
  return <CarrierJetAfterburnerGuard armed={armed} guardOpen={open} onArm={() => setArmed((a) => !a)} onGuardToggle={() => setOpen((o) => !o)} />;
}

const Sec = ({ title, id, children }: { title: string; id: string; children: ReactNode }) => (
  <section data-pv={id}>
    <h2 className="pv-h">{title}</h2>
    <div className="pv-row">{children}</div>
  </section>
);

function App() {
  return (
    <>
      {only !== 'guard' ? (
        <>
          <Sec id="panel-live" title="SWITCH PANEL · live"><LivePanel /></Sec>
          <Sec id="panel-closed" title="SWITCH PANEL · tray closed · DRIVE current · compass off · mute off">
            <CarrierJetSwitchPanel items={withState(false, 'off')} overflow={CJ_SWITCH_OVERFLOW} onSelect={noop} />
          </Sec>
          <Sec id="panel-on" title="SWITCH PANEL · GARAGE current · compass on · mute on">
            <CarrierJetSwitchPanel items={withState(false, 'on', true, 'garage')} overflow={CJ_SWITCH_OVERFLOW} onSelect={noop} />
          </Sec>
          <Sec id="panel-denied" title="SWITCH PANEL · compass denied (tap to retry)">
            <CarrierJetSwitchPanel items={withState(false, 'denied')} overflow={CJ_SWITCH_OVERFLOW} onSelect={noop} />
          </Sec>
          <Sec id="panel-open" title="SWITCH PANEL · MORE tray open">
            <CarrierJetSwitchPanel items={withState(true, 'off')} overflow={CJ_SWITCH_OVERFLOW} onSelect={noop} />
          </Sec>
        </>
      ) : null}
      {only !== 'panel' ? (
        <Sec id="guard" title="AFTERBURNER GUARD · closed armed · open armed · open disarmed · closed disarmed · live">
          <CarrierJetAfterburnerGuard armed guardOpen={false} onArm={noop} onGuardToggle={noop} />
          <CarrierJetAfterburnerGuard armed guardOpen onArm={noop} onGuardToggle={noop} />
          <CarrierJetAfterburnerGuard armed={false} guardOpen onArm={noop} onGuardToggle={noop} />
          <CarrierJetAfterburnerGuard armed={false} guardOpen={false} onArm={noop} onGuardToggle={noop} />
          <LiveGuard />
        </Sec>
      ) : null}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
