/**
 * MediaOutput.routed / playingElement(): useAudioEngine's getMediaElement() returns the element
 * only while the mix is routed through it (enable() succeeded) AND it is playing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'));

class FakeAudio {
  constructor() { this.paused = true; this.attrs = {}; this.srcObject = null; this.failPlay = false; }
  setAttribute(k, v) { this.attrs[k] = v; }
  play() { if (this.failPlay) return Promise.reject(new Error('NotAllowedError')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
function fakeCtx() {
  const destination = { name: 'destination' };
  const stream = { stream: { getTracks: () => [] }, disconnect() {} };
  return { destination, createMediaStreamDestination: () => stream };
}
function fakeNode(ctx) {
  return { context: ctx, links: new Set([ctx.destination]), connect(n) { this.links.add(n); }, disconnect(n) { this.links.delete(n); } };
}

test('playingElement: null until enable() succeeds, element while routed + playing, null when paused or disabled', async () => {
  const saved = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  try {
    const { MediaOutput } = await jiti.import(join(root, 'src/audio/MediaOutput.ts'));
    const ctx = fakeCtx();
    const out = new MediaOutput(ctx);
    out.attach(fakeNode(ctx));
    assert.equal(out.routed, false);
    assert.equal(out.playingElement(), null, 'not routed');

    out.element.failPlay = true;
    await assert.rejects(out.enable());
    assert.equal(out.routed, false, 'enable() failed → not routed');
    assert.equal(out.playingElement(), null);

    out.element.failPlay = false;
    await out.enable();
    assert.equal(out.routed, true);
    assert.equal(out.active, true);
    assert.equal(out.playingElement(), out.element, 'routed and playing');

    out.element.pause(); // e.g. the OS paused the element
    assert.equal(out.routed, true);
    assert.equal(out.playingElement(), null, 'routed but paused → null');

    out.element.paused = false;
    out.disable();
    assert.equal(out.routed, false);
    assert.equal(out.playingElement(), null, 'disabled → null');

    out.element.paused = false; // playing but not routed
    assert.equal(out.playingElement(), null, 'playing but not routed → null');
  } finally {
    globalThis.Audio = saved;
  }
});

test('useAudioEngine.getMediaElement delegates to MediaOutput.playingElement()', () => {
  const hook = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(hook, /const getMediaElement=useCallback\(\(\)=>mediaRef\.current\?\.playingElement\(\)\?\?null,\[\]\);/);
});
