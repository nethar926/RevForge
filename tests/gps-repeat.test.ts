/** watchPosition callbacks with a repeated position.timestamp are dropped; everything else passes unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRepeatGate } from '../src/hooks/gpsRepeat.ts';

test('repeated position.timestamp is dropped; new, older and close-together timestamps pass', () => {
  const g = createRepeatGate();
  assert.equal(g.accept(1000), true);
  assert.equal(g.accept(1000), false); // same fix again (getCurrentPosition + first watch callback)
  assert.equal(g.accept(1000), false);
  assert.equal(g.accept(1050), true); // 50 ms later: no time window here (audio folds < 0.3 s)
  assert.equal(g.accept(1000), true); // not equal to the last accepted one: unchanged pass-through
  assert.equal(g.accept(NaN), true);
  assert.equal(g.accept(NaN), true);
  g.reset();
  assert.equal(g.accept(1000), true);
});

test('useGeolocation gates onFix on the raw timestamp before anything else, one gate per start', () => {
  const s = readFileSync(new URL('../src/hooks/useGeolocation.ts', import.meta.url), 'utf8');
  assert.match(s, /const request = generation\.current;\s*const repeat = createRepeatGate\(\);/);
  assert.match(s, /if \(request !== generation\.current\) return;\s*\/\/[^\n]*\n\s*if \(!repeat\.accept\(pos\.timestamp\)\) return;\s*const wallNow = Date\.now\(\);/);
});
