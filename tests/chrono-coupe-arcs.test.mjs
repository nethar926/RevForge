// Chrono Coupe time-jump arcs (skin side): on/off rules, WCAG-safe schedule, glow envelope, keep-out routing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'));
const arcs = () => jiti.import(join(root, 'src/skins/chrono-coupe/timeJumpArcs.ts'));

test('arcs are off unless asked for; prop false/undefined → none, true → on', async () => {
  const { arcsEnabled } = await arcs();
  const base = { still: false, reducedTransparency: false };
  assert.equal(arcsEnabled({ ...base }), false);
  assert.equal(arcsEnabled({ ...base, prop: undefined }), false);
  assert.equal(arcsEnabled({ ...base, prop: false }), false);
  assert.equal(arcsEnabled({ ...base, prop: true }), true);
  // previews: ?cc88=arcs forces on, ?cc88arcs=0|1 wins over everything else
  assert.equal(arcsEnabled({ ...base, prop: false, demoArcs: true }), true);
  assert.equal(arcsEnabled({ ...base, prop: undefined, query: true }), true);
  assert.equal(arcsEnabled({ ...base, prop: true, query: false }), false);
  assert.equal(arcsEnabled({ ...base, demoArcs: true, query: false }), false);
});

test('Reduce Motion / Animated environment off / Reduce Transparency beat the prop AND the preview overrides', async () => {
  const { arcsEnabled } = await arcs();
  for (const flags of [{ still: true, reducedTransparency: false }, { still: false, reducedTransparency: true }, { still: true, reducedTransparency: true }]) {
    assert.equal(arcsEnabled({ ...flags, prop: true }), false);
    assert.equal(arcsEnabled({ ...flags, demoArcs: true }), false);
    assert.equal(arcsEnabled({ ...flags, query: true }), false);
    assert.equal(arcsEnabled({ ...flags, prop: true, demoArcs: true, query: true }), false);
  }
});

test('HUD wiring: default false, overrides go through arcsEnabled with still + Reduce Transparency', () => {
  const hud = readFileSync(join(root, 'src/skins/chrono-coupe/ChronoCoupeHud.tsx'), 'utf8');
  assert.match(hud, /arcsEnabled\(\{ prop: props\.timeJumpArcs, demoArcs: demo88\?\.arcs, query: cc88ArcsFromQuery\(\), still, reducedTransparency \}\)/);
  assert.doesNotMatch(hud, /timeJumpArcs \?\? true/);
  // the arcs host must not share a React key with the frame light (a duplicate key mounted the light twice)
  assert.match(hud, /key=\{`arcs-\$\{jump\.run\}`\}/);
});

test('schedule: 4-6 (2-3 local) strikes, <=2 alive, <=3 starts in any 1 s, soft fades, done by 2 s', async () => {
  const { schedule, rng32, strikeEnd } = await arcs();
  for (let seed = 1; seed < 400; seed++) {
    for (const [min, max] of [[4, 6], [2, 3]]) {
      const s = schedule(rng32(seed), min, max);
      assert.ok(s.length >= min && s.length <= max, `seed ${seed}: ${s.length}`);
      for (const x of s) {
        assert.ok(x.fadeIn >= 80 && x.fadeIn <= 120 && x.fadeOut >= 200 && x.fadeOut <= 300, 'fade ranges');
        assert.ok(strikeEnd(x) <= 1980);
        assert.ok(s.filter((o) => o.at <= x.at && x.at < strikeEnd(o)).length <= 2, 'concurrency');
        assert.ok(s.filter((o) => o.at > x.at - 1000 && o.at <= x.at).length <= 3, 'starts per second');
      }
    }
  }
});

test('envelope: eases in, holds, eases out, no flicker (monotonic up then down)', async () => {
  const { envelope } = await arcs();
  const st = { at: 100, fadeIn: 100, hold: 80, fadeOut: 250 };
  const v = [];
  for (let t = 0; t <= 600; t += 5) v.push(envelope(st, t));
  const peak = v.indexOf(Math.max(...v));
  for (let i = 1; i <= peak; i++) assert.ok(v[i] >= v[i - 1]);
  for (let i = peak + 1; i < v.length; i++) assert.ok(v[i] <= v[i - 1]);
  assert.equal(envelope(st, 99), 0);
  assert.equal(envelope(st, 250), 1);
  assert.equal(envelope(st, 531), 0);
});

test('planned arcs stay in bounds and never touch a keep-out box', async () => {
  const { planArcs } = await arcs();
  const bounds = { l: 4, t: 4, r: 1236, b: 618 };
  const keepOut = [];
  for (let x = 30; x < 1200; x += 260) for (let y = 30; y < 580; y += 150) keepOut.push({ l: x, t: y, r: x + 170, b: y + 80 });
  const anchors = [];
  for (let x = 20; x < 1220; x += 24) anchors.push({ x, y: 18 }, { x, y: 604 });
  for (let y = 20; y < 600; y += 24) anchors.push({ x: 18, y }, { x: 1222, y });
  const field = { anchors, core: [], keepOut, bounds };
  const hit = (p, q, r) => {
    for (let i = 0; i <= 8; i++) {
      const x = p.x + ((q.x - p.x) * i) / 8;
      const y = p.y + ((q.y - p.y) * i) / 8;
      if (x >= r.l && x <= r.r && y >= r.t && y <= r.b) return true;
    }
    return false;
  };
  let total = 0;
  for (let seed = 1; seed < 40; seed++) {
    const strikes = planArcs(field, seed, false);
    total += strikes.length;
    for (const s of strikes) for (const path of [s.main, ...s.branches]) {
      for (const p of path) assert.ok(p.x >= bounds.l && p.x <= bounds.r && p.y >= bounds.t && p.y <= bounds.b);
      for (let i = 1; i < path.length; i++) for (const r of keepOut) assert.ok(!hit(path[i - 1], path[i], r), `seed ${seed}`);
    }
  }
  assert.ok(total >= 39 * 4 * 0.8, `routes found: ${total}`);
});
