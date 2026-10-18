#!/usr/bin/env python3
"""
RevForge cockpit UI sounds -- fully procedural, offline-rendered.

Original synthesis written for RevForge. No samples, recordings or third-party
audio are used: every sound is built from seeded white noise, RBJ biquad
filters (the same filter family as the Web Audio BiquadFilterNode) and
exponentially-decaying sine "modes" / pitch-swept sine "thumps".

Usage:
  python3 make_ui_sounds.py              # render WAV + MP3 + params JSON
  python3 make_ui_sounds.py --params ui-sounds.params.json   # render from edited JSON
Requires numpy, scipy (lfilter only) and ffmpeg (for MP3).

Layer types (all times in seconds, frequencies in Hz, gains linear):
  noise : white noise * (attack ramp) * exp(-t/tau), through a chain of
          biquads [{type, f, Q}]. Web Audio: AudioBufferSourceNode(noise) ->
          BiquadFilterNode(s) -> GainNode with setTargetAtTime(0, t0, tau).
  modes : sum of damped sines [f, tau, amp]. Web Audio: OscillatorNode('sine')
          -> GainNode(amp) with setTargetAtTime(0, t0, tau) per mode.
  thump : sine whose frequency glides f0 -> f1 (exp, sweep_tau) with amplitude
          exp(-t/tau). Web Audio: OscillatorNode + frequency.setTargetAtTime.
  hum   : harmonic stack of a base frequency + optional band-limited noise,
          with a raised-cosine swell (attack, hold, release).
  sequence : repeats another sound's layers at given times with detune/gain.
Master chain per sound: highpass 35 Hz -> 2x lowpass 7 kHz (Q 0.707) ->
loudness/peak normalisation -> raised-cosine edge fades.
"""
import json, math, os, subprocess, sys, copy
import numpy as np
from scipy.signal import lfilter

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# Parameters (single source of truth; dumped to ui-sounds.params.json)
# --------------------------------------------------------------------------
PARAMS = {
  "version": 1,
  "sampleRate": SR,
  "master": {
    "highpass": {"f": 35, "Q": 0.7071},
    "lowpass": [{"f": 7000, "Q": 0.7071}, {"f": 7000, "Q": 0.7071}],
    "peakDbfs": -6.0,
    "loudnessWindow": 0.025,
    "loudnessHighpassHz": 150,
    "fadeIn": 0.0005,
    "fadeOut": 0.010,
    "leadIn": 0.002,
    "sheetGap": 0.6
  },
  "sounds": {
    "toggle-on": {
      "label": "Toggle switch flip ON",
      "length": 0.13, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 210, "f1": 120, "sweep_tau": 0.006, "tau": 0.008, "gain": 0.45},
        {"type": "noise", "t0": 0.000, "attack": 0.0002, "tau": 0.0012, "gain": 1.0, "seed": 11,
         "filters": [{"type": "bandpass", "f": 3300, "Q": 4.0}]},
        {"type": "noise", "t0": 0.0055, "attack": 0.0002, "tau": 0.0009, "gain": 0.55, "seed": 12,
         "filters": [{"type": "bandpass", "f": 2450, "Q": 6.0}]},
        {"type": "modes", "t0": 0.0055, "attack": 0.0002,
         "modes": [[1870, 0.028, 0.10], [3410, 0.018, 0.06], [5230, 0.009, 0.03]]}
      ]
    },
    "toggle-off": {
      "label": "Toggle switch flip OFF (lower, softer)",
      "length": 0.12, "match": True, "trimDb": -2.0,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 175, "f1": 100, "sweep_tau": 0.006, "tau": 0.009, "gain": 0.45},
        {"type": "noise", "t0": 0.000, "attack": 0.0003, "tau": 0.0016, "gain": 0.9, "seed": 21,
         "filters": [{"type": "bandpass", "f": 2650, "Q": 3.0}]},
        {"type": "noise", "t0": 0.0065, "attack": 0.0003, "tau": 0.0011, "gain": 0.45, "seed": 22,
         "filters": [{"type": "bandpass", "f": 2050, "Q": 5.0}]},
        {"type": "modes", "t0": 0.0065, "attack": 0.0003,
         "modes": [[1590, 0.022, 0.07], [2900, 0.014, 0.04], [4450, 0.007, 0.02]]}
      ]
    },
    "rotary-tick": {
      "label": "Rotary detent tick (single)",
      "length": 0.05, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 380, "f1": 260, "sweep_tau": 0.002, "tau": 0.003, "gain": 0.25},
        {"type": "noise", "t0": 0.000, "attack": 0.00015, "tau": 0.0007, "gain": 1.0, "seed": 31,
         "filters": [{"type": "bandpass", "f": 4100, "Q": 5.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.00015,
         "modes": [[2870, 0.006, 0.08], [5060, 0.004, 0.035]]}
      ]
    },
    "rotary-sweep": {
      "label": "Rotary sweep, 6 detent ticks (hand-turned timing)",
      "length": 0.40, "match": True,
      "layers": [
        {"type": "sequence", "of": "rotary-tick",
         "times":  [0.000, 0.068, 0.131, 0.190, 0.252, 0.322],
         "detune": [1.00, 1.015, 0.99, 1.02, 0.985, 1.005],
         "gains":  [1.00, 0.90, 0.95, 0.88, 0.93, 0.85]}
      ]
    },
    "magnetic-snap": {
      "label": "Magnetic snap into detent",
      "length": 0.12, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 150, "f1": 85, "sweep_tau": 0.008, "tau": 0.013, "gain": 0.8},
        {"type": "noise", "t0": 0.000, "attack": 0.0003, "tau": 0.0022, "gain": 0.8, "seed": 41,
         "filters": [{"type": "bandpass", "f": 1450, "Q": 2.0}]},
        {"type": "noise", "t0": 0.0004, "attack": 0.0001, "tau": 0.0006, "gain": 0.35, "seed": 42,
         "filters": [{"type": "bandpass", "f": 3800, "Q": 3.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.0003,
         "modes": [[960, 0.016, 0.06], [2210, 0.008, 0.02]]}
      ]
    },
    "guard-lift": {
      "label": "Spring-loaded guard cover lift (release click + open stop + spring)",
      "length": 0.15, "match": True,
      "layers": [
        {"type": "noise", "t0": 0.000, "attack": 0.0002, "tau": 0.0009, "gain": 0.55, "seed": 51,
         "filters": [{"type": "bandpass", "f": 3100, "Q": 4.0}]},
        {"type": "thump", "t0": 0.024, "f0": 260, "f1": 170, "sweep_tau": 0.005, "tau": 0.007, "gain": 0.4},
        {"type": "noise", "t0": 0.024, "attack": 0.0002, "tau": 0.0015, "gain": 1.0, "seed": 52,
         "filters": [{"type": "bandpass", "f": 1900, "Q": 3.0}]},
        {"type": "modes", "t0": 0.024, "attack": 0.0002,
         "modes": [[1320, 0.040, 0.05], [2470, 0.030, 0.035], [3890, 0.015, 0.015]]}
      ]
    },
    "guard-close": {
      "label": "Guard cover close (drop + latch)",
      "length": 0.12, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 170, "f1": 105, "sweep_tau": 0.007, "tau": 0.014, "gain": 0.7},
        {"type": "noise", "t0": 0.000, "attack": 0.0003, "tau": 0.0024, "gain": 0.9, "seed": 61,
         "filters": [{"type": "bandpass", "f": 1400, "Q": 2.5}]},
        {"type": "noise", "t0": 0.012, "attack": 0.0002, "tau": 0.0008, "gain": 0.6, "seed": 62,
         "filters": [{"type": "bandpass", "f": 3600, "Q": 5.0}]},
        {"type": "modes", "t0": 0.012, "attack": 0.0002,
         "modes": [[2150, 0.012, 0.04], [3720, 0.007, 0.02]]}
      ]
    },
    "lever-clunk": {
      "label": "Heavy throttle/gear lever into gate",
      "length": 0.18, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 100, "f1": 55, "sweep_tau": 0.012, "tau": 0.030, "gain": 1.0},
        {"type": "noise", "t0": 0.000, "attack": 0.0004, "tau": 0.0060, "gain": 0.9, "seed": 71,
         "filters": [{"type": "bandpass", "f": 620, "Q": 1.5}]},
        {"type": "noise", "t0": 0.0008, "attack": 0.0002, "tau": 0.0020, "gain": 0.5, "seed": 72,
         "filters": [{"type": "bandpass", "f": 2200, "Q": 3.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.0004,
         "modes": [[410, 0.035, 0.12], [1130, 0.024, 0.06], [2650, 0.011, 0.025]]},
        {"type": "thump", "t0": 0.022, "f0": 120, "f1": 70, "sweep_tau": 0.006, "tau": 0.012, "gain": 0.25},
        {"type": "noise", "t0": 0.022, "attack": 0.0003, "tau": 0.0015, "gain": 0.18, "seed": 73,
         "filters": [{"type": "bandpass", "f": 1800, "Q": 3.0}]}
      ]
    },
    "button-press": {
      "label": "Backlit push-button press (tight, damped)",
      "length": 0.06, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 300, "f1": 240, "sweep_tau": 0.002, "tau": 0.004, "gain": 0.5},
        {"type": "noise", "t0": 0.000, "attack": 0.0002, "tau": 0.0008, "gain": 1.0, "seed": 81,
         "filters": [{"type": "bandpass", "f": 2400, "Q": 2.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.0002, "modes": [[1620, 0.005, 0.05]]}
      ]
    },
    "button-release": {
      "label": "Backlit push-button release (higher, lighter)",
      "length": 0.05, "match": True, "trimDb": -3.0,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 360, "f1": 300, "sweep_tau": 0.002, "tau": 0.003, "gain": 0.35},
        {"type": "noise", "t0": 0.000, "attack": 0.0002, "tau": 0.0006, "gain": 1.0, "seed": 91,
         "filters": [{"type": "bandpass", "f": 3100, "Q": 2.5}]},
        {"type": "modes", "t0": 0.000, "attack": 0.0002, "modes": [[1980, 0.004, 0.04]]}
      ]
    },
    "relay-click": {
      "label": "Relay click (armature pull-in + contact bounce)",
      "length": 0.06, "match": True,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 520, "f1": 420, "sweep_tau": 0.001, "tau": 0.002, "gain": 0.25},
        {"type": "noise", "t0": 0.000, "attack": 0.00012, "tau": 0.0005, "gain": 1.0, "seed": 101,
         "filters": [{"type": "bandpass", "f": 4400, "Q": 6.0}]},
        {"type": "noise", "t0": 0.0018, "attack": 0.0001, "tau": 0.0004, "gain": 0.5, "seed": 102,
         "filters": [{"type": "bandpass", "f": 3800, "Q": 5.0}]},
        {"type": "noise", "t0": 0.0036, "attack": 0.0001, "tau": 0.0003, "gain": 0.2, "seed": 103,
         "filters": [{"type": "bandpass", "f": 3900, "Q": 5.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.00012,
         "modes": [[3300, 0.008, 0.04], [6100, 0.004, 0.015]]}
      ]
    },
    "theme-powerup": {
      "label": "Carousel theme power-up (soft relay + quiet electrical hum swell)",
      "length": 1.10, "match": False, "peakDbfs": -8.0,
      "layers": [
        {"type": "thump", "t0": 0.000, "f0": 420, "f1": 330, "sweep_tau": 0.001, "tau": 0.0025, "gain": 0.22},
        {"type": "noise", "t0": 0.000, "attack": 0.0002, "tau": 0.0006, "gain": 0.8, "seed": 111,
         "filters": [{"type": "bandpass", "f": 3600, "Q": 4.0}]},
        {"type": "noise", "t0": 0.0021, "attack": 0.0001, "tau": 0.0004, "gain": 0.35, "seed": 112,
         "filters": [{"type": "bandpass", "f": 3200, "Q": 4.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.0002, "modes": [[2750, 0.008, 0.03]]},
        {"type": "hum", "t0": 0.030, "attack": 0.38, "hold": 0.12, "release": 0.52,
         "base": 120, "harmonics": [[1, 0.35], [2, 1.0], [3, 0.30], [4, 0.18], [6, 0.06]],
         "gain": 0.014, "seed": 113, "noiseGain": 0.006,
         "noiseFilters": [{"type": "bandpass", "f": 480, "Q": 1.2}],
         "filters": [{"type": "lowpass", "f": 900, "Q": 0.7071}]}
      ]
    },
    "theme-crossfade-tick": {
      "label": "Theme-switch crossfade tick (very short, quiet)",
      "length": 0.035, "match": False, "peakDbfs": -16.0,
      "layers": [
        {"type": "noise", "t0": 0.000, "attack": 0.00015, "tau": 0.0004, "gain": 1.0, "seed": 121,
         "filters": [{"type": "bandpass", "f": 4800, "Q": 4.0}]},
        {"type": "modes", "t0": 0.000, "attack": 0.00015, "modes": [[3700, 0.004, 0.04]]}
      ]
    }
  },
  "sheetOrder": ["toggle-on", "toggle-off", "rotary-tick", "rotary-sweep", "magnetic-snap",
                 "guard-lift", "guard-close", "lever-clunk", "button-press", "button-release",
                 "relay-click", "theme-powerup", "theme-crossfade-tick"]
}

