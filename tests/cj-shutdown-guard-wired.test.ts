/** Guarded SHUTDOWN wiring (Frontend, on Meghan's ShutdownGuard 4207fad): cover state, lever, cues. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playGuardCue, sdCoverTap, sdEngineStopped, sdLever, sdShown, type GuardCue } from '../src/packs/carrier-jet/shutdownGuard.ts';
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const deps = () => { const log: string[] = []; return { log, d: { cue: (c: GuardCue) => void log.push(c), shutdown: () => void log.push('shutdown') } }; };

test('cover closed by default, not persisted; part only while running on the Tesla v2 dock', () => {
  const m = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(m, /const \[sdOpen, setSdOpen\] = useState\(false\);/);
  assert.doesNotMatch(src('packs/carrier-jet/shutdownGuard.ts'), /localStorage|storageKey|setCjPrefs/);
  assert.doesNotMatch(m, /sdOpen[^\n]*(localStorage|setCjPrefs)/);
  assert.equal(sdShown({ v2: true, tesla: true, docked: true, running: true }), true);
  assert.equal(sdShown({ v2: true, tesla: true, docked: true, running: false }), false, 'engine off: the host chip (Ignition / Resume) restarts');
  assert.equal(sdShown({ v2: true, tesla: false, docked: true, running: true }), false, 'phones: not covered');
  assert.equal(sdShown({ v2: false, tesla: true, docked: true, running: true }), false);
  assert.match(m, /<ShutdownGuard guardOpen=\{sdOpen\} onGuardToggle=\{[^}]*sdCoverTap\(o, sdDeps\)\)\} on=\{props\.running\} onToggle=\{[^}]*sdLever\(o, props\.running, sdDeps\)\.open\)\} reduceMotion=\{reduced\} \/>/);
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /> \.cjm-sdg \{\n  position: absolute; left: calc\(var\(--cjv3-plate\) \+ 8px \+ var\(--cjv3-guard\)\); translate: -100% 0; bottom: -3px;[^}]*width: 108\.67px; height: 48px;/, ".rev-stop's placement rule");
  assert.match(css, /\.rev-dock:has\(> \.cjm-sdg\) > \.rev-stop \{ visibility: hidden !important; \}/);
});

test('the lever does nothing while the cover is closed (or the engine is off)', () => {
  const { log, d } = deps();
  assert.deepEqual(sdLever(false, true, d), { open: false, shut: false });
  assert.deepEqual(sdLever(true, false, d), { open: true, shut: false });
  assert.deepEqual(log, []);
});

test('open → lever shuts down (the existing Shutdown) and auto-closes with guardClose', () => {
  const { log, d } = deps();
  let open = sdCoverTap(false, d);
  assert.equal(open, true);
  const r = sdLever(open, true, d);
  open = r.open;
  assert.deepEqual(r, { open: false, shut: true });
  assert.deepEqual(log, ['guardOpen', 'shutdown', 'guardClose']);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /shutdown: \(\) => void requestPackShell\(\{ type: 'shutdown' \}\)/);
  assert.match(src('forge/ForgePage.tsx'), /if \(a\.type === 'shutdown'\) \{ if \(audio\.running\) stop\(\); \}/, 'same stop() as the Shutdown chip');
  // engine stopped another way (EMER STOP) with the cover up → drops with guardClose; closed stays silent
  const e = deps();
  assert.equal(sdEngineStopped(true, false, e.d), false);
  assert.equal(sdEngineStopped(false, false, e.d), false);
  assert.equal(sdEngineStopped(true, true, e.d), true);
  assert.deepEqual(e.log, ['guardClose']);
});

test("open / close cues: Dan's guardOpen / guardClose via playJetCue, silent with SW SND off", () => {
  const { log, d } = deps();
  assert.equal(sdCoverTap(sdCoverTap(false, d), d), false);
  assert.deepEqual(log, ['guardOpen', 'guardClose']);
  const played: string[] = [];
  const api = { playJetCue: (c: string) => void played.push(c) };
  playGuardCue(api, true, 'guardOpen');
  playGuardCue(api, true, 'guardClose');
  playGuardCue(api, false, 'guardOpen');
  playGuardCue(null, true, 'guardOpen');
  playGuardCue({ playJetCue: () => { throw new Error('not ready'); } }, true, 'guardClose');
  assert.deepEqual(played, ['guardOpen', 'guardClose']);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /cue: \(c\) => playGuardCue\(jetApi, getCjPrefs\(\)\.switchSound, c\)/);
  assert.match(src('packs/mounts/CjColdStart.tsx'), /if \(!getCjPrefs\(\)\.switchSound\) return;\n\s*try \{\n\s*api\?\.playJetCue\(c\);/, 'same path as the cold-start guards / QUICK START cover');
});
