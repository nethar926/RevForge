import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CJ_TRAY_PAGES, cjMaxDemote, cjNavAction, cjNavItems, currentCjPage, isDrivePanel } from '../src/packs/carrier-jet.nav.ts';
import { AB_ARMED_KEY, applySavedAbArmed, readAbArmed, writeAbArmed } from '../src/packs/abArmed.ts';
import { compassSwitchState } from '../src/packs/heading.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const memKV = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const reachable = (opts: { compass?: 'off' | 'on' | 'denied'; demote?: number } = {}) => {
  const { items, overflow } = cjNavItems({ current: 'drive', muted: false, moreOpen: true, ...opts });
  return [...items, ...overflow].map((i) => i.id);
};

test('every ☰ drawer link maps to a switch with the same route', () => {
  const nav = src('components/NavBar.tsx');
  const links = [...nav.matchAll(/\{ to: '([^']+)', label: '([^']+)' \}/g)].map((m) => ({ to: m[1], label: m[2] }));
  assert.equal(links.length, 6, 'drawer has 6 links');
  const ids = reachable();
  for (const { to, label } of links) {
    const hit = ids.find((id) => { const a = cjNavAction(id); return (a?.type === 'route' && a.to === to) || (to === '/drive' && a?.type === 'drive'); });
    assert.ok(hit, `drawer "${label}" (${to}) reachable`);
  }
});