# --------------------------------------------------------------------------
# DSP primitives
# --------------------------------------------------------------------------
def biquad(kind, f, Q):
    """RBJ cookbook coefficients (same definitions as Web Audio BiquadFilterNode)."""
    w0 = 2 * math.pi * f / SR
    cw, sw = math.cos(w0), math.sin(w0)
    alpha = sw / (2 * Q)
    if kind == "bandpass":       # constant 0 dB peak gain
        b = [alpha, 0.0, -alpha]
    elif kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
    elif kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    else:
        raise ValueError(kind)
    a = [1 + alpha, -2 * cw, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]

def apply_filters(x, filters):
    for flt in filters:
        b, a = biquad(flt["type"], flt["f"], flt["Q"])
        x = lfilter(b, a, x)
    return x

def attack_env(t, attack):
    return 1.0 - np.exp(-t / max(attack, 1e-6))

def render_layer(L, n, detune=1.0, gain=1.0):
    out = np.zeros(n)
    i0 = int(round(L.get("t0", 0.0) * SR))
    if i0 >= n:
        return out
    m = n - i0
    t = np.arange(m) / SR
    typ = L["type"]
    if typ == "noise":
        rng = np.random.default_rng(L["seed"])
        x = rng.uniform(-1, 1, m) * attack_env(t, L["attack"]) * np.exp(-t / L["tau"])
        filters = [dict(f, f=f["f"] * detune) for f in L["filters"]]
        # filters scale noise down a lot; normalise by bandwidth so 'gain' is intuitive
        x = apply_filters(x, filters) * math.sqrt(max(f["Q"] for f in filters)) * 2.0
        seg = x * L["gain"]
    elif typ == "modes":
        seg = np.zeros(m)
        for f, tau, amp in L["modes"]:
            seg += amp * np.exp(-t / tau) * np.sin(2 * math.pi * f * detune * t)
        seg *= attack_env(t, L["attack"]) * 4.0
    elif typ == "thump":
        f0, f1 = L["f0"] * detune, L["f1"] * detune
        freq = f1 + (f0 - f1) * np.exp(-t / L["sweep_tau"])
        phase = 2 * math.pi * np.cumsum(freq) / SR
        seg = np.sin(phase) * np.exp(-t / L["tau"]) * attack_env(t, 0.0005) * L["gain"]
    elif typ == "hum":
        a, h, r = L["attack"], L["hold"], L["release"]
        env = np.zeros(m)
        ia, ih, ir = int(a * SR), int((a + h) * SR), int((a + h + r) * SR)
        ir = min(ir, m); ih = min(ih, m); ia = min(ia, m)
        env[:ia] = 0.5 - 0.5 * np.cos(np.pi * np.arange(ia) / max(ia, 1))
        env[ia:ih] = 1.0
        env[ih:ir] = 0.5 + 0.5 * np.cos(np.pi * np.arange(ir - ih) / max(ir - ih, 1))
        tone = np.zeros(m)
        for k, amp in L["harmonics"]:
            tone += amp * np.sin(2 * math.pi * L["base"] * k * t + 0.7 * k)
        tone = apply_filters(tone, L.get("filters", []))
        rng = np.random.default_rng(L["seed"])
        nz = apply_filters(rng.uniform(-1, 1, m), L.get("noiseFilters", []))
        seg = (tone * L["gain"] + nz * L["noiseGain"]) * env
    else:
        raise ValueError(typ)
    out[i0:] = seg * gain
    return out

