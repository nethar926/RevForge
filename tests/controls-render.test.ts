// SSR smoke render of the headless controls in both modes (bundled with rolldown, react external): ARIA roles,
// 44 px tap-mode parts present, the armed label path, and the ACCESS group markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
type Mod = Record<string, unknown>;
let loaded: Promise<{ mod: Mod; render: (c: string, p: object) => string }> | undefined;
function load() {
  loaded ??= (async () => {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({
      input: join(root, 'src/controls/index.ts'),
      external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
      plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.css$/.test(id) ? '\0ctl-empty' : null), load: (id: string) => (id === '\0ctl-empty' ? 'export default ""' : null) }],
      transform: { jsx: 'react-jsx' },
      logLevel: 'silent',
    } as never);
    const { output } = await bundle.generate({ format: 'esm' });
    const dir = mkdtempSync(join(root, 'node_modules/.ctl-test-'));
    const file = join(dir, 'controls.mjs');
    writeFileSync(file, output[0].code);
    const mod = (await import(pathToFileURL(file).href)) as Mod;
    rmSync(dir, { recursive: true, force: true });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { mod, render: (c: string, p: object) => renderToStaticMarkup(React.createElement(mod[c] as never, p as never)) };
  })();
  return loaded;
}
const noop = () => {};

test('SlideConfirm: drag = track + thumb; tap = one button whose name says "Tap twice"', async () => {
  const { render } = await load();
  const d = render('SlideConfirm', { label: 'Shut down', onConfirm: noop, mode: 'drag' });
  assert.match(d, /data-rf-ctl="slide-confirm"/);
  assert.match(d, /data-mode="drag"/);
  assert.match(d, /class="rf-slide__thumb"/);
  assert.match(d, /Slide to shut down/);
  const t = render('SlideConfirm', { label: 'Shut down', onConfirm: noop, mode: 'tap' });
  assert.match(t, /data-mode="tap"/);
  assert.match(t, /aria-label="Shut down. Tap twice to confirm"/);
  assert.match(t, /data-armed="false"/);
  // default mode on the server = tap (the safe mode)
  assert.match(render('SlideConfirm', { label: 'Go', onConfirm: noop }), /data-mode="tap"/);
});

test('RangeDial: slider ARIA; tap mode adds − / + step buttons, disabled at the ends', async () => {
  const { render } = await load();
  const p = { label: 'Volume', value: 0, min: 0, max: 10, step: 1, onChange: noop, formatValue: (v: number) => `${v} of 10` };
  const d = render('RangeDial', { ...p, mode: 'drag' });
  assert.match(d, /role="slider"/);
  assert.match(d, /aria-valuenow="0"/);
  assert.match(d, /aria-valuemin="0"/);
  assert.match(d, /aria-valuemax="10"/);
  assert.match(d, /aria-valuetext="0 of 10"/);
  assert.doesNotMatch(d, /Decrease Volume/);
  const t = render('RangeDial', { ...p, value: 0, mode: 'tap' });
  assert.match(t, /<button[^>]*aria-label="Decrease Volume"[^>]*disabled=""/);
  assert.match(t, /<button[^>]*aria-label="Increase Volume"(?![^>]*disabled)/);
  // out-of-range value is clamped for display
  assert.match(render('RangeDial', { ...p, value: 99, mode: 'tap' }), /aria-valuenow="10"/);
});

test('RadialMenu: drag = ring of menuitems + hub; tap = plain list', async () => {
  const { render } = await load();
  const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo', disabled: true }, { id: 'c', label: 'Charlie' }];
  const d = render('RadialMenu', { label: 'Pick', items, onSelect: noop, mode: 'drag' });
  assert.match(d, /role="menu"/);
  assert.equal((d.match(/role="menuitem"/g) ?? []).length, 3);
  assert.match(d, /class="rf-radial__hub"/);
  const t = render('RadialMenu', { label: 'Pick', items, onSelect: noop, mode: 'tap' });
  assert.match(t, /class="rf-radial__list"/);
  assert.doesNotMatch(t, /rf-radial__hub/);
  assert.match(t, /aria-disabled="true"[^>]*>Bravo/);
});

test('MagneticSelect: radiogroup + radios; the puck only in drag mode', async () => {
  const { render } = await load();
  const options = [{ value: 'n', label: 'Night' }, { value: 'd', label: 'Day' }];
  const d = render('MagneticSelect', { label: 'Theme', options, value: 'd', onChange: noop, mode: 'drag' });
  assert.match(d, /role="radiogroup"/);
  assert.match(d, /role="radio" aria-checked="true"[^>]*>Day/);
  assert.match(d, /rf-magnet__puck/);
  const t = render('MagneticSelect', { label: 'Theme', options, value: 'd', onChange: noop, mode: 'tap' });
  assert.doesNotMatch(t, /rf-magnet__puck/);
});

test('ACCESS group: heading + Prefer Taps switch with description', async () => {
  const { render } = await load();
  const h = render('AccessOptionsGroup', {});
  assert.match(h, /ACCESS/);
  assert.match(h, /Accessibility/);
  assert.match(h, /type="checkbox" role="switch" aria-label="Prefer Taps"/);
  assert.match(h, /Turns every drag or slide control into taps\./);
  assert.doesNotMatch(h, /checked=""/, 'default OFF');
});
