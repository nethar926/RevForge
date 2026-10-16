import { useId } from 'react';
import './carrier-jet.css';
import './switches.css';
import { switchView, type CjSwitchItem } from './switches';

export interface CarrierJetSwitchPanelProps {
  /** One row of bat-handle switches, left to right. Put the `kind: 'more'` item last. */
  items: CjSwitchItem[];
  /** Shown in the tray under the row while the `more` item has `on: true`. */
  overflow?: CjSwitchItem[];
  /** Every tap calls this with the item id; the host flips its own state. */
  onSelect: (id: string) => void;
}

/** Bat-handle toggle art (original). Lever up = on / current page / tray open. */
function BatHandle({ up }: { up: boolean }) {
  const len = up ? -30 : 24;
  const tip = up ? -32 : 26;
  const hex = [0, 60, 120, 180, 240, 300].map((a) => `${(Math.cos((a * Math.PI) / 180) * 16).toFixed(1)},${(Math.sin((a * Math.PI) / 180) * 16).toFixed(1)}`).join(' ');
  return (
    <svg className="cjs-bat" viewBox="-28 -40 56 76" width="56" height="76" aria-hidden="true" focusable="false">
      <polygon points={hex} fill="#a9afb4" stroke="#24282b" strokeWidth="1.5" />
      <circle r="9" fill="#4a5055" stroke="#1c1e20" strokeWidth="1.5" />
      <ellipse cx="2" cy={up ? 6 : -4} rx="6" ry="3" fill="#000" opacity="0.35" />
      <path d={`M-5 0 L-3 ${len} L3 ${len} L5 0Z`} fill="#d5d9dc" stroke="#2d3135" strokeWidth="1" />
      <path d={`M-1.5 0 L-1 ${len}`} stroke="#ffffff" strokeWidth="1.2" opacity="0.7" />
      <circle cy={tip} r={up ? 6 : 7} fill="#dfe2e4" stroke="#2d3135" strokeWidth="1" />
    </svg>
  );
}

function Switch({ item, overflowCount, trayId, onSelect }: { item: CjSwitchItem; overflowCount: number; trayId?: string; onSelect: (id: string) => void }) {
  const v = switchView(item, overflowCount);
  return (
    <li className="cjs-cell">
      <button
        type="button"
        className="cjs-sw"
        data-kind={item.kind}
        data-up={v.up}
        data-denied={v.denied || undefined}
        data-sw-id={item.id}
        aria-controls={item.kind === 'more' ? trayId : undefined}
        {...v.a11y}
        onClick={() => onSelect(item.id)}
      >
        <span className="cjs-label" aria-hidden="true">{item.label}</span>
        <span className="cjs-lamp" data-on={v.lamp} aria-hidden="true" />
        <BatHandle up={v.up} />
        <span className="cjs-legend" aria-hidden="true">{v.legend}</span>
        {v.hint ? <span className="cjs-hint" aria-hidden="true">{v.hint}</span> : null}
      </button>
    </li>
  );
}

const Screws = () => (
  <>
    <i className="cjs-screw" data-pos="tl" aria-hidden="true" />
    <i className="cjs-screw" data-pos="tr" aria-hidden="true" />
    <i className="cjs-screw" data-pos="bl" aria-hidden="true" />
    <i className="cjs-screw" data-pos="br" aria-hidden="true" />
  </>
);

/**
 * Carrier Jet switch panel, option A: one row of metal bat-handle toggles on a gray screwed panel with
 * stencil labels, plus a MORE switch that opens a tray. Presentational: draws `items` / `overflow` as given
 * and reports taps through `onSelect(id)`. Page = aria-current, toggle = role="switch", more = aria-expanded.
 */
export function CarrierJetSwitchPanel({ items, overflow = [], onSelect }: CarrierJetSwitchPanelProps) {
  const trayId = `cjs-tray-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const trayOpen = items.some((i) => i.kind === 'more' && i.on) && overflow.length > 0;
  return (
    <div className="cjs" role="group" aria-label="Switch panel">
      <Screws />
      <div className="cjs-title" aria-hidden="true">NAV</div>
      <ul className="cjs-row">
        {items.map((it) => (
          <Switch key={it.id} item={it} overflowCount={overflow.length} trayId={trayId} onSelect={onSelect} />
        ))}
      </ul>
      {trayOpen ? (
        <div className="cjs-tray" id={trayId} role="group" aria-label="More">
          <div className="cjs-tray-h" aria-hidden="true">MORE</div>
          <ul className="cjs-row">
            {overflow.map((it) => (
              <Switch key={it.id} item={it} overflowCount={0} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
