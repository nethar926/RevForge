/**
 * The checklist PAMPHLET on the shelf: Meghan's ChecklistPamphlet markup (skins/carrier-jet/concept), host side with
 * the plan and title as props so GND AIR gets its own sections (her part is fixed to the APU plan). Same classes,
 * same concept.css, same VoiceOver lines; tests/cj-pamphlet.test.ts checks the APU render matches hers byte for byte.
 * With `onPage` (the shelf's open pamphlet) the phase tabs become 44 px page buttons plus a SHUTDOWN page in the same
 * printed style (shutdownPlan.ts); the tabs sit outside the card's scroll (carrier-jet-v2.css), so they never scroll.
 */
import { CK_PHASES, ckItems, ckLineLabel, type CkPhase, type CkSection, type CkState } from '../carrier-jet/checklistPlan';
import { CJ_SHUTDOWN_PLAN, SD_EMERGENCY, SD_TITLE, sdLineLabel, type SdItem } from '../carrier-jet/shutdownPlan';
import '../../skins/carrier-jet/concept/concept.css';

export type CkPage = CkPhase | 'SHUTDOWN';
export const CK_PAGES: readonly CkPage[] = [...CK_PHASES, 'SHUTDOWN'];

export interface CjPamphletProps {
  plan: readonly CkSection[];
  title: string;
  /** Index into the flat item list of the current step (0-based); items before it are done. */
  cursor: number;
  sections?: readonly CkSection[];
  size?: 'wide' | 'narrow';
  /** Page shown (default: the current step's phase). */
  page?: CkPage;
  /** Page tabs as buttons (incl. SHUTDOWN). Omitted: Meghan's static tabs, byte for byte. */
  onPage?: (p: CkPage) => void;
}

/** One printed `ITEM ........ ACTION` line with its NOTE / CAUTION box and Verify lines (shared by both pages). */
function Line({ it, st, label }: { it: Pick<SdItem, 'code' | 'item' | 'verify' | 'callout'> & { action: string }; st: CkState | null; label: string }) {
  return (
    <li className="ckp-li" data-state={st ?? 'todo'} aria-label={label} aria-current={st === 'current' ? 'step' : undefined}>
      {it.callout && (
        <div className="ckp-callout" data-kind={it.callout.kind} aria-hidden="true">
          <b>{it.callout.kind}</b>
          <span>{it.callout.text}</span>
        </div>
      )}
      <div className="ckp-line" aria-hidden="true">
        <span className="ckp-mark">{st === 'done' ? '✓' : ''}</span>
        <span className="ckp-code">{it.code.slice(-1)}.</span>
        <span className="ckp-item">{it.item}</span>
        <span className="ckp-dots" />
        <span className="ckp-act">{it.action}</span>
      </div>
      {it.verify?.map((v, i) => (
        <div key={v} className="ckp-verify" aria-hidden="true">({i + 1}) {v}</div>
      ))}
    </li>
  );
}

