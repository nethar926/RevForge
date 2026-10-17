/* Dev-only concept sheet (not linked from the app): `npx vite` → /src/skins/carrier-jet/concept/index.html.
 * Panels 4, 5, 8 are code mocks (MasterCaution, SeatBeltLamp, ChecklistPamphlet); 1, 2, 3, 6, 7 are annotated
 * drawings, plus the real GuardedCover / PullHandle / BatToggle parts where they carry the point. ?cjCaution=1 lights
 * the live MASTER CAUTION. All wording is ours. */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../parts/parts.css';
import './concept.css';
import { BatToggle, GuardedCover, PullHandle } from '../parts/index';
import { ChecklistPamphlet } from './ChecklistPamphlet';
import { MasterCaution } from './MasterCaution';
import { SeatBeltLamp } from './SeatBeltLamp';
import { badgeFor, badgeLabel, CJ_CHECKLIST_PLAN, ckItems, ckLineLabel } from '../../../packs/carrier-jet/checklistPlan';

const noop = () => {};
const Panel = ({ n, title, sub, children, span }: { n: number; title: string; sub: string; children: ReactNode; span?: number }) => (
  <section className="cs-p" style={span ? { gridColumn: `span ${span}` } : undefined} data-panel={n}>
    <h2><span className="cs-n">{n}</span>{title}</h2>
    <p className="cs-sub">{sub}</p>
    <div className="cs-body">{children}</div>
  </section>
);
const Note = ({ children }: { children: ReactNode }) => <p className="cs-note">{children}</p>;

/* ---- tiny wireframe board: a row of cells over a bottom bank */
type Cell = { x: number; y: number; w: number; h: number; t: string; hl?: 'keep' | 'drop' | 'new' };
function Wire({ cells, w = 300, h = 170, label }: { cells: Cell[]; w?: number; h?: number; label?: string }) {
  return (
    <svg className="cs-wire" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="4" fill="#202427" stroke="#3b4247" />
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="3" fill={c.hl === 'new' ? '#123a22' : '#0b1a10'} stroke={c.hl === 'drop' ? '#ff7a4a' : c.hl === 'keep' || c.hl === 'new' ? '#7ef7a1' : '#45ad66'} strokeWidth={c.hl ? 2 : 1} strokeDasharray={c.hl === 'drop' ? '4 3' : undefined} />
          <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 4} textAnchor="middle" fontSize="11" fontFamily="B612" fill={c.hl === 'drop' ? '#ffb08a' : '#8dffad'}>{c.t}</text>
          {c.hl === 'drop' && <line x1={c.x + 3} y1={c.y + 3} x2={c.x + c.w - 3} y2={c.y + c.h - 3} stroke="#ff7a4a" strokeWidth="1.5" />}
        </g>
      ))}
    </svg>
  );
}
const board = (bank: Cell[], extra: Cell[] = []): Cell[] => [
  { x: 8, y: 8, w: 66, h: 70, t: 'SPEED' }, { x: 80, y: 8, w: 66, h: 70, t: 'VDI' }, { x: 152, y: 8, w: 76, h: 70, t: 'MAP' }, { x: 234, y: 8, w: 58, h: 70, t: 'COMPASS' },
  ...bank, ...extra,
];

function CautionDemo() {
  const forced = new URLSearchParams(location.search).get('cjCaution') === '1';
  const [lit, setLit] = useState(forced);
  return (
    <div className="cs-row">
      <figure><MasterCaution lit={false} /><figcaption>AT REST · dark</figcaption></figure>
      <figure><MasterCaution lit step="9a" /><figcaption>CAUTION PRESENT · steady orange</figcaption></figure>
      <figure><MasterCaution lit={lit} onPress={() => setLit(false)} /><figcaption>LIVE{forced ? ' (?cjCaution=1)' : ''} · press resets</figcaption></figure>
    </div>
  );
}

