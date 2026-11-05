import type { CSSProperties, KeyboardEvent } from 'react';
import type { LockStage } from '../../audio/types';
import {
  ION_DRIVE_MODES,
  ION_DRIVE_MODE_TEXT,
  ION_STAGE_TEXT,
  ionLadderLit,
  type IonDriveMode,
  type IonMapOrient,
} from '../../packs/ionTwin';
import {
  TI_BOX,
  TI_CELLS,
  TI_HOST_FOOT,
  TI_MAP_KEYS,
  TI_MODE_KEYS,
  TI_SCOPE,
  type TiSize,
} from '../../packs/ion-twin/layouts';
import { TI_RIVETS } from '../../packs/ion-twin/rivets';
import scope1280 from './assets/scope-1280.png';
import scope773 from './assets/scope-773.png';
import mapStandin from './assets/map.png';
import frame1280 from './assets/frame-ti-cj-drive-1280x800.png';
import frame1024 from './assets/frame-ti-cj-drive-1024x705.png';
import frame773 from './assets/frame-ti-cj-drive-773x601.png';
import './ion-twin-cj.css';

export type TiPower = 'off' | 'batt' | 'on';

export interface IonTwinBoardProps {
  size: TiSize;
  power: TiPower;
  motion: boolean;
  glyphsOn: boolean;
  onToggleGlyphs: () => void;
  mode: IonDriveMode;
  onMode: (m: IonDriveMode) => void;
  mapOrient: IonMapOrient;
  onMapOrient: (o: IonMapOrient) => void;
  mapZoom: number;
  onMapZoom: (z: number) => void;
  speed: number;
  unit: 'mph' | 'kph';
  gear: number;
  rpm: number;
  rpmNorm: number;
  throttle: number;
  load: number;
  lockStage: LockStage;
  /** Optional GPS/stale flags — when true, show OFF flags instead of false zeroes. */
  stale?: boolean;
  headingDeg?: number;
  latG?: number;
  longG?: number;
}

const styleBox = (r: { left: number; top: number; width: number; height: number }): CSSProperties => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});
/** Keys: leave height to --ti-tap so tap floor survives mount scale. */
const styleKey = (r: { left: number; top: number; width: number }): CSSProperties => ({
  left: r.left,
  top: r.top,
  width: r.width,
});

const keepSpace = (e: KeyboardEvent<HTMLButtonElement>) => {
  if (e.code === 'Space' || e.key === ' ') e.stopPropagation();
};