def render_sound(name, P):
    S = P["sounds"][name]
    M = P["master"]
    n = int(round((S["length"] + M["leadIn"]) * SR))
    lead = M["leadIn"]
    x = np.zeros(n)
    for L in S["layers"]:
        if L["type"] == "sequence":
            base = P["sounds"][L["of"]]["layers"]
            for tt, dt, g in zip(L["times"], L["detune"], L["gains"]):
                for BL in base:
                    BL2 = dict(BL, t0=BL.get("t0", 0.0) + tt + lead)
                    x += render_layer(BL2, n, dt, g)
        else:
            x += render_layer(dict(L, t0=L.get("t0", 0.0) + lead), n)
    # master chain
    x = apply_filters(x, [dict(M["highpass"], type="highpass")])
    x = apply_filters(x, [dict(f, type="lowpass") for f in M["lowpass"]])
    x -= np.mean(x)
    # edge fades (raised cosine)
    fi, fo = int(M["fadeIn"] * SR), int(M["fadeOut"] * SR)
    x[:fi] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(fi) / fi)
    x[-fo:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(fo) / fo)
    x[0] = 0.0; x[-1] = 0.0
    return x

def short_loudness(x, P):
    M = P["master"]
    y = apply_filters(x, [{"type": "highpass", "f": M["loudnessHighpassHz"], "Q": 0.7071}])
    w = int(M["loudnessWindow"] * SR)
    c = np.convolve(y ** 2, np.ones(w) / w, mode="valid")
    return 10 * math.log10(max(c.max(), 1e-12))