function Sheet() {
  const all = ckItems();
  const cursor = all.findIndex((i) => i.code === '3b');
  const apu = badgeFor('apu', cursor)!;
  return (
    <div className="cs">
      <header className="cs-h">
        <h1>REVFORGE MATRIX · CONCEPT SHEET</h1>
        <p>Mock for Wilson. Matte metal, engraved backlit legends, one light source (top left). Text ≥ 11 px, targets ≥ 44 px, contrast ≥ 4.5 : 1, nothing flashes.</p>
      </header>
      <div className="cs-grid">
        <Panel n={1} title="SHELF · ALWAYS REACHABLE" sub="The SHELF key stays on the bottom bank in Park and in Drive.">
          <div className="cs-row">
            <figure><Wire label="Park: SHELF key on the bank" cells={board([{ x: 8, y: 100, w: 60, h: 62, t: 'SHELF', hl: 'keep' }, { x: 74, y: 100, w: 120, h: 62, t: 'AB · GUARD' }, { x: 200, y: 100, w: 92, h: 62, t: 'EMER STOP' }])} w={300} /><figcaption>PARK</figcaption></figure>
            <figure><Wire label="Drive: the same SHELF key" cells={board([{ x: 8, y: 100, w: 60, h: 62, t: 'SHELF', hl: 'keep' }, { x: 74, y: 100, w: 120, h: 62, t: 'AB · GUARD' }, { x: 200, y: 100, w: 92, h: 62, t: 'EMER STOP' }])} w={300} /><figcaption>DRIVE</figcaption></figure>
          </div>
          <Note>Drive: the shelf opens to read; switches that need Park say "Available in Park" (announced, no effect). Close with the same key.</Note>
        </Panel>
        <Panel n={2} title="ONE GUARD ANIMATION" sub="Every guard (AB, APU, L / R ENG, QUICK START) uses the same lift and close.">
          <div className="cs-row">
            <figure><GuardedCover id="engL" name="L ENG" guardOpen={false} onGuardToggle={noop}><BatToggle id="engL" label="L ENG" ariaLabel="L engine start" state="off" lit={false} onToggle={noop} /></GuardedCover><figcaption>CLOSED</figcaption></figure>
            <svg className="cs-curve" viewBox="0 0 160 132" width="160" height="132" role="img" aria-label="Lift 220 milliseconds ease out, close 180 milliseconds ease in, no bounce">
              <rect x="0.5" y="0.5" width="159" height="131" rx="3" fill="#16191b" stroke="#3b4247" />
              <path d="M14 96 C 40 30, 70 22, 136 22" fill="none" stroke="#7ef7a1" strokeWidth="2" />
              <path d="M14 22 C 80 22, 110 30, 136 96" fill="none" stroke="#ffc35a" strokeWidth="2" strokeDasharray="4 3" />
              <text x="14" y="112" fontSize="11" fontFamily="B612" fill="#8dffad">— LIFT 220 ms</text>
              <text x="14" y="126" fontSize="11" fontFamily="B612" fill="#ffc35a">- - CLOSE 180 ms</text>
              <text x="14" y="15" fontSize="11" fontFamily="B612" fill="#c7cec9">0 → 100°, no bounce</text>
            </svg>
            <figure><GuardedCover id="engL" name="L ENG" guardOpen onGuardToggle={noop}><BatToggle id="engL" label="L ENG" ariaLabel="L engine start" state="off" lit={false} onToggle={noop} cue="next" legend="TAP" /></GuardedCover><figcaption>OPEN</figcaption></figure>
          </div>
          <Note>One shared keyframe pair and timing token. Reduce Motion: the cover jumps open / closed (state shown, no motion).</Note>
        </Panel>
        <Panel n={3} title="PARK = DRIVE DESIGN" sub="Same cells, same hardware, same type in Park and Drive; only what is live changes.">
          <div className="cs-row">
            <figure><Wire label="Park board" cells={board([{ x: 8, y: 100, w: 284, h: 62, t: 'BOTTOM BANK' }])} /><figcaption>PARK</figcaption></figure>
            <figure><Wire label="Drive board, identical layout" cells={board([{ x: 8, y: 100, w: 284, h: 62, t: 'BOTTOM BANK' }])} /><figcaption>DRIVE</figcaption></figure>
          </div>
          <Note>No separate Drive skin: the map-first Drive keeps Park's bezels, legends and key strips; Park-only switches show their lock.</Note>
        </Panel>
        <Panel n={4} title="MASTER CAUTION" sub="Push button replaces 'Caution reset' / CAUT RST. Dark at rest, lit orange when any caution is present, press resets.">
          <CautionDemo />
          <Note>Steady light, never flashing. VoiceOver: "Master caution, lit, press to reset" · "Master caution, no cautions". 64 × 64 px cap.</Note>
        </Panel>
        <Panel n={5} title="SEAT BELT LAMP" sub="A dash annunciator with an engraved, backlit legend (not the car's pictogram).">
          <div className="cs-row">
            <figure><SeatBeltLamp on={false} /><figcaption>OFF · unlit lens</figcaption></figure>
            <figure><SeatBeltLamp on /><figcaption>ON · backlit white</figcaption></figure>
          </div>
          <Note>Switching it on plays a single low tone (one cue, no repeat). Checklist 7a: "Verify single low tone".</Note>
        </Panel>
        <Panel n={6} title="EMER STOP IS THE QUICK STOP" sub="The guarded SHUTDOWN is removed; the EMER STOP handle stops the engines.">
          <div className="cs-row">
            <figure><Wire label="Bottom bank without the shutdown guard" w={210} h={100} cells={[{ x: 8, y: 8, w: 60, h: 84, t: 'SHELF' }, { x: 74, y: 8, w: 64, h: 84, t: 'SHUTDOWN', hl: 'drop' }, { x: 144, y: 8, w: 58, h: 84, t: 'QS' }]} /><figcaption>SHUTDOWN GUARD · REMOVED</figcaption></figure>
            <figure style={{ width: 76 }}><PullHandle phase="rest" progress={0} /><figcaption>EMER STOP</figcaption></figure>
          </div>
          <Note>Pull past the detent to stop. Normal shutdown is the checklist's shutdown page.</Note>
        </Panel>
        <Panel n={7} title="ONE HEADING READOUT" sub="Keep COMPASS (magnetic). Drop the duplicate HDG / MAG legend. Keep the map's heading bug.">
          <svg className="cs-wire" viewBox="0 0 300 150" width="300" height="150" role="img" aria-label="Compass keeps HDG 047 M; the map keeps its heading bug; the duplicate map heading legend is removed">
            <rect x="0.5" y="0.5" width="299" height="149" rx="4" fill="#202427" stroke="#3b4247" />
            <rect x="8" y="8" width="140" height="134" rx="3" fill="#0b1a10" stroke="#45ad66" />
            <text x="16" y="24" fontSize="11" fontFamily="B612" fill="#8dffad">MAP</text>
            <path d="M78 14 l-6 10 h12 z" fill="#7ef7a1" />
            <text x="96" y="22" fontSize="11" fontFamily="B612" fill="#7ef7a1">BUG ✓</text>
            <rect x="88" y="30" width="56" height="30" rx="2" fill="none" stroke="#ff7a4a" strokeDasharray="4 3" strokeWidth="1.5" />
            <text x="116" y="42" textAnchor="middle" fontSize="11" fontFamily="B612" fill="#ffb08a">HDG M</text>
            <text x="116" y="55" textAnchor="middle" fontSize="11" fontFamily="B612" fill="#ffb08a">HDG T</text>
            <line x1="90" y1="32" x2="142" y2="58" stroke="#ff7a4a" strokeWidth="1.5" />
            <path d="M78 96 l7 18 l-7 -4.5 l-7 4.5 z" fill="#8dffad" />
            <rect x="154" y="8" width="138" height="134" rx="3" fill="#0b1a10" stroke="#7ef7a1" strokeWidth="2" />
            <text x="162" y="24" fontSize="11" fontFamily="B612" fill="#8dffad">COMPASS</text>
            <rect x="178" y="34" width="92" height="30" rx="3" fill="#041009" stroke="#2f7a48" />
            <text x="224" y="55" textAnchor="middle" fontSize="16" fontFamily="B612" fill="#8dffad">HDG 047 M</text>
            <path d="M170 132 A 60 60 0 0 1 276 132" fill="none" stroke="#45ad66" strokeWidth="1.5" />
            <text x="224" y="122" textAnchor="middle" fontSize="11" fontFamily="B612" fill="#8dffad">N</text>
          </svg>
          <Note>VoiceOver reads heading once (COMPASS: "heading 047 magnetic"). TRUE stays available in CONFIG › HDG REF.</Note>
        </Panel>
        <Panel n={8} span={2} title="CHECKLIST PAMPHLET" sub="9 sections, lettered items, ITEM ···· ACTION, Verify lines, CAUTION / NOTE above their step, phase tabs. Current line backlit, finished lines dimmed with ✓.">
          <div className="cs-row cs-top">
            <div style={{ width: 430 }}><ChecklistPamphlet cursor={cursor} /></div>
            <div style={{ width: 300 }}><ChecklistPamphlet cursor={all.findIndex((i) => i.code === '7a')} size="narrow" /><p className="cs-cap">773 window · actions 11 px</p></div>
            <div className="cs-spec">
              <h3>SWITCH BADGES · SHORT CODES</h3>
              <div className="cs-row">
                <figure><div style={{ width: 60 }}><BatToggle id="batt" label="BATT" ariaLabel={badgeLabel('batt', cursor)!} state="on" lit onToggle={noop} step={badgeFor('batt', cursor)!.code} /></div><figcaption>1a done</figcaption></figure>
                <figure><div style={{ width: 60 }}><BatToggle id="apu" label="APU" ariaLabel={badgeLabel('apu', cursor)!} state="off" lit={false} onToggle={noop} step={apu.code} cue="next" legend="HOLD" /></div><figcaption>3b next (later 6a)</figcaption></figure>
                <figure><div style={{ width: 60 }}><BatToggle id="oxygen" label="O2" ariaLabel={badgeLabel('oxygen', cursor)!} state="off" lit={false} onToggle={noop} step={badgeFor('oxygen', cursor)!.code} /></div><figcaption>7d</figcaption></figure>
              </div>
              <h3>VOICEOVER</h3>
              <ul className="cs-vo">
                <li>Badge: "{badgeLabel('apu', cursor)}"</li>
                <li>Badge: "{badgeLabel('batt', cursor)}"</li>
                <li>Badge after start: "{badgeLabel('apu', all.findIndex((i) => i.key === 'apu:off'))}"</li>
                <li>Line: "{ckLineLabel(all.find((i) => i.key === 'apu:off')!, 'todo')}"</li>
                <li>Line: "{ckLineLabel(all.find((i) => i.key === 'seatbelt')!, 'todo')}"</li>
                <li>Leaders (····) are aria-hidden; Verify lines and boxes are in the sheet, not read per line.</li>
              </ul>
              <h3>SECTIONS</h3>
              <p className="cs-secs">{CJ_CHECKLIST_PLAN.map((s) => `${s.n} ${s.title}`).join(' · ')}</p>
              <p className="cs-secs">Same step → switch map as Scott's 6e85d6f (off steps included): APU START 6·7·14 → 3a·3b·6a.</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const css = `
.cs-h h1 { margin: 0; font: 700 24px 'B612', system-ui, sans-serif; letter-spacing: .14em; color: #f3f5f2; }
.cs-h p { margin: 4px 0 14px; color: #c7cec9; }
.cs-grid { display: grid; grid-template-columns: repeat(3, 664px); gap: 14px; }
.cs-p { position: relative; padding: 12px 14px 12px; border-radius: 4px; background: linear-gradient(160deg, #2c3134, #222629); box-shadow: inset 1px 1px 0 #454c51, inset -1px -1px 0 #15181a; }
.cs-p h2 { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 15px 'B612', system-ui, sans-serif; letter-spacing: .12em; color: #e9ece8; text-shadow: 0 -1px 0 #000, 0 1px 0 #3d4448; }
.cs-n { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 2px; background: #111416; color: #7ef7a1; font-size: 13px; box-shadow: inset 1px 1px 2px #000; }
.cs-sub { margin: 4px 0 10px; color: #c7cec9; }
.cs-note { margin: 10px 0 0; color: #aeb6b1; font-size: 13px; }
.cs-row { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
.cs-row.cs-top { align-items: flex-start; }
figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
figcaption, .cs-cap { font: 700 11px/13px 'B612', system-ui, sans-serif; letter-spacing: .06em; color: #c7cec9; text-align: center; }
.cs-spec { flex: 1; min-width: 300px; }
.cs-spec h3 { margin: 0 0 6px; font: 700 12px 'B612', system-ui, sans-serif; letter-spacing: .12em; color: #7ef7a1; }
.cs-spec .cs-row + h3, .cs-vo + h3 { margin-top: 12px; }
.cs-vo { margin: 0; padding-left: 16px; font-size: 13px; line-height: 18px; color: #dfe5e1; }
.cs-secs { margin: 0 0 4px; font-size: 13px; color: #dfe5e1; }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
createRoot(document.getElementById('root')!).render(<StrictMode><Sheet /></StrictMode>);