/** Original Cold Glass board: cells, scope PNG (pixel-identical to v3.2), stand-in map. */
export function IonTwinBoard({
  size,
  power,
  motion,
  glyphsOn,
  onToggleGlyphs,
  mode,
  onMode,
  mapOrient,
  onMapOrient,
  mapZoom,
  onMapZoom,
  speed,
  unit,
  gear,
  rpm,
  rpmNorm,
  throttle,
  load,
  lockStage,
  stale = false,
  headingDeg,
  latG = 0.12,
  longG = -0.08,
}: IonTwinBoardProps) {
  const cells = TI_CELLS[size];
  const scope = TI_SCOPE[size];
  const modeKey = TI_MODE_KEYS[size];
  const mapKey = TI_MAP_KEYS[size];
  const scopeSrc = scope.asset === '1280' ? scope1280 : scope773;
  const frameSrc = size === 'd1280' ? frame1280 : size === 'd1024' ? frame1024 : frame773;
  const box = TI_BOX[size];
  const rivets = TI_RIVETS[size] ?? [];
  const spd = Math.max(0, Math.round(speed));
  const unitText = unit === 'kph' ? 'km/h' : 'MPH';
  const gearText = gear <= 0 ? 'N' : String(gear);
  const rpmShown = power === 'on' ? Math.round(rpm / 10) * 10 : 0;
  const thrPct = Math.round(unit01(throttle) * 100);
  const loadPct = Math.round(unit01(load) * 100);
  const voicePct = Math.round(unit01(rpmNorm) * 100);
  const hdg = headingDeg !== undefined && Number.isFinite(headingDeg) ? Math.round(((headingDeg % 360) + 360) % 360) : 270;
  const lit = power === 'on' ? ionLadderLit(lockStage) : null;
  const powered = power === 'on';
  const cautionOn = power === 'batt' || (powered && stale);
  const cellsOn = power !== 'off';

  return (
    <div
      className="ti-cj"
      data-skin="ion-twin"
      data-size={size}
      data-power={power}
      data-glyphs={glyphsOn ? 'on' : 'off'}
      data-motion={motion ? 'on' : 'off'}
      data-lock-stage={lockStage}
      data-stale={stale ? 'true' : undefined}
    >
      <img className="ti-frame" src={frameSrc} width={box.w} height={box.h} alt="" draggable={false} />
      <svg className="ti-rivets" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        {rivets.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1.5} fill="#9da8b8" stroke="#101318" />
        ))}
      </svg>
      <div className="ti-title" style={styleBox(cells.title)}>
        <b>COLD GLASS · TWIN ION</b>
        <span>CJ GRID / TARGET LOCK</span>
      </div>

      <button
        type="button"
        className="ti-key"
        style={styleKey(cells.glyphs)}
        aria-label={`Decorative Aurebesh glyphs ${glyphsOn ? 'on' : 'off'}`}
        aria-pressed={glyphsOn}
        onClick={onToggleGlyphs}
        onKeyDown={keepSpace}
        onKeyUp={keepSpace}
      >
        {glyphsOn ? 'GLYPHS ON' : 'GLYPHS OFF'}
      </button>

      <section data-cell="map" className="ti-cell ti-map" style={styleBox(cells.map)}>
        <header>
          <span className="ti-ab" aria-hidden="true">
            map
          </span>
          MAP
        </header>
        <span className="ti-standin">STAND-IN · shared map</span>
        <div
          className="ti-mapface"
          role="img"
          aria-label={
            !powered
              ? 'Map: unpowered'
              : stale
                ? 'Map: cached stand-in art; position off, stale GPS'
                : 'Map: recoloured Carrier Jet stand-in, constant red route and car marker; position available'
          }
          data-readout
        >
          {powered && (
            <>
              <img src={mapStandin} alt="" draggable={false} />
              <svg className="ti-route" viewBox="0 0 358 340" preserveAspectRatio="none" aria-hidden="true">
                <path d="M178 171 L139 170 L145 128 L148 104 L143 76 L138 55 L126 37 L93 20 L89 0" fill="none" stroke="#000" strokeWidth="5" />
                <path d="M178 171 L139 170 L145 128 L148 104 L143 76 L138 55 L126 37 L93 20 L89 0" fill="none" stroke="#ff2a1a" strokeWidth="2.4" />
                <path d="M168 171 L185 163 L181 171 L185 178 Z" fill="#ff2a1a" stroke="#000" />
                <path
                  d="M5 24 V5 H24 M334 5 H353 V24 M5 316 V335 H24 M334 335 H353 V316 M10 318 H90 M10 311 V318 M30 314 V318 M50 314 V318 M70 314 V318 M90 311 V318"
                  fill="none"
                  stroke="#ff2a1a"
                  strokeWidth="2"
                />
              </svg>
              <span className="ti-range">5 MI</span>
            </>
          )}
          {powered && stale && <span className="ti-off">OFF</span>}
        </div>
      </section>

      <section data-cell="speed" className="ti-cell" style={styleBox(cells.speed)}>
        <header>
          <span className="ti-ab" aria-hidden="true">
            velocity
          </span>
          VELOCITY
        </header>
        <div
          className="ti-face"
          role="img"
          aria-label={
            !powered
              ? 'Velocity unpowered'
              : stale
                ? 'Velocity unavailable'
                : `Velocity ${spd} ${unit === 'kph' ? 'kilometers per hour' : 'miles per hour'}; gear ${gearText}`
          }
          data-readout
        >
          {powered && !stale && (
            <div className="ti-split">
              <div>
                <strong>{spd}</strong>
                <small>{unitText}</small>
              </div>
              <div>
                <small>GEAR</small>
                <b className="ti-gear">{gearText}</b>
              </div>
            </div>
          )}
          {powered && stale && <span className="ti-off">OFF</span>}
        </div>
      </section>

      <section data-cell="mach" className="ti-cell" style={styleBox(cells.mach)}>
        <header>
          <span className="ti-ab" aria-hidden="true">
            tach
          </span>
          TACH
        </header>
        <div
          className="ti-face"
          role="img"
          aria-label={powered ? `Tach ${rpmShown.toLocaleString('en-US')} RPM; ion voice level ${voicePct} percent` : 'Tach unpowered'}
          data-readout
        >
          {powered && (
            <>
              <b className="ti-rpm">{rpmShown.toLocaleString('en-US')}</b>
              <small>RPM ×1</small>
              <svg className="ti-wave" viewBox="0 0 200 30" aria-hidden="true">
                <path
                  d={wavePath(rpmNorm)}
                  fill="none"
                  stroke="#9ad8ff"
                  strokeWidth="1.5"
                />
              </svg>
            </>
          )}
        </div>
      </section>

      <div
        data-cell="vdi"
        className="ti-scope"
        style={{ left: scope.left, top: scope.top, width: scope.size, height: scope.size }}
        role="img"
        aria-label={
          powered
            ? `Targeting scope: ${ION_STAGE_TEXT[lockStage]}, ${voicePct} percent`
            : power === 'batt'
              ? 'Targeting scope unpowered; on standby'
              : 'Targeting scope off'
        }
        data-readout
      >
        <img src={scopeSrc} width={scope.size} height={scope.size} alt="" draggable={false} />
      </div>

      <section data-cell="compass" className="ti-cell" style={styleBox(cells.compass)}>
        <header>
          <span className="ti-ab" aria-hidden="true">
            sensor / lock
          </span>
          SENSOR / LOCK
        </header>
        <div
          className="ti-face"
          role="img"
          aria-label={
            !powered
              ? 'Sensor unpowered'
              : stale
                ? `Sensor heading off; throttle off; load off; ${ION_STAGE_TEXT[lockStage]}`
                : `Sensor heading ${hdg} degrees; throttle ${thrPct} percent; load ${loadPct} percent; ${ION_STAGE_TEXT[lockStage]}`
          }
          data-readout
        >
          {powered && !stale && (
            <>
              <div className="ti-sysline">
                HDG {hdg}°
                <span>
                  THR {thrPct}% · LOAD {loadPct}%
                </span>
              </div>
              <div className="ti-ladder">
                <i className={`ti-lamp${lit === 'scan' ? ' on' : ''}`} />
                SCAN <i className={`ti-lamp${lit === 'ident' ? ' on' : ''}`} />
                IDENT <i className={`ti-lamp${lit === 'lock' ? ' on' : ''}`} />
                LOCK
              </div>
            </>
          )}
          {powered && stale && (
            <>
              <div className="ti-sysline">
                HDG <span className="ti-off" data-channel="heading">OFF</span>
                <span>
                  THR <span className="ti-off" data-channel="throttle">OFF</span>{' '}
                  LOAD <span className="ti-off" data-channel="load">OFF</span>
                </span>
              </div>
              <div className="ti-ladder">
                <i className="ti-lamp" />
                SCAN <i className="ti-lamp" />
                IDENT <i className={`ti-lamp${lit === 'lock' ? ' on' : ''}`} />
                LOCK
              </div>
            </>
          )}
        </div>
      </section>

      {mapKey.labels.map((label, i) => {
        const left = cells.mapKeys.left + i * (mapKey.w + mapKey.gap);
        const selected =
          (label === 'N-UP' && mapOrient === 'n-up') ||
          (label === 'ZM+' && false) ||
          (label === 'ZM−' && false);
        return (
          <button
            key={label}
            type="button"
            className={`ti-key${selected ? ' selected' : ''}`}
            style={styleKey({ left, top: cells.mapKeys.top, width: mapKey.w })}
            aria-label={`Map ${label}`}
            aria-pressed={label === 'N-UP' ? mapOrient === 'n-up' : undefined}
            onClick={() => {
              if (label === 'ZM+') onMapZoom(Math.min(4, mapZoom + 1));
              else if (label === 'ZM−') onMapZoom(Math.max(0, mapZoom - 1));
              else onMapOrient(mapOrient === 'n-up' ? 'trk-up' : 'n-up');
            }}
            onKeyDown={keepSpace}
            onKeyUp={keepSpace}
          >
            {label === 'N-UP' && mapOrient === 'trk-up' ? 'TRK' : label}
          </button>
        );
      })}

      {ION_DRIVE_MODES.map((m, i) => {
        const left = cells.modes.left + i * (modeKey.w + modeKey.gap);
        return (
          <button
            key={m}
            type="button"
            className={`ti-key${mode === m ? ' selected' : ''}`}
            style={styleKey({ left, top: cells.modes.top, width: modeKey.w })}
            aria-label={`Ion drive mode ${ION_DRIVE_MODE_TEXT[m]}`}
            aria-pressed={mode === m}
            onClick={() => onMode(m)}
            onKeyDown={keepSpace}
            onKeyUp={keepSpace}
          >
            {ION_DRIVE_MODE_TEXT[m]}
          </button>
        );
      })}

      <section data-cell="accel" className="ti-cell" style={styleBox(cells.accel)}>
        <header>
          <span className="ti-ab" aria-hidden="true">
            inertia
          </span>
          INERTIA
        </header>
        <div
          className="ti-face"
          role="img"
          aria-label={
            !powered
              ? 'G meter unpowered'
              : stale
                ? 'G meter: lateral off; longitudinal off; stale position'
                : `G meter: lateral ${fmtG(latG)} G, longitudinal ${fmtG(longG)} G`
          }
          data-readout
        >
          {powered && !stale && (
            <>
              <div className="ti-sysline">
                <b>LAT {fmtG(latG)} G</b>
                <b>LONG {fmtG(longG)} G</b>
              </div>
              <div className="ti-gmeters">
                <i className="ti-gbar lat">
                  <em style={{ left: `${50 + latG * 40}%` }} />
                </i>
                <i className="ti-gbar long">
                  <em style={{ left: `${50 + longG * 40}%` }} />
                </i>
              </div>
            </>
          )}
          {powered && stale && (
            <>
              <div className="ti-sysline">
                <b>LAT <span className="ti-off" data-channel="lateral">OFF</span> G</b>
                <b>LONG <span className="ti-off" data-channel="longitudinal">OFF</span> G</b>
              </div>
              <div className="ti-gmeters" aria-hidden="true">
                <i className="ti-gbar lat"><em /></i>
                <i className="ti-gbar long"><em /></i>
              </div>
            </>
          )}
        </div>
      </section>

      <div
        className="ti-power"
        style={styleBox(cells.power)}
        role="img"
        aria-label={
          power === 'off'
            ? 'Ion systems: all off'
            : power === 'batt'
              ? 'Ion systems: battery powered; engine off; caution steady'
              : cautionOn
                ? 'Ion systems: all powered, caution steady'
                : 'Ion systems: all powered, caution clear'
        }
        data-readout
      >
        <i className={`ti-lamp${cellsOn ? ' on' : ''}`} />
        <span>
          ION CELLS
          <br />
          {power === 'on' ? 'RUN' : power === 'batt' ? 'BATT' : 'OFF'}
        </span>
        <i className={`ti-lamp${cautionOn ? ' on' : ''}`} />
        <span>
          CAUTION
          <br />
          {cautionOn ? 'SET' : 'CLEAR'}
        </span>
      </div>

      {size === 'd773' && (
        <div className="ti-hostfoot" style={styleBox(TI_HOST_FOOT)} aria-hidden="true">
          HOST CONTROLS
        </div>
      )}

    </div>
  );
}

function unit01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function fmtG(g: number): string {
  const n = Number.isFinite(g) ? g : 0;
  const sign = n < 0 ? '−' : '+';
  return `${sign}${Math.abs(n).toFixed(2)}`;
}

/** Deterministic ion-voice wave from rpmNorm (no animation; Reduce Motion safe). */
function wavePath(rpmNorm: number): string {
  const amp = 4 + unit01(rpmNorm) * 10;
  const pts: string[] = [];
  for (let x = 0; x <= 200; x += 8) {
    const y = 15 + Math.sin((x / 200) * Math.PI * 4 + unit01(rpmNorm) * 2) * amp * (0.4 + 0.6 * Math.sin((x / 40) + 1));
    pts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
