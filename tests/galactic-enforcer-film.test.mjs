import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = 'src/skins/galactic-enforcer';
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const files = [...readdirSync(join(root, dir)).map((f) => `${dir}/${f}`), ...readdirSync(join(root, dir, 'preview')).map((f) => `${dir}/preview/${f}`)].filter((f) => /\.(tsx?|css|md|html)$/.test(f));

test('no film-craft or franchise strings in the Galactic Enforcer skin', () => {
  const banned = [/\bx[\s_-]?wing\b/i, /\btie\b/i, /\btie[\s_-]?fighter\b/i, /star\s*wars/i, /\bgniwx\b/i];
  for (const f of files) for (const re of banned) assert.doesNotMatch(read(f), re, `${f} matches ${re}`);
});

test('glyph font is only used for the decorative glyph lines', () => {
  const css = read(`${dir}/galactic-enforcer.css`);
  const uses = [...css.matchAll(/var\(--ge-glyph\)/g)];
  assert.equal(uses.length, 1);
  const before = css.slice(0, uses[0].index);
  assert.match(before.slice(before.lastIndexOf('}')), /\.ge-glyphs\s*\{/);
  const tsx = read(`${dir}/GalacticEnforcerHud.tsx`);
  assert.doesNotMatch(tsx, /skin-number|className="[^"]*aurebesh/i, 'data must not pick up the .galactic-type glyph cascade');
});

test('craft ids stay drone / interceptor', () => {
  const s = read(`${dir}/craft.ts`);
  assert.match(s, /export type CraftId = 'drone' \| 'interceptor';/);
});

test('lock stage mapping unchanged from the previous HUD', async () => {
  const out = ts.transpileModule(read(`${dir}/hudModel.ts`), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'ge-test-')), 'm.mjs');
  writeFileSync(file, out);
  const { lockStageFor } = await import(pathToFileURL(file).href);
  assert.equal(lockStageFor(0.2), 'SEARCHING');
  assert.equal(lockStageFor(0.55), 'ACQUIRING');
  assert.equal(lockStageFor(0.75), 'TARGET LOCK');
  assert.equal(lockStageFor(0.9), 'FIRING SOLUTION');
  assert.equal(lockStageFor(0.9, 'none'), 'SEARCHING');
  assert.equal(lockStageFor(0, 'kill'), 'FIRING SOLUTION');
});
