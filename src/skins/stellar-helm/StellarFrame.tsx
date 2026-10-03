import './frame-helm.css';
import './frame-classic.css';

export type FrameStyle = 'helm' | 'classic';

/**
 * Decorative frame layer only (aria-hidden). Palette + panel treatment live in
 * frame-helm.css / frame-classic.css as CSS custom properties on `.sh[data-frame]`;
 * every instrument (rings, RPM/MPH block, data rows, tabs, power bar) is frame-independent.
 */
export function StellarFrame({ frame }: { frame: FrameStyle }) {
  if (frame === 'classic') {
    return (
      <>
        <div className="shf-elbow shf-elbow-top" aria-hidden="true" />
        <div className="shf-topbar" aria-hidden="true">
          <i style={{ flex: 3 }} />
          <i style={{ flex: 1 }} className="b" />
          <i style={{ flex: 5 }} className="c" />
          <i style={{ flex: 1 }} className="d" />
          <i style={{ flex: 6 }} />
        </div>
        <div className="shf-elbow shf-elbow-bot" aria-hidden="true" />
      </>
    );
  }
  return (
    <>
      <div className="shf-corner tl" aria-hidden="true" />
      <div className="shf-corner tr" aria-hidden="true" />
      <div className="shf-corner bl" aria-hidden="true" />
      <div className="shf-corner br" aria-hidden="true" />
      <div className="shf-hairline" aria-hidden="true" />
    </>
  );
}
