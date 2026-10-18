// AUDIO CHANNELS diagnostics line (Options panel, src/forge): Dan's getOutputChannels() (75474bd), '—' while null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioChannelsLine, readOutputChannels } from '../src/forge/audioChannels.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('AUDIO CHANNELS: N with a VoiceOver label; — while null (before audio starts) or without the method', () => {
  assert.deepEqual(audioChannelsLine(2), { text: 'AUDIO CHANNELS: 2', aria: 'Audio output channels, 2' });
  assert.deepEqual(audioChannelsLine(6), { text: 'AUDIO CHANNELS: 6', aria: 'Audio output channels, 6' });
  assert.deepEqual(audioChannelsLine(null), { text: 'AUDIO CHANNELS: —', aria: 'Audio output channels, not available' });
  assert.equal(readOutputChannels({ getOutputChannels: () => 2 }), 2);
  assert.equal(readOutputChannels({ getOutputChannels: () => null }), null);
  assert.equal(readOutputChannels({}), null, 'branches without 75474bd');
  assert.equal(readOutputChannels({ getOutputChannels: () => { throw new Error('no ctx'); } }), null);
  assert.equal(readOutputChannels({ getOutputChannels: () => 0 }), null);
});

test('refreshes when audio starts: null before start, the count after (same hook object, re-read on running)', () => {
  let ctx: { destination: { maxChannelCount: number } } | null = null;
  const audio = { running: false, getOutputChannels: () => ctx?.destination.maxChannelCount ?? null };
  assert.equal(audioChannelsLine(readOutputChannels(audio)).text, 'AUDIO CHANNELS: —');
  ctx = { destination: { maxChannelCount: 2 } }; audio.running = true;
  assert.equal(audioChannelsLine(readOutputChannels(audio)).text, 'AUDIO CHANNELS: 2');
  const page = src('forge/ForgePage.tsx');
  assert.match(page, /const audioCh = useMemo\(\(\) => audioChannelsLine\(readOutputChannels\(audio\)\), \[audio, audio\.running\]\);/);
});

test('Options panel row: one read-only line under the audio context status, 12px (.forge-tune p), named for VoiceOver', () => {
  const page = src('forge/ForgePage.tsx');
  assert.match(page, /Audio context: \{audio\.getDiag\(\)\.contextState\}<\/p><p className="forge-audio-channels" role="note" aria-label=\{audioCh\.aria\}>\{audioCh\.text\}<\/p>/);
  assert.match(src('forge/forge.css'), /\.forge-tune p \{\n\s*font-size: 12px;/);
});
