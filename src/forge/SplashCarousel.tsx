import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { LISTED_THEMES } from "../themes/catalog";
import { ThumbPreview } from "../themes/ThemePicker";
import "./splash-carousel.css";

/**
 * Splash carousel (Wilson, Oct 19 2026): one slide per visible theme, auto-advancing horizontally.
 * The active dot stretches into a pill whose bar fills over DWELL_MS; when full, the next slide shows.
 * Swipe / drag, a dot, or the arrow keys move it; any interaction holds auto-advance for HOLD_MS, then it resumes.
 * Pause / play key. Reduce Motion: no auto-advance, no fill, no slide animation (manual only, static dots).
 * Original visuals only: the slides use each theme's own picker art.
 */
const DWELL_MS = 5000;
const HOLD_MS = 6000;
const SWIPE_PX = 48;

function useReducedMotion(): boolean {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [rm, setRm] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setRm(q.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, [q]);
  return rm;
}

export function SplashCarousel({ selected, onOpen }: { selected: string; onOpen: (id: string) => void }) {
  const slides = LISTED_THEMES.filter((t) => t.family !== "RoadView");
  const n = slides.length;
  const rm = useReducedMotion();
  const [idx, setIdx] = useState(() => Math.max(0, slides.findIndex((t) => t.id === selected)));
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [cycle, setCycle] = useState(0); // restarts the fill
  const [drag, setDrag] = useState(0);
  const holdT = useRef<number | undefined>(undefined);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const auto = playing && !rm && n > 1;

  const hold = useCallback(() => {
    setHeld(true);
    window.clearTimeout(holdT.current);
    holdT.current = window.setTimeout(() => { setHeld(false); setCycle((c) => c + 1); }, HOLD_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(holdT.current), []);
  const go = useCallback((i: number, user = true) => {
    setIdx(((i % n) + n) % n);
    setCycle((c) => c + 1);
    if (user) hold();
  }, [n, hold]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
  };
  const pd = (e: PointerEvent) => { if (e.button === 0) down.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const pm = (e: PointerEvent) => {
    const d = down.current; if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - d.y)) { d.moved = true; hold(); }
    if (d.moved) setDrag(dx);
  };
  const pu = () => {
    const d = down.current; down.current = null;
    if (d?.moved) { if (drag <= -SWIPE_PX) go(idx + 1); else if (drag >= SWIPE_PX) go(idx - 1); dragged.current = true; window.setTimeout(() => { dragged.current = false; }, 0); }
    setDrag(0);
  };
  if (!n) return null;
  const cur = slides[idx];
  return (
    <section className="rf-car" aria-roledescription="carousel" aria-label="Themes" data-rm={rm || undefined} data-dragging={drag !== 0 || undefined} onKeyDown={onKey}>
      <div className="rf-car-view" onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onPointerLeave={() => down.current && pu()}>
        <div className="rf-car-track" style={{ "--i": idx, "--drag": `${drag}px` } as CSSProperties}>
          {slides.map((t, i) => (
            <div key={t.id} className="rf-car-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}: ${t.name}`} aria-hidden={i !== idx || undefined} data-active={i === idx || undefined}
              style={{ "--sa": t.accent, "--ss": t.secondary } as CSSProperties}>
              <button type="button" className="rf-car-open" tabIndex={i === idx ? 0 : -1} aria-label={`Open ${t.name}`}
                onClick={() => { if (dragged.current) return; if (i !== idx) go(i); else onOpen(t.id); }}>
                <span className="rf-car-art" aria-hidden="true"><ThumbPreview layout={t.layout} accent={t.accent} secondary={t.secondary} uid={t.id} /></span>
                <span className="rf-car-cap"><strong>{t.name}</strong><small>{t.feature}</small></span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="rf-car-ctl">
        <div className="rf-car-dots" role="group" aria-label="Choose a theme">
          {slides.map((t, i) => (
            <button key={t.id} type="button" className="rf-car-dot" aria-label={`Show ${t.name}`} aria-current={i === idx || undefined} onClick={() => go(i)}>
              <span className="rf-car-pip">
                {i === idx && !rm && <span key={cycle} className="rf-car-fill" data-run={(auto && !held) || undefined} style={{ animationDuration: `${DWELL_MS}ms` }}
                  onAnimationEnd={() => go(idx + 1, false)} />}
              </span>
            </button>
          ))}
        </div>
        {!rm && n > 1 && (
          <button type="button" className="rf-car-play" aria-label={playing ? "Pause automatic slide show" : "Play automatic slide show"} onClick={() => { setPlaying((p) => !p); setHeld(false); window.clearTimeout(holdT.current); }}>
            {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" /></svg>}
          </button>
        )}
      </div>
      <p className="rf-car-sr" aria-live="polite">{auto && !held ? "" : `${cur.name}, ${idx + 1} of ${n}`}</p>
    </section>
  );
}
