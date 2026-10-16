import { useEffect, useState } from 'react';
import { FEATURES } from '../features';
import { BUILTIN_PATCHES } from '../audio/builtins';
import type { useAudioEngine } from '../hooks/useAudioEngine';
import type { useGeolocation } from '../hooks/useGeolocation';

interface Props {
  audio: ReturnType<typeof useAudioEngine>;
  gps: ReturnType<typeof useGeolocation>;
}

interface Snapshot {
  ua: string;
  dpr: number;
  innerW: number;
  innerH: number;
  geoStatus: string;
  geoAccuracy: string;
  geoFixAge: string;
  geoMph: string;
  geoEstimated: string;
  acState: string;
  sampleRate: string;
  baseLatency: string;
  engineRunning: string;
  engineId: string;
  iceMode: string;
  workletError: string;
}

function readSnapshot(audio: Props['audio'], gps: Props['gps']): Snapshot {
  const eng = audio.getEngine();
  const ctx = eng?.context ?? audio.context.current;
  const diag = audio.getDiag();

  let geoFixAge = '—';
  if (gps.timestamp != null) {
    geoFixAge = `${Math.max(0, Date.now() - gps.timestamp)} ms`;
  }

  const baseLatency =
    ctx && typeof ctx.baseLatency === 'number' && Number.isFinite(ctx.baseLatency)
      ? `${(ctx.baseLatency * 1000).toFixed(1)} ms`
      : 'n/a';

  return {
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio || 1,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    geoStatus: gps.status,
    geoAccuracy: gps.accuracy != null ? `±${Math.round(gps.accuracy)} m` : '—',
    geoFixAge,
    geoMph: Number.isFinite(gps.mph) ? `${gps.mph.toFixed(1)} mph` : '—',
    geoEstimated: gps.estimated ? 'haversine' : gps.status === 'live' ? 'coords' : '—',
    acState: diag.contextState || ctx?.state || 'not started',
    sampleRate: ctx ? `${ctx.sampleRate} Hz` : '—',
    baseLatency,
    engineRunning: diag.running || audio.running ? 'yes' : 'no',
    engineId: diag.engineId || audio.engineId || '—',
    iceMode: diag.iceMode,
    workletError: diag.workletError ?? '—',
  };
}

export function DiagPage({ audio, gps }: Props) {
  const [snap, setSnap] = useState<Snapshot>(() => readSnapshot(audio, gps));

  useEffect(() => {
    const tick = () => setSnap(readSnapshot(audio, gps));
    tick();
    const id = window.setInterval(tick, 500);
    const onResize = () => tick();
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', onResize);
    };
  }, [audio, gps]);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'UA', value: snap.ua },
    { label: 'DPR', value: String(snap.dpr) },
    { label: 'Viewport', value: `${snap.innerW}×${snap.innerH}` },
    { label: 'Geo status', value: snap.geoStatus },
    { label: 'Geo accuracy', value: snap.geoAccuracy },
    { label: 'Geo fix age', value: snap.geoFixAge },
    { label: 'Geo mph', value: snap.geoMph },
    { label: 'Geo speed source', value: snap.geoEstimated },
    { label: 'AudioContext.state', value: snap.acState },
    { label: 'sampleRate', value: snap.sampleRate },
    { label: 'baseLatency', value: snap.baseLatency },
    { label: 'Engine running', value: snap.engineRunning },
    // CJ preview: internal ids (e.g. aerospace-f14) never shown; display name instead.
    FEATURES.garage ? { label: 'Engine id', value: snap.engineId } : { label: 'Engine', value: BUILTIN_PATCHES.find((p) => p.id === snap.engineId)?.name ?? 'Custom engine' },
    { label: 'iceMode', value: snap.iceMode },
    { label: 'workletError', value: snap.workletError },
  ];

  return (
    <div className="diag-page">
      <h1 className="page-title">Diagnostics</h1>
      <p className="page-blurb">
        Parked Tesla / phone checks: unlock vs mute vs worklet. Start on Drive first — you should hear a short
        idle chuff. Then open Diag. Hard-refresh after deploys. Turn off silent mode on iPhone.
      </p>
      <dl className="diag-grid">
        {rows.map((r) => (
          <div key={r.label} className="diag-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