test('every Tuner menu item is reachable from the row / MORE (directly, or via ← TUNE in any Tuner panel)', () => {
  const forge = src('forge/ForgePage.tsx');
  const tuner = forge.match(/panel==='tuner'&&<div className="tuner-menu">\{\(\[(.*?)\] as const\)/s)?.[1] ?? '';
  const ids = [...tuner.matchAll(/\[(?:'[a-z]+'|dashLabListed\?'dashlab':'studio'),'([A-Za-z ]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['Options', 'Visuals', 'Revs', 'Lab', 'Account']);
  assert.match(forge, /onClick=\{\(\)=>navigate\('\/sound-builder'\)\}><strong>Sound Builder/);
  const panels = reachable().map((id) => cjNavAction(id, 'dashlab')).filter((a) => a?.type === 'panel').map((a) => (a as { panel: string }).panel);
  assert.deepEqual(panels.sort(), ['account', 'dashlab', 'themes']);
  assert.ok(reachable().includes('sound-builder'));
  assert.equal(cjNavAction('lab', 'studio')?.type === 'panel' && (cjNavAction('lab', 'studio') as { panel: string }).panel, 'studio');
  // Tuner Options ('tune') and Revs ('garage') panels: every non-tuner panel shows "← TUNE" back to the full Tuner menu.
  assert.match(forge, /\{panel!=="tuner"&&<button className="tuner-back" onClick=\{\(\)=>setPanel\("tuner"\)\}>← TUNE<\/button>\}/);
});

test('row = DRIVE GARAGE VISUALS OPTIONS SOUND BUILDER (COMPASS) MUTE MORE; MORE = PRO BUILDER LAB DIAGNOSTICS ACCOUNT', () => {
  const a = cjNavItems({ current: 'drive', muted: false, moreOpen: false });
  assert.deepEqual(a.items.map((i) => i.id), ['drive', 'garage', 'visuals', 'options', 'sound-builder', 'mute', 'more']);
  assert.deepEqual(a.overflow.map((i) => i.id), [...CJ_TRAY_PAGES]);
  assert.equal(a.items.find((i) => i.id === 'drive')?.on, true);
  assert.equal(a.items.filter((i) => i.on).length, 1);
  const b = cjNavItems({ current: 'diagnostics', muted: true, moreOpen: true, compass: 'denied' });
  assert.deepEqual(b.items.map((i) => i.id), ['drive', 'garage', 'visuals', 'options', 'sound-builder', 'compass', 'mute', 'more']);
  assert.equal(b.items.find((i) => i.id === 'mute')?.on, true);
  assert.equal(b.items.find((i) => i.id === 'more')?.on, true);
  assert.equal(b.items.find((i) => i.id === 'compass')?.state, 'denied');
  assert.equal(b.overflow.find((i) => i.id === 'diagnostics')?.on, true);
});

test('fitting moves switches into MORE without losing any; MORE always stays in the row', () => {
  const full = new Set(reachable({ compass: 'off' }));
  for (let d = 0; d <= cjMaxDemote(true) + 2; d++) {
    const ids = reachable({ compass: 'off', demote: d });
    assert.deepEqual(new Set(ids), full, `demote ${d}`);
    const { items } = cjNavItems({ current: 'drive', muted: false, moreOpen: false, compass: 'off', demote: d });
    assert.equal(items.at(-1)?.id, 'more');
  }
  assert.deepEqual(cjNavItems({ current: null, muted: false, moreOpen: false, demote: 99 }).items.map((i) => i.id), ['more']);
});

test('current page from route + Drive panel', () => {
  assert.equal(currentCjPage('/drive', null), 'drive');
  assert.equal(currentCjPage('/', null), 'drive');
  assert.equal(currentCjPage('/drive', 'themes'), 'visuals');
  assert.equal(currentCjPage('/drive', 'scenes'), 'visuals');
  assert.equal(currentCjPage('/drive', 'account'), 'account');
  assert.equal(currentCjPage('/drive', 'dashlab'), 'lab');
  assert.equal(currentCjPage('/engines', null), 'garage');
  assert.equal(currentCjPage('/customize', null), 'options');
  assert.equal(currentCjPage('/sound-builder', null), 'sound-builder');
  assert.equal(currentCjPage('/builder', null), 'pro-builder');
  assert.equal(currentCjPage('/diag', null), 'diagnostics');
  assert.ok(isDrivePanel('account') && isDrivePanel('themes') && !isDrivePanel('evil') && !isDrivePanel(null));
});

test('compass switch state mapping', () => {
  assert.equal(compassSwitchState(null, false), 'off');
  assert.equal(compassSwitchState('off', false), 'off');
  assert.equal(compassSwitchState('granted', true), 'on');
  assert.equal(compassSwitchState('granted', false), 'off', 'saved grant but iOS wants a fresh gesture');
  assert.equal(compassSwitchState('denied', false), 'denied');
  assert.equal(compassSwitchState('denied', true), 'denied');
});

test('ARM persistence: no saved value → engine never called; saved value → applied', () => {
  const kv = memKV();
  const calls: boolean[] = [];
  const engine = { setAfterburnerArmed: (a: boolean) => void calls.push(a) };
  assert.equal(readAbArmed(kv), null);
  assert.equal(applySavedAbArmed(engine, kv), false);
  assert.deepEqual(calls, [], 'default armed: no call');
  writeAbArmed(false, kv);
  assert.equal(kv.m.get(AB_ARMED_KEY), 'false', 'storageKey() is identity on root builds');
  assert.equal(applySavedAbArmed(engine, kv), true);
  writeAbArmed(true, kv);
  applySavedAbArmed(engine, kv);
  assert.deepEqual(calls, [false, true]);
  assert.equal(applySavedAbArmed({}, kv), false, 'engines without the API are skipped');
  kv.m.set(AB_ARMED_KEY, 'junk');
  assert.equal(readAbArmed(kv), null);
});

test('wiring: CJ row replaces Tuner (after IGNITION) and ☰ (AppShell) only for the CJ pack; guard + ab-armed bus; no overlay button', () => {
  const forge = src('forge/ForgePage.tsx');
  assert.match(forge, /const cjNav=ignited&&packForThemeId\(theme\.id\)\?\.id===CARRIER_JET_IDENTITY\.id;/);
  assert.match(forge, /\{cjNav\?<CjNavRow [^>]*\/>:<button className="rev-chip" onClick=\{\(\)=>setPanel\('tuner'\)\}>Tuner/);
  const shell = src('components/AppShell.tsx');
  assert.match(shell, /\{!cjNav && \(\s*<button\s+type="button"\s+className="hamburger-btn"/);
  assert.match(shell, /onMuteToggle\(\)/);
  assert.match(src('app/App.tsx'), /cjNav=\{packForThemeId\(themes\.skinId\)\?\.id === CARRIER_JET\.id\}/);
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /<CarrierJetAfterburnerGuard armed=\{armed\} guardOpen=\{guardOpen\}/);
  assert.match(mount, /sendPackEngineCommand\(ID\.id, \{ type: 'ab-armed', armed: next \}\)/);
  assert.match(mount, /useState\(false\)/, 'guard starts closed');
  const bridge = src('packs/audioBridge.ts');
  assert.match(bridge, /cmd\.type === 'ab-armed'\) e\.setAfterburnerArmed\?\.\(cmd\.armed\)/);
  assert.match(bridge, /applySavedAbArmed\(live\)/);
  assert.doesNotMatch(src('packs/mounts/carrier-jet-mount.css'), /cjm-compass/);
});
