// CJ port polish, mount side (Meghan's polish check): RADAR scope without the "040" corner (cj-radar-overlay.test.ts),
// COMPASS one reference + CONFIG › HDG REF, SHUTDOWN as a printed pamphlet page, fixed 44 px page tabs, the
// MATRIX PILOT CHECKLIST cover with the next badge code, Meghan's ApuBlock legend prop (cj-mock-fixes.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compassSpeech } from '../src/packs/carrier-jet/liveMap.ts';
import { CJ_SHUTDOWN_PLAN, SD_ACTIONS, SD_EMERGENCY, sdLineLabel } from '../src/packs/carrier-jet/shutdownPlan.ts';
import { CJ_CHECKLIST_PLAN, ckItems } from '../src/packs/carrier-jet/checklistPlan.ts';
import { ckPlan, ckTitle } from '../src/packs/carrier-jet/checklistModes.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

async function render() {
  const { rolldown } = await import('rolldown');
  const entry = `export { CjPamphlet } from ${JSON.stringify(join(root, 'src/packs/mounts/CjPamphlet.tsx'))};`;
  const b = await rolldown({
    input: 'ppm-entry',
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{
      name: 'entry-and-empty-css',
      resolveId: (id: string) => (id === 'ppm-entry' ? '\0ppm-entry' : /\.(css|woff2|svg)$/.test(id) ? '\0ppm-empty' : null),
      load: (id: string) => (id === '\0ppm-entry' ? entry : id === '\0ppm-empty' ? 'export default ""' : null),
    }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await b.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.ppm-test-'));
  const file = join(dir, 'm.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  return (p: object) => renderToStaticMarkup(React.createElement(mod.CjPamphlet as never, p as never));
}

test('2 COMPASS: one heading in the HDG REF reference (default M); TRUE lives in CONFIG › TLM › HDG REF', () => {
  assert.equal(compassSpeech({ t: 40, m: 47 }, 'M'), 'heading 047 magnetic');
  assert.equal(compassSpeech({ t: 40, m: 47 }, 'T'), 'heading 040 true');
  assert.equal(compassSpeech({ t: 40, m: null }, 'M'), 'heading 040 true', 'no fix yet: MAG unknown');
  const live = src('src/packs/mounts/CjLiveMap.tsx');
  const ro = live.slice(live.indexOf('export function CjHeadingReadout'));
  assert.match(ro, /const label = `Compass, \$\{compassSpeech\(pair, hdgRef\)\}/);
  assert.match(ro, /<div className="cjv2-hdgro">/);
  assert.match(ro, /<CjHeadingLegend [^>]*lead=\{hdgRef\}[^>]*ariaLabel=\{label\} single \/>/, "Meghan's single prop: lead line only");
  assert.doesNotMatch(ro, /data-one/);
  assert.doesNotMatch(ro, /headingSpeech/);
  assert.doesNotMatch(src('src/packs/mounts/carrier-jet-v2.css'), /data-one|cj-hdg-legend > span/, 'no mount-side hiding rule');
  const it = CJ_CONFIG.telemetry.items.find((i) => i.id === 'hdg')!;
  assert.equal(it.label, 'HDG REF');
  assert.equal(it.group, 'UNITS');
});

test('3 SHUTDOWN page: printed sections, pamphlet actions only, own wording, read line by line', async () => {
  assert.deepEqual(CJ_SHUTDOWN_PLAN.map((s) => s.title), ['ENGINES', 'SYSTEMS', 'LIGHTS', 'POWER']);
  for (const s of CJ_SHUTDOWN_PLAN) for (const it of s.items) {
    assert.ok(SD_ACTIONS.includes(it.action), it.action);
    assert.match(it.code, new RegExp(`^${s.n}[a-z]$`));
  }
  assert.deepEqual([...SD_ACTIONS], ['ON', 'OFF', 'HOLD', 'IDLE', 'PRESS', 'CHECK', 'LIFT', 'CLOSE']);
  const r = await render();
  const h = r({ plan: CJ_CHECKLIST_PLAN, title: ckTitle('apu'), cursor: 3, size: 'narrow', page: 'SHUTDOWN', onPage: () => {} });
  assert.match(h, /data-page="SHUTDOWN" aria-label="Checklist, shutdown"/);
  assert.match(h, /NORMAL PROCEDURES · SHUTDOWN/);
  for (const t of ['ENGINES', 'SYSTEMS', 'LIGHTS', 'POWER']) assert.match(h, new RegExp(`</span>${t}</h4>`));
  assert.match(h, /aria-label="Shutdown step 1 a, Throttles, IDLE"/);
  assert.match(h, /aria-label="Shutdown step 4 d, Battery switch, OFF"/);
  assert.equal(sdLineLabel(CJ_SHUTDOWN_PLAN[0].items[1]), 'Shutdown step 1 b, Left and right RPM, CHECK');
  assert.match(h, new RegExp(`role="note" aria-label="Emergency: ${SD_EMERGENCY}"`));
  assert.doesNotMatch(h, /aria-current="step"/, 'printed reference: no cursor');
  assert.doesNotMatch(h, /POWER<\/h4>[\s\S]*BATT Switch[\s\S]*FUEL<\/h4>/, 'no cold-start sections on this page');
  // the old plain list is gone from the shelf pamphlet
  const cs = src('src/packs/mounts/CjColdStart.tsx');
  assert.doesNotMatch(cs, /<section aria-label="Shutdown">|checklist\.shutdown/);
  // fits: two columns inside the card (shots: cj-port-polish/shutdown-page-{1256,773}.png, card scrollHeight = clientHeight)
  assert.match(nc(src('src/packs/mounts/carrier-jet-v2.css')), /\.ckp-sdpage \{ columns: 2;/);
});

test('4 page tabs: 4 fixed 44 px buttons outside the card scroll, 11 px text; static tabs unchanged without onPage', async () => {
  const r = await render();
  const picked: string[] = [];
  const h = r({ plan: ckPlan('gndAir'), title: ckTitle('gndAir'), cursor: 10, size: 'narrow', onPage: (p: string) => picked.push(p) });
  const tabs = [...h.matchAll(/<button type="button" class="ckp-tab" data-page="([^"]+)"([^>]*)>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map((t) => t[1]), ['PRE-START', 'START', 'BEFORE TAXI', 'SHUTDOWN']);
  assert.deepEqual(tabs.map((t) => t[3]), ['PRE-START', 'START', 'BEFORE TAXI', 'SHUTDOWN']);
  assert.match(tabs[1][2], /data-on="true" aria-current="page" aria-label="Start page, current step"/);
  assert.match(tabs[3][2], /aria-label="Shutdown page"/);
  assert.match(h, /<nav class="ckp-tabs" aria-label="Checklist pages">/);
  assert.ok(h.indexOf('class="ckp-card"') < h.indexOf('class="ckp-tabs"'));
  assert.ok(!h.slice(h.indexOf('class="ckp-card"'), h.indexOf('<nav')).includes('ckp-tab'), 'tabs are not inside the scrolling card');
  // another page on request: BEFORE TAXI shows its sections, current step still named on its tab
  const bt = r({ plan: ckPlan('gndAir'), title: ckTitle('gndAir'), cursor: 10, size: 'narrow', page: 'BEFORE TAXI', onPage: () => {} });
  assert.match(bt, /SYSTEMS<\/h4>/);
  assert.doesNotMatch(bt, /CROSSBLEED<\/h4>/);
  // without onPage: Meghan's static spans (cj-pamphlet.test.ts keeps the byte-for-byte check)
  assert.match(r({ plan: CJ_CHECKLIST_PLAN, title: ckTitle('apu'), cursor: 0, size: 'wide' }), /<span class="ckp-tab" data-on="true" aria-current="true">PRE-START<\/span>/);
  const css = nc(src('src/packs/mounts/carrier-jet-v2.css'));
  assert.match(css, /\.cjcs-pamph \.cjcs-pages \{ display: flex; flex-direction: column; overflow: hidden; \}/);
  assert.match(css, /\.cjcs-startup > \.ckp\[data-paged\] > \.ckp-card \{ min-height: 0; overflow-y: auto;/);
  assert.match(css, /\.cjcs-startup > \.ckp\[data-paged\] > \.ckp-tabs \{ flex: none;/);
  assert.match(css, /\.ckp\[data-paged\] \.ckp-tab \{ box-sizing: border-box; min-width: 44px; min-height: 44px;[^}]*font-size: 11px;/);
  // the current line is centred inside the card only (scrollIntoView also scrolled the clipped pages box)
  const cs = src('src/packs/mounts/CjColdStart.tsx');
  assert.doesNotMatch(cs, /scrollIntoView/);
  assert.match(cs, /card\.scrollTop \+= r\.top - c\.top - \(c\.height - r\.height\) \/ 2;/);
  assert.match(cs, /if \(pamphlet === 'closed'\) setPage\(null\);/);
  void picked;
});

test('5 + 6 cover: MATRIX PILOT CHECKLIST with the next badge code', () => {
  const cs = src('src/packs/mounts/CjColdStart.tsx');
  assert.match(cs, /<strong>MATRIX PILOT CHECKLIST<\/strong>/);
  assert.doesNotMatch(cs, /CARRIER JET PILOT CHECKLIST|REVFORGE JET/);
  // NEXT only while the step's badge is under a closed guard (tests/cj-cover-next.test.ts)
  assert.match(cs, /const coverNext = csCoverNext\(view, inp\);/);
  assert.match(cs, /\{coverNext && <b className="cjcs-cover-next" data-code=\{coverNext\}>NEXT <span>\{coverNext\}<\/span><\/b>\}/);
  assert.doesNotMatch(cs, /step && !live && <b/);
  const css = nc(src('src/packs/mounts/carrier-jet-v2.css'));
  assert.match(css, /\.cjcs-cover > \.cjcs-cover-next \{[^}]*font-size: 12px;/);
  assert.ok(ckItems().length === 21);
});
