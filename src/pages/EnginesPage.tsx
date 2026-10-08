import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EngineKind, EngineParams, EnginePatch } from '../audio';
import { BUILTIN_PATCHES, CHRONO_COUPE, STELLAR_HELM_PACK } from '../audio';
import { isEngineIdVisible } from '../packs/registry';
import type { useAudioEngine } from '../hooks/useAudioEngine';
import type { UiPrefs } from '../hooks/useUiPrefs';
import { HigSlider, HigSwitch, Icon, pctText } from '../ui/hig';

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
  [CHRONO_COUPE.id]: `snippets/${CHRONO_COUPE.id}.wav`,
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
          <div className="hig-group-body">
            <HigSwitch
              label="Scream"
              checked={screamOn}
              onChange={(on) => {
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
            <HigSlider label="Intensity" min={0} max={1} step={0.01} value={scream.formantHowl} disabled={!screamOn}
              display={`${Math.round(scream.formantHowl * 100)}%`} valueText={pctText(scream.formantHowl)}
              onChange={(v) => { lastIntensityRef.current = v; pushScream({ formantHowl: v }); }} />
            <HigSlider label="Pitch center" min={40} max={400} step={1} value={scream.corePitch}
              display={`${Math.round(scream.corePitch)} Hz`} valueText={`${Math.round(scream.corePitch)} hertz`}
              onChange={(v) => pushScream({ corePitch: v })} />
            <HigSlider label="Grit" min={0} max={1} step={0.01} value={scream.carrierBite}
              display={`${Math.round(scream.carrierBite * 100)}%`} valueText={pctText(scream.carrierBite)}
              onChange={(v) => pushScream({ carrierBite: v })} />
            <HigSlider label="Wet/dry mix" min={0} max={1} step={0.01} value={scream.wetHiss}
              display={`${Math.round(scream.wetHiss * 100)}%`} valueText={pctText(scream.wetHiss)}
              onChange={(v) => pushScream({ wetHiss: v })} />
            <HigSwitch label="Ion lock cues" description="Chirp when target lock engages." checked={prefs.ionTwinLockSfx}
              onChange={(ionTwinLockSfx) => update({ ionTwinLockSfx })} />
          </div>
        </section>
      )}

      <Link to="/builder" className="cta-link">
        Open Synth Builder <Icon name="chevron-right" />
      </Link>
    </div>
  );
}

const KIND_NAME: Record<string, string> = { ice: 'Combustion', scifi: 'Sci-fi', aerospace: 'Jet', 'ev-whine': 'Electric' };

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
  const blurbId = useId();
  const kindName = KIND_NAME[patch.kind] ?? patch.kind;
  return (
    <div className={`engine-card ${selected ? 'selected' : ''}`}>
      {/* Short name for VoiceOver; blurb is the description (F-13). */}
      <button type="button" className="engine-card-main" aria-pressed={selected} aria-label={`${patch.name}, ${kindName}, free`} aria-describedby={blurbId} onClick={onSelect}>
        <div className="engine-card-top" aria-hidden="true">
          <span className={`kind-pill kind-${patch.kind}`}>{patch.kind}</span>
          <span className="free-pill">FREE</span>
        </div>
        <div className="engine-card-name">{patch.name}</div>
        <div className="engine-card-blurb" id={blurbId}>{patch.meta?.blurb ?? patch.topology}</div>
        {selected && <div className="engine-card-active"><Icon name="check" />Active</div>}
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
          Preview<span className="sr-only"> {patch.name}</span>
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
          Delete<span className="sr-only"> {patch.name}</span>
        </button>
      )}
    </div>
  );
}
