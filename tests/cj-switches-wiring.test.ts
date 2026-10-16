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
  assert.match(forge, /\{panel!=="tuner"&&<button className="tuner-back" data-testid="cj-tune" onClick=\{\(\)=>setPanel\("tuner"\)\}>← TUNE<\/button>\}/);
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
  assert.match(readFileSync(new URL('../src/forge/ForgePage.tsx', import.meta.url), 'utf8'), /<button className="tuner-back" data-testid="cj-tune" onClick=\{\(\)=>setPanel\("tuner"\)\}>← TUNE<\/button>/, 'stable cj-tune hook opens the Tuner');
  assert.doesNotMatch(mount, /flightSlot=/, 'no FLIGHT slot: the skin FLIGHT block stays as at 9a3773a (mount-only portrait fallback)');
  assert.match(mount, /\{bankHost \? createPortal\(layout === 'portrait' \? <div className="cjm-below">\{bank\}<\/div> : bank, bankHost\) : layout !== 'portrait' && <div className="cjm-ab">\{bank\}<\/div>\}/, 'bank: Tesla → dock, portrait → below the dock, phone-landscape → the host strip');
  assert.match(mount, /const guardVariant = layout === 'phone-landscape' \? 'auto' : 'compact';/, 'Tesla + portrait guard = compact (phone-landscape auto = compact)');
  const nav = readFileSync(new URL('../src/packs/mounts/CjNavRow.tsx', import.meta.url), 'utf8');
  assert.match(nav, /variant=\{layout === 'board' \|\| layout === 'window' \? 'compact' : 'auto'\}/, 'Tesla row = compact');
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-controls.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/packs/mounts/carrier-jet-mount.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /display:\s*none/, 'host CSS hides no switch / guard part');
  assert.match(css, /\.cjm\[data-rf-layout='phone-landscape'\] > \.cjm-fill \{ bottom: 68px; \}/, 'phone-landscape board yields the 68px guard strip');
  assert.doesNotMatch(css, /portrait'\][^{]*> \.cjm-fill[^{]*\{ bottom: 68px/, 'portrait board keeps its 9a3773a height (no 68px yield)');
  assert.match(mount, /sendPackEngineCommand\(ID\.id, \{ type: 'ab-armed', armed: next \}\)/);
  assert.match(mount, /useState\(false\)/, 'guard starts closed');
  const bridge = src('packs/audioBridge.ts');
  assert.match(bridge, /cmd\.type === 'ab-armed'\) e\.setAfterburnerArmed\?\.\(cmd\.armed\)/);
  assert.match(bridge, /applySavedAbArmed\(live\)/);
  assert.doesNotMatch(src('packs/mounts/carrier-jet-mount.css'), /cjm-compass/);
});

test('portrait Option A: guard below the dock, viewport scrolls by the strip, focus scrolls it into view', () => {
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-controls.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
  // portal target = the drive viewport, portrait only
  assert.match(mount, /const bankHost = tesla \? vp\.dock : layout === 'portrait' \? vp\.viewport : null;/);
  const scroller = css.match(/\.rev-viewport:has\(\.cjm\[data-rf-layout='portrait'\]\):has\(> \.cjm-below\) \{([^}]*)\}/);
  assert.ok(scroller, 'portrait-only scroll container rule');
  assert.match(scroller[1], /overflow-y: auto/);
  assert.match(scroller[1], /overscroll-behavior: contain/);
  assert.doesNotMatch(css, /scroll-snap/, 'no scroll-snap');
  assert.doesNotMatch(css, /scale\(/, 'no scale()');
  // the first screen is a 100%-tall spacer, so the strip sits in normal flow below the dock
  assert.match(css, /\.rev-viewport:has\(\.cjm\[data-rf-layout='portrait'\]\):has\(> \.cjm-below\)::before \{ content: ''; display: block; height: 100%; \}/);
  const below = css.match(/\.rev-viewport > \.cjm-below \{([^}]*)\}/);
  assert.ok(below && /position: relative/.test(below[1]) && /env\(safe-area-inset-bottom/.test(below[1]), 'strip in flow with a safe-area bottom margin');
  // scroll-margin on the strip and both focusable controls
  for (const sel of ['.cjg', '.cjg-guard', '.cjg-arm', '.cjs-sw']) assert.ok(css.includes(`.rev-viewport > .cjm-below ${sel}`), `scroll-margin covers ${sel}`);
  assert.match(css, /\.cjg-arm \{ scroll-margin: 16px 0 calc\(max\(10px, env\(safe-area-inset-bottom, 0px\)\) \+ 20px\); \}/);
});

