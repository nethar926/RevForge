import {isCustomEngine,editableEngine} from './engineDraft';
import {SourceMixer} from './SourceMixer';
import {LiveSoundGraph} from './LiveSoundGraph';
import {EngineSetup} from './EngineSetup';
import {SoundCharacter} from './SoundCharacter';
import { useState } from "react";

import type { EnginePatch } from "../audio";
import type { RevForgeVoiceConfig } from "./voiceTypes";
import architectures from "./architectures.json";
import { voicePatchParts } from "./catalog";

const controls: [keyof RevForgeVoiceConfig, string, number, number, number][] =
  [
    ["idleRpm", "Idle RPM", 400, 2000, 5],

    ["rumble", "Rumble", 0, 1, 0.01],
    ["growl", "Growl", 0, 1, 0.01],
    ["metallic", "Metallic", 0, 1, 0.01],
    ["air", "Air / intake", 0, 1, 0.01],
    ["exhaust", "Exhaust", 0, 1, 0.01],
    ["rasp", "Rasp", 0, 1, 0.01],
    ["body", "Body", 0, 1, 0.01],
    ["turbo", "Turbo", 0, 1, 0.01],
    ["turboPitch", "Turbo pitch", 0, 1, 0.01],
    ["blowoff", "Blow-off", 0, 1, 0.01],
    ["crackle", "Crackle", 0, 1, 0.01],
    ["distortion", "Drive / grit", 0, 1, 0.01],


    ["finalDrive", "Final drive", 2, 6, 0.01],
  ];
export function NativeStudio({
  patch,
  onChange,
  onSave,
}: {
  patch: EnginePatch;
  onChange: (patch: EnginePatch) => void;
  onSave: (patch: EnginePatch) => void;
}) {
  const [name, setName] = useState(patch.name);
  const [message, setMessage] = useState("");
  if (!isCustomEngine(patch))return <button onClick={()=>onChange(editableEngine(patch))}>Tune This Engine</button>;
  if (!patch.revforge)
    return (
      <div className="forge-tune"><label>Engine name<input aria-label="Engine name" value={name} onChange={e=>setName(e.target.value)}/></label><SourceMixer patch={patch} onChange={onChange}/><details><summary>Main engine and drivetrain tuning</summary><EngineSetup patch={patch} onChange={onChange}/><SoundCharacter patch={patch} onChange={onChange}/></details><details><summary>Advanced · audio nodes and routing</summary><LiveSoundGraph patch={patch} onChange={onChange}/></details><button onClick={()=>onSave({...patch,id:patch.id,name:name.trim()||patch.name})}>Save custom voice</button>
      </div>
    );
  const voice = patch.revforge;
  const update = (changes: Partial<RevForgeVoiceConfig>) => {
    const engine = { ...voice, ...changes };
    engine.shiftRpm = Math.min(engine.shiftRpm, engine.redline * 0.97);
    const converted = voicePatchParts(engine);
    onChange({
      ...patch,
      kind: converted.kind,
      topology: converted.topology,
      params: {...patch.params,...converted.params},
      revforge: engine,
    });
    setMessage("");
  };
  const save = () => {
    const saved = {
      ...patch,
      id: patch.id,
      name: name.trim() || patch.name,
      meta: {
        ...patch.meta,
        author: "You",
        createdAt: new Date().toISOString(),
      },
    };
    onSave(saved);
    setMessage(`Saved ${saved.name}. Available in your garage.`);
  };
  const exportPreset = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { ...patch, name: name.trim() || patch.name },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "revforge-voice.engine.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="forge-native-studio"><SourceMixer patch={patch} onChange={onChange}/><details><summary>Main engine and drivetrain tuning</summary><EngineSetup patch={patch} onChange={onChange}/><SoundCharacter patch={patch} onChange={onChange}/></details><details><summary>Advanced · audio nodes and routing</summary><LiveSoundGraph patch={patch} onChange={onChange}/></details>
      <p className="forge-studio-description">
        RevForge synthesis. Shape the voice live, then save a personal preset.
      </p>
      <label className="forge-name-label">
        PRESET NAME
        <input
          aria-label="Preset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </label>
      <span className="forge-label">ARCHITECTURE</span>
      <div className="forge-architecture-grid">
        {architectures.map((a) => (
          <button key={a.id} onClick={() => update(a.patch)}>
            {a.name}
          </button>
        ))}
      </div>
      <div className="forge-studio-knobs">
        {controls.filter(([key])=>!['scifi','aerospace'].includes(patch.kind)||key==='idleRpm'||key==='finalDrive').map(([key, label, min, max, step]) => (
          <label key={key}>
            <span>
              {label}
              <b>
                {max === 1
                  ? `${Math.round(Number(voice[key]) * 100)}%`
                  : Number(voice[key]).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
              </b>
            </span>
            <input
              aria-label={label}
              type="range"
              min={min}
              max={
                key === "shiftRpm" ? Math.min(max, voice.redline * 0.97) : max
              }
              step={step}
              value={Number(voice[key])}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="forge-studio-actions">
        <button onClick={exportPreset}>Export preset</button>
        <button onClick={save}>Save custom voice ↗</button>
      </div>
      {message && (
        <p role="status" className="forge-save-message">
          {message}
        </p>
      )}

    </div>
  );
}
