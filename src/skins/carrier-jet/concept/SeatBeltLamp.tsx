/**
 * SEAT BELT lamp (mock): a dash annunciator in cockpit style, not the car's pictogram. Engraved legend on a matte
 * lens, backlit white when on (with a single low tone, played by the host), unlit dark grey when off.
 */
export function SeatBeltLamp({ on }: { on: boolean }) {
  return (
    <div className="sbl" data-on={on || undefined} role="img" aria-label={on ? 'Seat belt sign, on' : 'Seat belt sign, off'}>
      <span className="sbl-lens" aria-hidden="true">
        <span>FASTEN</span>
        <span>SEAT BELT</span>
      </span>
    </div>
  );
}
