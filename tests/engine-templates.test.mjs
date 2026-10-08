import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'));

test('EngineForge category templates default to the visible catalogue engines', async () => {
  const b = await jiti.import(join(root, 'src/audio/builtins.ts'));
  assert.equal(b.defaultPatchIdForKind('ice'), 'night-pursuit');
  assert.equal(b.defaultPatchIdForKind('ev-whine'), 'stellar-helm');
  assert.equal(b.defaultPatchIdForKind('aerospace'), 'aerospace-f14', 'unchanged (tab hidden pending rework)');
  assert.equal(b.defaultPatchIdForKind('scifi'), 'ion-twin', 'unchanged (tab hidden pending rework)');
  assert.equal(b.defaultPatchIdForKind('unknown-kind'), 'night-pursuit', 'default falls back to the ICE template');
});

test('every category template resolves to a builtin of that kind', async () => {
  const b = await jiti.import(join(root, 'src/audio/builtins.ts'));
  for (const kind of ['ice', 'ev-whine', 'aerospace', 'scifi']) {
    const patch = b.getBuiltin(b.defaultPatchIdForKind(kind));
    assert.ok(patch, `builtin for ${kind}`);
    assert.equal(patch.kind, kind, `${patch.id} is kind ${kind}`);
  }
});