export function CjPamphlet({ plan, title, cursor, sections, size = 'wide', page, onPage }: CjPamphletProps) {
  const all = ckItems(plan);
  const cur = all[Math.min(cursor, all.length - 1)];
  const curSec = plan.find((s) => s.items.includes(cur))!;
  const shown = sections ?? plan.filter((s) => s.phase === curSec.phase);
  const state = (code: string): CkState => {
    const i = all.findIndex((x) => x.code === code);
    return i < cursor ? 'done' : i === cursor ? 'current' : 'todo';
  };
  if (onPage) {
    const pg: CkPage = page ?? curSec.phase;
    const sd = pg === 'SHUTDOWN';
    const secs = sd ? [] : sections ?? plan.filter((s) => s.phase === pg);
    return (
      <section className="ckp" data-size={size} data-paged="" data-page={pg} aria-label={sd ? 'Checklist, shutdown' : `Checklist, ${pg.toLowerCase()}, step ${cursor + 1} of ${all.length}`}>
        <div className="ckp-card">
          <header className="ckp-head" aria-hidden="true">
            <span className="ckp-brand">REVFORGE · JET</span>
            <span className="ckp-title">{sd ? SD_TITLE : title}</span>
          </header>
          {sd ? (
            <div className="ckp-sdpage">
              {CJ_SHUTDOWN_PLAN.map((s) => (
                <div key={s.n} className="ckp-sec">
                  <h4 className="ckp-sech">
                    <span className="ckp-secn">{s.n}</span>
                    {s.title}
                  </h4>
                  <ol className="ckp-list">
                    {s.items.map((it) => <Line key={it.code} it={it} st={null} label={sdLineLabel(it)} />)}
                  </ol>
                </div>
              ))}
              <div className="ckp-callout ckp-sdemer" data-kind="CAUTION" role="note" aria-label={`Emergency: ${SD_EMERGENCY}`}>
                <b aria-hidden="true">EMERGENCY</b>
                <span aria-hidden="true">{SD_EMERGENCY}</span>
              </div>
            </div>
          ) : (
            secs.map((s) => (
              <div key={s.n} className="ckp-sec">
                <h4 className="ckp-sech">
                  <span className="ckp-secn">{s.n}</span>
                  {s.title}
                </h4>
                <ol className="ckp-list">
                  {s.items.map((it) => {
                    const st = state(it.code);
                    return <Line key={it.code} it={it} st={st} label={ckLineLabel(it, st)} />;
                  })}
                </ol>
              </div>
            ))
          )}
        </div>
        <nav className="ckp-tabs" aria-label="Checklist pages">
          {CK_PAGES.map((p) => (
            <button key={p} type="button" className="ckp-tab" data-page={p} data-on={p === pg || undefined} aria-current={p === pg ? 'page' : undefined} aria-label={`${p === 'SHUTDOWN' ? 'Shutdown' : p === 'PRE-START' ? 'Pre-start' : p === 'START' ? 'Start' : 'Before taxi'} page${p === curSec.phase ? ', current step' : ''}`} onClick={() => onPage(p)}>{p}</button>
          ))}
        </nav>
      </section>
    );
  }
  return (
    <section className="ckp" data-size={size} aria-label={`Checklist, ${curSec.phase.toLowerCase()}, step ${cursor + 1} of ${all.length}`}>
      <div className="ckp-card">
        <header className="ckp-head" aria-hidden="true">
          <span className="ckp-brand">REVFORGE · JET</span>
          <span className="ckp-title">{title}</span>
        </header>
        {shown.map((s) => (
          <div key={s.n} className="ckp-sec">
            <h4 className="ckp-sech">
              <span className="ckp-secn">{s.n}</span>
              {s.title}
            </h4>
            <ol className="ckp-list">
              {s.items.map((it) => {
                const st = state(it.code);
                return (
                  <li key={it.code} className="ckp-li" data-state={st} aria-label={ckLineLabel(it, st)} aria-current={st === 'current' ? 'step' : undefined}>
                    {it.callout && (
                      <div className="ckp-callout" data-kind={it.callout.kind} aria-hidden="true">
                        <b>{it.callout.kind}</b>
                        <span>{it.callout.text}</span>
                      </div>
                    )}
                    <div className="ckp-line" aria-hidden="true">
                      <span className="ckp-mark">{st === 'done' ? '✓' : ''}</span>
                      <span className="ckp-code">{it.code.slice(-1)}.</span>
                      <span className="ckp-item">{it.item}</span>
                      <span className="ckp-dots" />
                      <span className="ckp-act">{it.action}</span>
                    </div>
                    {it.verify?.map((v, i) => (
                      <div key={v} className="ckp-verify" aria-hidden="true">({i + 1}) {v}</div>
                    ))}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <nav className="ckp-tabs" aria-label="Checklist phases">
        {CK_PHASES.map((p) => (
          <span key={p} className="ckp-tab" data-on={p === curSec.phase || undefined} aria-current={p === curSec.phase ? 'true' : undefined}>{p}</span>
        ))}
      </nav>
    </section>
  );
}
