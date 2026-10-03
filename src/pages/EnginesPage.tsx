import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EngineKind, EngineParams, EnginePatch } from '../audio';
import { BUILTIN_PATCHES, STELLAR_HELM_PACK } from '../audio';
import { isEngineIdVisible } from '../packs/registry';
import type { useAudioEngine } from '../hooks/useAudioEngine';
import type { UiPrefs } from '../hooks/useUiPrefs';

interface Props {
  selectedId: string;
  userPatches: EnginePatch[];
  onSelect: (patch: EnginePatch) => void;
  onDeleteUserPatch: (id: string) => void;
  audio: ReturnType<typeof useAudioEngine>;
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
}

const SNIPPET_BY_ID: Record<string, string> = {
  'v8-rumble': 'snippets/v8-rumble.wav',
  'i4-zip': 'snippets/i4-zip.wav',
  'i6-silk': 'snippets/i6-silk.wav',
  'rotary-hum': 'snippets/rotary-hum.wav',
  'ev-whine': 'snippets/ev-whine.wav',
  'ev-inverter-climb': 'snippets/ev-inverter-climb.wav',
  'ev-regen-howl': 'snippets/ev-regen-howl.wav',
  'ev-dual-motor': 'snippets/ev-dual-motor.wav',
  'ion-twin': 'snippets/ion-twin.wav',
  'tie-fighter': 'snippets/ion-twin.wav', // legacy prefs / deep-link id
  'aerospace-f14': 'snippets/aerospace-f14.wav',
  'night-pursuit': 'snippets/night-pursuit.wav',
  [STELLAR_HELM_PACK.id]: `snippets/${STELLAR_HELM_PACK.id}.wav`,
};

/** Product Research taxonomy — all free, never Launch Pack / paywall groups. */
const CATEGORIES: { kind: EngineKind; label: string }[] = [
  { kind: 'ice', label: 'Internal Combustion' },
  { kind: 'ev-whine', label: 'EV' },
  { kind: 'aerospace', label: 'Aerospace' },
  { kind: 'scifi', label: 'SciFi' },
];

const SCREAM_DEFAULTS = {
  formantHowl: 0.72,
  corePitch: 110,
  carrierBite: 0.42,
  wetHiss: 0.55,
};

type ScreamState = typeof SCREAM_DEFAULTS;

function isIonTwinScreamPatch(p: EnginePatch | undefined): boolean {
  if (!p) return false;
  if (p.id === 'ion-twin' || p.id === 'tie-fighter') return true;
  // topology: ion-twin (Audio rename); tie-fighter legacy alias
  return p.kind === 'scifi' || p.topology === 'ion-twin' || (p.topology as string) === 'tie-fighter';
}

function screamFromParams(p: Partial<EngineParams> | null | undefined): ScreamState {
  return {
    formantHowl: Number(p?.formantHowl ?? SCREAM_DEFAULTS.formantHowl),
    corePitch: Number(p?.corePitch ?? SCREAM_DEFAULTS.corePitch),
    carrierBite: Number(p?.carrierBite ?? SCREAM_DEFAULTS.carrierBite),
    wetHiss: Number(p?.wetHiss ?? SCREAM_DEFAULTS.wetHiss),
  };
}

