/**
 * RevForge catalogue offline renderer: runs the REAL RevForgeVoice graph driven the way
 * RevForgeSynth.setDriving does (rpm from speed/throttle, flightProfile, load, rpm-gated
 * dcGuard via revforgeDcGuardForRpm). Noise is seeded (deterministic renders).
 * Used by scripts/revforge-dcguard-qa.mjs. Fully procedural.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { withSeededRandom } from './seeded-random.mjs';

const { OfflineAudioContext } = await import('node-web-audio-api');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(ROOT, 'package.json'));
const catalog = await jiti.import(join(ROOT, 'src/forge/catalog.ts'));
const { flightProfile } = await jiti.import(join(ROOT, 'src/forge/flightProfile.ts'));
const dcMod = await jiti.import(join(ROOT, 'src/audio/iceDcGuard.ts'));
const { RevForgeVoice } = await import(join(ROOT, 'src/forge/RevForgeVoice.js'));

export const REVFORGE_ICE_IDS = catalog.REVFORGE_PATCHES.filter((p) => p.kind === 'ice').map((p) => p.id);

export function revforgePatch(id) {
  const p = catalog.REVFORGE_PATCHES.find((x) => x.id === id || x.id === `revforge-${id}`);
  if (!p) throw new Error(`no RevForge catalogue patch ${id}`);
  return p;
}

/**
 * profile(t) → DrivingInput { speed, throttle, load?, rpm? }.
 * opts.dcGuard: 'auto' (shipped guard, default) | 'off' (pre-guard behaviour) | number.
 */
export async function renderRevforgePack(id, profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const patch = revforgePatch(id);
  const p = patch.revforge;
  return withSeededRandom(opts.seed ?? id, async () => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const voice = new RevForgeVoice(ctx, out);
    // start() resumes a suspended context; an offline context is "suspended" until rendering.
    Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
    await voice.start(p, { masterVolume: Number(patch.params.masterGain ?? 0.85), engineVolume: 1, musicVolume: 0.45 });
    delete ctx.state;
    // update() reads ctx.currentTime → schedule every UI frame ahead with a time-shifted view.
    let now = 0;
    voice.ctx = new Proxy(ctx, {
      get(target, key) {
        if (key === 'currentTime') return now;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const mode = opts.dcGuard ?? 'auto';
    const trace = [];
    const dt = 1 / 60;
    for (let t = 0; t < dur; t += dt) {
      now = t;
      const d = profile(t);
      const rpm = d.rpm ?? p.idleRpm + Math.max(d.speed, d.throttle * 0.55) * (p.redline - p.idleRpm);
      const dc =
        mode === 'off' ? 0 : mode === 'auto' ? dcMod.revforgeDcGuardForRpm(patch.id, p.voice, rpm, patch.params.dcGuard) : Number(mode);
      voice.update({
        rpm,
        tieSignature: patch.params.tieSignature !== 0,
        flight: flightProfile(rpm, p.idleRpm, p.redline, d.throttle, !!d.overrun, patch.params.jetSimulation !== 0),
        load: Math.max(0, Math.min(1, d.load ?? d.throttle)),
        accel: 0,
        shifting: false,
        overrun: !!d.overrun,
        dcGuard: dc,
      });
      trace.push({ t, rpm, dc });
    }
    voice.ctx = ctx;
    const buf = await ctx.startRendering();
    buf.trace = trace;
    return buf;
  });
}
