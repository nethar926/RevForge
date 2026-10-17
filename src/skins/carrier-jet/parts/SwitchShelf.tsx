import type { CSSProperties } from 'react';
import { BatToggle } from './BatToggle';
import { GuardedCover } from './GuardedCover';
import { CJ_SHELF_BOTTOM_ROW_IDS, labelLines, SHELF_CHROME, shelfGroups, shelfMetrics, TOGGLE_MIN, type CjShelfItem } from './tokens';
import type { CjAnnunciator, CjShelfSwitch, CjSwitchShelfProps, CjSystemEntry, CjToggleState } from '../types';
import './parts.css';

/** Engraved short label from Dan's neutral label when the host gives none ("L engine start" → "L ENGINE START"). */
function defaultLabel(e: CjSystemEntry): string {
  return labelLines(e.label).join(' ');
}

function Cell({ item, sw, guardOpen, onToggle, onGuardToggle, showSteps }: {
  item: CjShelfItem; sw: CjShelfSwitch | undefined; guardOpen: boolean | undefined; onToggle: (id: string, n: CjToggleState) => void;
  onGuardToggle?: (id: string) => void; showSteps: boolean;
}) {
  const e = item.entry!;
  const label = sw?.label ?? defaultLabel(e);
  const step = sw?.step ?? (showSteps && e.required ? e.order : undefined);
  const toggle = (
    <BatToggle
      id={e.id}
      label={label}
      ariaLabel={sw?.ariaLabel ?? e.label}
      state={sw?.state ?? 'off'}
      lit={sw?.lit ?? false}
      disabled={sw?.disabled}
      disabledReason={sw?.disabledReason}
      legend={sw?.legend}
      cue={sw?.cue}
      step={step}
      pressHandlers={sw?.pressHandlers}
      onToggle={onToggle}
    />
  );
  if (guardOpen === undefined) return toggle;
  return (
    <GuardedCover id={e.id} name={label} ariaLabel={`${e.label} guard, ${guardOpen ? 'open' : 'closed'}`} guardOpen={guardOpen} onGuardToggle={(id) => onGuardToggle?.(id)} disabled={sw?.disabled} disabledReason={sw?.disabledReason}>
      {toggle}
    </GuardedCover>
  );
}

function Ann({ a }: { a: CjAnnunciator }) {
  return <span className="cjp-ann" data-tone={a.tone} data-ann={a.id}>{a.label}</span>;
}

/**
 * Park-only switch shelf: a hinged gunmetal drawer that fills the reflow board box (1248×641 at 1280,
 * 757×376 at 773) and lays the host's systems out in engraved group frames, two rows:
 * POWER · FUEL · LIGHTS over ENGINES · SYSTEMS. Cells scale together (container query) from 1× (`shelfMetrics`
 * min) up to 1.9×. `open`: closed = hidden + inert, opening = 300ms slide up (Reduce Motion: instant), open.
 */
export function SwitchShelf({ systems, switches, onToggle, guards, onGuardToggle, mode, block, open, annunciators = [], exclude = CJ_SHELF_BOTTOM_ROW_IDS, showSteps = true, ariaLabel = 'Switch shelf' }: CjSwitchShelfProps) {
  const groups = shelfGroups(systems, { mode, hasBlock: block != null, exclude, guards });
  const m = shelfMetrics(groups);
  const C = SHELF_CHROME;
  // one cell scale (declared on the panel, so 100cqw/cqh read the section, the size container) for the whole shelf: the tightest row width, or the height, whichever binds
  const fits = [
    ...m.rowFixed.map((f, i) => `calc((100cqw - ${f}px) / ${m.rowUnits[i]} * ${TOGGLE_MIN.w})`),
    `calc((100cqh - ${m.heightFixed}px) / ${m.heightUnits} * ${TOGGLE_MIN.w})`,
  ];
  const style = {
    '--cjp-cell': `clamp(${TOGGLE_MIN.w}px, min(${fits.join(', ')}), ${TOGGLE_MIN.w * 1.9}px)`,
    '--pad-x': `${C.padX}px`, '--pad-top': `${C.padTop}px`, '--pad-bottom': `${C.padBottom}px`,
    '--g-pad-x': `${C.groupPadX}px`, '--g-pad-top': `${C.groupPadTop}px`, '--g-pad-bottom': `${C.groupPadBottom}px`,
    '--g-gap': `${C.groupGap}px`, '--row-gap': `${C.rowGap}px`, '--cell-gap': `${C.cellGap}px`,
  } as CSSProperties;
  return (
    <section className="cjp-shelf" data-open={open} data-mode={mode} aria-label={ariaLabel} aria-hidden={open === 'closed' || undefined} inert={open === 'closed' || undefined} style={{ minWidth: m.min.w, minHeight: m.min.h }} data-min-w={m.min.w} data-min-h={m.min.h}>
      <div className="cjp-shelf-panel cjp-metal" style={style}>
        <span className="cjp-shelf-hinge" aria-hidden="true" />
        <i className="cjp-screw" data-pos="tl" aria-hidden="true" />
        <i className="cjp-screw" data-pos="tr" aria-hidden="true" />
        <i className="cjp-screw" data-pos="bl" aria-hidden="true" />
        <i className="cjp-screw" data-pos="br" aria-hidden="true" />
        <header className="cjp-shelf-head">
          <span className="cjp-eng cjp-shelf-title">SWITCH SHELF</span>
          <span className="cjp-eng cjp-eng--amber">COLD START</span>
          {annunciators.length ? (
            <span className="cjp-anns" role="list" aria-label="Annunciators">
              {annunciators.map((a) => <span role="listitem" key={a.id}><Ann a={a} /></span>)}
            </span>
          ) : null}
        </header>
        <div className="cjp-shelf-rows">
          {m.rows.map((row, ri) => (
            <div className="cjp-shelf-row" key={ri}>
              {row.map((g) => (
                <div className="cjp-group" role="group" aria-label={g.group} key={g.group} data-group={g.group}>
                  <span className="cjp-eng cjp-group-title" aria-hidden="true">{g.group}</span>
                  <div className="cjp-group-cells">
                    {g.items.map((it) => (
                      <div className="cjp-cell" key={it.id} data-kind={it.kind} style={{ width: `calc(var(--cjp-cell) * ${it.w / TOGGLE_MIN.w})` }}>
                        {it.kind === 'block' ? block : (
                          <Cell
                            item={it}
                            sw={switches[it.id]}
                            guardOpen={guards && Object.prototype.hasOwnProperty.call(guards, it.id) ? guards[it.id] : undefined}
                            onToggle={onToggle}
                            onGuardToggle={onGuardToggle}
                            showSteps={showSteps}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
