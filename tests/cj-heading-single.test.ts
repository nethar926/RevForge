import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function legend() {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: join(root, 'src/skins/carrier-jet/map/HeadingLegend.tsx'),
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await bundle.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cj-hdg1-test-'));
  const file = join(dir, 'l.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  return (p: Record<string, unknown>) => renderToStaticMarkup(React.createElement(mod.CjHeadingLegend, { trueHdg: 40, magHdg: 47, ...p }));
}

test('CjHeadingLegend single: one line (lead only); default keeps both', async () => {
  const r = await legend();
  const spans = (h: string) => (h.match(/<span/g) ?? []).length;
  assert.equal(spans(r({})), 2);
  const one = r({ single: true });
  assert.equal(spans(one), 1);
  assert.match(one, /data-single="true"/);
  assert.match(one, /047/);
  assert.doesNotMatch(one, /040/);
});