test('bottom bank: guard left + row right in one panel; row portals into it once the dock exists', () => {
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  const nav = src('packs/mounts/CjNavRow.tsx');
  const css = src('packs/mounts/carrier-jet-controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // one swappable panel: guard slot first, nav slot second
  assert.match(mount, /<div ref=\{bankRef\} className="cjm-bank" data-rf-layout=\{layout\}[^>]*>\s*<div className="cjm-bank-ab">\{guard\}<\/div>\s*<div className="cjm-bank-nav" ref=\{setNavSlot\} \/>/);
  // the slot is published only while the drive dock exists (after IGNITION), withdrawn on cleanup
  assert.match(mount, /if \(!docked \|\| !navSlot\) return;\s*setCjNavSlot\(navSlot\);\s*return \(\) => setCjNavSlot\(null, navSlot\);/);
  assert.match(mount, /querySelector<HTMLElement>\(':scope > \.rev-dock'\)/);
  assert.match(nav, /return slot \? createPortal\(nav, slot\) : nav;/);
  assert.match(nav, /data-cjnav-place=\{place\}/);
  assert.match(nav, /\}, \[slot\]\);/, 'fit observer re-attaches after the row moves');
  // Tesla dock order: … Hold to rev · bank · ≥ 24px · Shutdown. The bank keeps the dock's 48px line (board box unchanged).
  assert.match(css, /\.rev-dock > \.cjm-bank \{ order: 1; flex: 1 1 0; position: relative; height: 48px; margin-right: 24px; \}/);
  assert.match(css, /\.rev-dock:has\(> \.cjm-bank\) > \.rev-stop \{ order: 2; \}/);
  assert.match(css, /\.rev-viewport > \.rev-dock:has\(> \.cjm-bank\) \{ overflow: visible; \}/, 'dock does not clip the tray');
  assert.match(css, /\.cjm-bank\[data-rf-layout='window'\] > \.cjm-bank-nav \{ position: absolute; left: 0; bottom: calc\(100% \+ 12px\); width: var\(--cjm-nav-w, 100%\);/);
  assert.match(mount, /tr\.left - 8 - bankEl\.getBoundingClientRect\(\)\.left/, 'window row tier clears the throttle card');
  assert.match(css, /> \.rev-topbar > div \{ min-height: 48px; \}/, 'top bar keeps its 48px line without the row');
  // MORE opens upward from the bank and stacks above everything
  assert.match(css, /\.cjnav\[data-cjnav-place='bank'\] \.cjs > \.cjs-tray \{ top: auto; bottom: calc\(100% \+ 6px\); \}/);
  assert.match(css, /\.cjm-bank\[data-rf-layout='window'\] \.cjnav\[data-cjnav-place='bank'\] \.cjs > \.cjs-tray \{ left: 0; right: auto; \}/, 'window tray opens from the tier\'s left edge (stays on screen)');
  assert.match(css, /\.cjm-below \.cjnav\[data-cjnav-place='bank'\] \.cjs > \.cjs-tray \{ left: 50%; right: auto; transform: translateX\(-50%\); \}/, 'portrait tray centred, translate only');
  assert.match(css, /:has\(\.cjm\[data-rf-layout='phone-landscape'\]\):has\(\.cjm-bank\[data-cjm-bank\]\) > \.rev-topbar \{ min-height: 48px; \}/, 'landscape rail keeps the row line so the throttle does not move');
  assert.match(css, /\.rev-dock:has\(\.cjnav \[data-sw-id='more'\]\[aria-expanded='true'\]\)/);
  // bigger Tesla cells (56px, 14px), no scale anywhere
  assert.match(css, /\.cjs-sw \{ height: 56px; min-height: 56px; min-width: 56px;/);
  assert.match(css, /\.cjs-legend \{ font-size: 14px; line-height: 14px;/);
  assert.doesNotMatch(css, /scale\(/);
  // phones: portrait row directly above the guard (below the dock); landscape row in the board's strip
  assert.match(css, /\.rev-viewport > \.cjm-below \.cjm-bank-nav \{ order: -1;/);
  assert.match(css, /\.cjm\[data-rf-layout='phone-landscape'\] > \.cjm-ab \{ top: auto; left: env\(safe-area-inset-left, 0px\); right: env\(safe-area-inset-right, 0px\);/);
});

test('Tesla reflow (separate commit): board fills top bar → bank, no scale(); throttle in the old NAV slot; GPS 68px yield only before docking', () => {
  const css = src('packs/mounts/carrier-jet-controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(css, /padding: 76px 16px calc\(18px \+ 3px \+ 48px \+ 6px \+ 8px\) !important;/);
  assert.match(css, /padding: 76px 8px calc\(18px \+ 3px \+ 48px \+ 12px \+ 60px \+ 8px\) !important;/);
  assert.match(css, /\.cjm:is\(\[data-rf-layout='board'\], \[data-rf-layout='window'\]\) \{\s*flex: 1 1 auto; align-self: stretch; width: 100%; height: 100%; margin: 0;/);
  assert.match(css, /> \.rev-throttle \{\s*top: 20px; bottom: auto; right: 24px;/);
  assert.match(css, /\.rev-viewport:not\(:has\(\.rev-throttle\)\):not\(:has\(> \.rev-dock > \.cjm-bank\)\) \.cjm:is\(\[data-rf-layout='board'\], \[data-rf-layout='window'\]\) > \.cjm-fill \{ bottom: 68px; \}/);
  assert.match(mount, /if \(!tr \|\| !nr \|\| tr\.bottom <= nr\.top \|\| tr\.top >= nr\.bottom\)/, 'row tier only narrows when the throttle shares its band');
  assert.doesNotMatch(css, /scale\(/);
});