def db(v): return 20 * math.log10(max(v, 1e-12))

def write_wav(path, x):
    import wave
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

def to_mp3(wav, mp3):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(SR),
                    "-c:a", "libmp3lame", "-b:a", "192k", mp3], check=True)

def main():
    P = PARAMS
    if "--params" in sys.argv:
        with open(sys.argv[sys.argv.index("--params") + 1]) as fh:
            P = json.load(fh)
    else:
        with open(os.path.join(HERE, "ui-sounds.params.json"), "w") as fh:
            json.dump(P, fh, indent=2)
    M = P["master"]
    peak_lin = 10 ** (M["peakDbfs"] / 20)
    rendered = {}
    for name, S in P["sounds"].items():
        x = render_sound(name, P)
        target = 10 ** (S.get("peakDbfs", M["peakDbfs"]) / 20)
        rendered[name] = x * (target / np.max(np.abs(x)))
    # loudness matching: matched sounds are pulled down to the median short-term loudness
    matched = [k for k, S in P["sounds"].items() if S.get("match")]
    Ls = {k: short_loudness(rendered[k], P) for k in matched}
    tgt = float(np.median(list(Ls.values())))
    for k in matched:
        g = min(tgt - Ls[k], 0.0) + P["sounds"][k].get("trimDb", 0.0)
        rendered[k] *= 10 ** (g / 20)
    wavdir = os.path.join(HERE, "wav"); os.makedirs(wavdir, exist_ok=True)
    report = []
    for name, x in rendered.items():
        wav = os.path.join(wavdir, name + ".wav")
        write_wav(wav, x); to_mp3(wav, os.path.join(HERE, name + ".mp3"))
        report.append((name, len(x) / SR, db(np.max(np.abs(x))), short_loudness(x, P),
                       float(np.mean(x)), abs(x[0]), abs(x[-1])))
    # sheet
    gap = np.zeros(int(M["sheetGap"] * SR))
    parts = [np.zeros(int(0.3 * SR))]
    for name in P["sheetOrder"]:
        parts += [rendered[name], gap]
    sheet = np.concatenate(parts)
    write_wav(os.path.join(wavdir, "ui-sounds-sheet.wav"), sheet)
    to_mp3(os.path.join(wavdir, "ui-sounds-sheet.wav"), os.path.join(HERE, "ui-sounds-sheet.mp3"))
    print(f"{'sound':22s} {'len s':>6s} {'peak dB':>8s} {'L25ms dB':>9s} {'dc':>9s}")
    for r in report:
        print(f"{r[0]:22s} {r[1]:6.3f} {r[2]:8.2f} {r[3]:9.2f} {r[4]:9.1e} edges={r[5]:.1e},{r[6]:.1e}")
    print(f"sheet {len(sheet)/SR:.2f}s")

if __name__ == "__main__":
    main()
