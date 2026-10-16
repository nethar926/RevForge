// Tomcat flight callouts: short spoken phrases (browser speechSynthesis — no recorded audio) or
// original alert tones, plus the mechanical gear cues. Frontend detects the situation; this module
// only decides HOW a requested callout is played: per-level mode, per-id cooldown, never stacked
// (a warning cancels a playing caution; anything else arriving while an alert plays is dropped).
// Nothing is stored.

/** Callout ids → level + phrase. Gear cues are mechanical sounds, not alerts. */
export const JET_CALLOUTS = {
  abUnarmed: { level: 'caution', text: 'Afterburner unarmed' },
  overspeedCaution: { level: 'caution', text: 'Speed caution' },
  overspeedWarning: { level: 'warning', text: 'Overspeed' },
  gpsFail: { level: 'caution', text: 'GPS signal lost' },
  /** Kept only so Frontend calls never break: touch-and-go / go-around / launch have no callout. */
  touchAndGo: { level: 'none' },
  goAround: { level: 'none' },
  launch: { level: 'none' },
  gearUp: { level: 'mechanical' },
  gearDown: { level: 'mechanical' },
};
export const JET_ALERT_LEVELS = ['note', 'caution', 'warning'];
/** Speed callouts (HIGH SPEED / OVERSPEED) — off by default, like Frontend's highSpeedCallouts. */
export const JET_HIGH_SPEED_IDS = ['overspeedCaution', 'overspeedWarning'];
/** Voice settings: quieter than a car alert, slightly low pitch. */
export const JET_VOICE = { volume: 0.6, pitch: 0.85, rate: 1, seconds: 1.6 };
/** Per-id cooldown (s). Gear cues have a short one so a flapping gear flag never machine-guns. */
export const JET_CALLOUT_COOLDOWN = { alert: 20, mechanical: 2 };

/** Speak via the browser's speechSynthesis; false when unavailable / it throws. */
export function speakPhrase(text, opts = {}) {
  const ss = globalThis.speechSynthesis;
  const U = globalThis.SpeechSynthesisUtterance;
  if (!ss || typeof ss.speak !== 'function' || typeof U !== 'function') return false;
  try {
    ss.cancel(); // never stack with anything already queued
    const u = new U(text);
    u.volume = opts.volume ?? JET_VOICE.volume;
    u.pitch = opts.pitch ?? JET_VOICE.pitch;
    u.rate = opts.rate ?? JET_VOICE.rate;
    if (opts.onend) {
      u.onend = opts.onend;
      u.onerror = opts.onend;
    }
    ss.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function cancelSpeech() {
  try {
    globalThis.speechSynthesis?.cancel?.();
  } catch {
    /* ignore */
  }
}

/**
 * Callout arbiter. deps: { now(): seconds, tone(level) → { seconds, cancel() } | null,
 * mechanical(id) → boolean, canPlay(): boolean }.
 */
export class FlightCallouts {
  constructor(deps) {
    this.deps = deps;
    this.modes = { warning: 'voice', caution: 'tone' };
    this.cautionVoice = false;
    this.highSpeed = false;
    this.last = new Map();
    this.active = null; // { level, until, kind: 'voice' | 'tone', handle }
  }

  /** 'voice' | 'tone' | 'off' (warnings speak; cautions follow setCautionVoice) or { warning?, caution? }. */
  setMode(mode) {
    const ok = (m) => m === 'voice' || m === 'tone' || m === 'off';
    if (typeof mode === 'string') {
      if (!ok(mode)) return this.getMode();
      this.modes = mode === 'voice' ? { warning: 'voice', caution: this.cautionVoice ? 'voice' : 'tone' } : { warning: mode, caution: mode };
    } else if (mode && typeof mode === 'object') {
      if (ok(mode.warning)) this.modes.warning = mode.warning;
      if (ok(mode.caution)) {
        this.modes.caution = mode.caution;
        this.cautionVoice = mode.caution === 'voice';
      }
    }
    return this.getMode();
  }

  getMode() {
    return { ...this.modes };
  }

  setHighSpeed(on) {
    this.highSpeed = !!on;
  }

  setCautionVoice(on) {
    this.cautionVoice = !!on;
    if (this.modes.caution !== 'off') this.modes.caution = this.cautionVoice ? 'voice' : 'tone';
  }

  busy(now) {
    if (this.active && now >= this.active.until) this.active = null;
    return this.active;
  }

  /** Stack rule. Returns true when `level` may start now (cancelling a caution for a warning). */
  admit(level, now) {
    const a = this.busy(now);
    if (!a) return true;
    if (level === 'warning' && a.level === 'caution') {
      if (a.kind === 'voice') cancelSpeech();
      a.handle?.cancel?.();
      this.active = null;
      return true;
    }
    return false;
  }

  /** Play a level as voice (phrase) or tone; returns 'voice' | 'tone' | 'suppressed'. */
  play(level, text, now) {
    const mode = this.modes[level] ?? 'off';
    if (mode === 'off' || !this.deps.canPlay()) return 'suppressed';
    if (!this.admit(level, now)) return 'suppressed';
    if (mode === 'voice' && text) {
      const started = speakPhrase(text, {
        onend: () => {
          if (this.active?.kind === 'voice' && this.active.text === text) this.active = null;
        },
      });
      if (started) {
        this.active = { level, until: now + JET_VOICE.seconds, kind: 'voice', text };
        return 'voice';
      }
      // no speechSynthesis → tone
    }
    const h = this.deps.tone(level);
    if (!h) return 'suppressed';
    this.active = { level, until: now + h.seconds, kind: 'tone', handle: h };
    return 'tone';
  }

  /** playFlightCallout(id): 'voice' | 'tone' | 'mechanical' | 'suppressed'. */
  callout(id) {
    const c = JET_CALLOUTS[id];
    if (!c || c.level === 'none') return 'suppressed';
    if (!this.highSpeed && JET_HIGH_SPEED_IDS.includes(id)) return 'suppressed';
    const now = this.deps.now();
    const cool = c.level === 'mechanical' ? JET_CALLOUT_COOLDOWN.mechanical : JET_CALLOUT_COOLDOWN.alert;
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < cool) return 'suppressed';
    let r;
    if (c.level === 'mechanical') r = this.deps.canPlay() && this.deps.mechanical(id) ? 'mechanical' : 'suppressed';
    else r = this.play(c.level, c.text, now);
    if (r !== 'suppressed') this.last.set(id, now);
    return r;
  }

  /** playAlertTone(level): 'note' is silent (no-op); caution / warning obey the stack rule only. */
  alertTone(level) {
    if (level !== 'caution' && level !== 'warning') return false;
    if (!this.deps.canPlay()) return false;
    const now = this.deps.now();
    if (!this.admit(level, now)) return false;
    const h = this.deps.tone(level);
    if (!h) return false;
    this.active = { level, until: now + h.seconds, kind: 'tone', handle: h };
    return true;
  }

  reset() {
    if (this.active?.kind === 'voice') cancelSpeech();
    this.active = null;
  }
}
