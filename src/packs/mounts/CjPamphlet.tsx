/**
 * The checklist PAMPHLET on the shelf: Meghan's ChecklistPamphlet markup (skins/carrier-jet/concept), host side with
 * the plan and title as props so GND AIR gets its own sections (her part is fixed to the APU plan). Same classes,
 * same concept.css, same VoiceOver lines; tests/cj-pamphlet.test.ts checks the APU render matches hers byte for byte.
 */
import { CK_PHASES, ckItems, ckLineLabel, type CkSection, type CkState } from '../carrier-jet/checklistPlan';
import '../../skins/carrier-jet/concept/concept.css';

export interface CjPamphletProps {
  plan: readonly CkSection[];
  title: string;
  /** Index into the flat item list of the current step (0-based); items before it are done. */
  cursor: number;
  sections?: readonly CkSection[];
  size?: 'wide' | 'narrow';
}

export function CjPamphlet({ plan, title, cursor, sections, size = 'wide' }: CjPamphletProps) {
  const all = ckItems(plan);
  const cur = all[Math.min(cursor, all.length - 1)];
  const curSec = plan.find((s) => s.items.includes(cur))!;
  const shown = sections ?? plan.filter((s) => s.phase === curSec.phase);
  const state = (code: string): CkState => {
    const i = all.findIndex((x) => x.code === code);
    return i < cursor ? 'done' : i === cursor ? 'current' : 'todo';
  };
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