export function EnginesPage({
  selectedId,
  userPatches,
  onSelect,
  onDeleteUserPatch,
  audio,
  prefs,
  update,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastIntensityRef = useRef(SCREAM_DEFAULTS.formantHowl);
  const [screamOn, setScreamOn] = useState(true);
  const [scream, setScream] = useState<ScreamState>(() => screamFromParams(SCREAM_DEFAULTS));

  const playSnippet = (src: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = `${import.meta.env.BASE_URL}${src}`;
    void a.play().catch(() => {});
  };

  const byKind = useMemo(() => {
    const map = new Map<EngineKind, EnginePatch[]>();
    for (const c of CATEGORIES) map.set(c.kind, []);
    for (const p of BUILTIN_PATCHES) {
      if (!isEngineIdVisible(p.id) && p.id !== selectedId) continue;
      const list = map.get(p.kind) ?? [];
      list.push(p);
      map.set(p.kind, list);
    }
    return map;
  }, []);

  const selectedPatch = useMemo(() => {
    return (
      BUILTIN_PATCHES.find((p) => p.id === selectedId) ??
      userPatches.find((p) => p.id === selectedId)
    );
  }, [selectedId, userPatches]);

  const showScream = isIonTwinScreamPatch(selectedPatch);

  useEffect(() => {
    if (!showScream) return;
    const live = audio.getEngine()?.getParams();
    const base = screamFromParams(
      live ?? (selectedPatch?.params as EngineParams) ?? SCREAM_DEFAULTS,
    );
    setScream(base);
    const on = base.formantHowl > 0.001;
    setScreamOn(on);
    if (on) lastIntensityRef.current = base.formantHowl;
  }, [showScream, selectedId, audio, selectedPatch]);

  const pushScream = (partial: Partial<ScreamState>) => {
    setScream((prev) => {
      const next = { ...prev, ...partial };
      audio.getEngine()?.setParams({ ...next });
      return next;
    });
  };

  const onDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete preset “${name}”? This cannot be undone.`)) return;
    onDeleteUserPatch(id);
  };

  return (
    <div className="page engines-page">
      <header className="page-head">
        <h1>Garage</h1>
        <p className="page-sub">All packs unlocked · free forever · ICE · EV · Aerospace · SciFi</p>
      </header>

      {CATEGORIES.map((c) => {
        const packs = byKind.get(c.kind) ?? [];
        if (packs.length === 0) return null;
        return (
          <section key={c.kind}>
            <h2 className="section-title">{c.label}</h2>
            <div className="engine-grid">
              {packs.map((p) => (
                <EngineCard
                  key={p.id}
                  patch={p}
                  selected={selectedId === p.id}
                  onSelect={() => onSelect(p)}
                  snippetSrc={SNIPPET_BY_ID[p.id]}
                  onPreview={playSnippet}
                />
              ))}
            </div>
          </section>
        );
      })}

      {userPatches.length > 0 && (
        <section>
          <h2 className="section-title">Your presets</h2>
          <div className="engine-grid">
            {userPatches.map((p) => (
              <EngineCard
                key={p.id}
                patch={p}
                selected={selectedId === p.id}
                onSelect={() => onSelect(p)}
                onDelete={() => onDelete(p.id, p.name)}
              />
            ))}
          </div>
        </section>
      )}

      {showScream && (
        <section className="panel ion-scream-panel">
          <h2 className="section-title">Ion Twin scream</h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={screamOn}
              onChange={(e) => {
                const on = e.target.checked;
                setScreamOn(on);
                if (on) {
                  const intensity = lastIntensityRef.current || SCREAM_DEFAULTS.formantHowl;
                  pushScream({ formantHowl: intensity });
                } else {
                  if (scream.formantHowl > 0.001) lastIntensityRef.current = scream.formantHowl;
                  pushScream({ formantHowl: 0 });
                }
              }}
            />
            <span>Scream</span>
          </label>
          <label className="slider-block">
            <div className="slider-head">
              <span>Intensity</span>
              <span>{scream.formantHowl.toFixed(2)}</span>
            </div>
            <input
              className="big-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={scream.formantHowl}
              disabled={!screamOn}
              onChange={(e) => {
                const v = Number(e.target.value);
                lastIntensityRef.current = v;
                pushScream({ formantHowl: v });
              }}
            />
          </label>
          <label className="slider-block">
            <div className="slider-head">
              <span>Pitch center</span>
              <span>{Math.round(scream.corePitch)} Hz</span>
            </div>
            <input
              className="big-slider"
              type="range"
              min={40}
              max={400}
              step={1}
              value={scream.corePitch}
              onChange={(e) => pushScream({ corePitch: Number(e.target.value) })}
            />
          </label>
          <label className="slider-block">
            <div className="slider-head">
              <span>Grit</span>
              <span>{scream.carrierBite.toFixed(2)}</span>
            </div>
            <input
              className="big-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={scream.carrierBite}
              onChange={(e) => pushScream({ carrierBite: Number(e.target.value) })}
            />
          </label>
          <label className="slider-block">
            <div className="slider-head">
              <span>Wet/Dry</span>
              <span>{scream.wetHiss.toFixed(2)}</span>
            </div>
            <input
              className="big-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={scream.wetHiss}
              onChange={(e) => pushScream({ wetHiss: Number(e.target.value) })}
            />
          </label>
          <label className="toggle-row mt tesla-touch">
            <input
              type="checkbox"
              checked={prefs.ionTwinLockSfx}
              onChange={(e) => update({ ionTwinLockSfx: e.target.checked })}
            />
            <span>Ion Twin lock SFX</span>
          </label>
          <p className="help-text dim">Optional chirp on TARGET LOCK (off by default).</p>
        </section>
      )}

      <Link to="/builder" className="cta-link">
        Open Synth Builder →
      </Link>
    </div>
  );
}

function EngineCard({
  patch,
  selected,
  onSelect,
  snippetSrc,
  onPreview,
  onDelete,
}: {
  patch: EnginePatch;
  selected: boolean;
  onSelect: () => void;
  snippetSrc?: string;
  onPreview?: (src: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`engine-card ${selected ? 'selected' : ''}`}>
      <button type="button" className="engine-card-main" onClick={onSelect}>
        <div className="engine-card-top">
          <span className={`kind-pill kind-${patch.kind}`}>{patch.kind}</span>
          <span className="free-pill">FREE</span>
        </div>
        <div className="engine-card-name">{patch.name}</div>
        <div className="engine-card-blurb">{patch.meta?.blurb ?? patch.topology}</div>
        {selected && <div className="engine-card-active">Active</div>}
      </button>
      {snippetSrc && onPreview && (
        <button
          type="button"
          className="engine-preview-btn"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(snippetSrc);
          }}
        >
          Preview
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="engine-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
