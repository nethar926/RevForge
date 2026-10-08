/**
 * Deterministic Math.random for offline renders (preview WAVs / QA): unchanged packs render
 * byte-identical run to run. Seed = string (pack id) or number. Restores Math.random after.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function seedFrom(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seedFrom(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function withSeededRandom(seed, fn) {
  const prev = Math.random;
  Math.random = mulberry32(seed);
  try {
    return await fn();
  } finally {
    Math.random = prev;
  }
}

/**
 * AudioWorklet processors run in their own realm, so seeding the main thread does not reach
 * them. Writes a temp copy of the processor module prefixed with a seeded Math.random and
 * returns its path (for ctx.audioWorklet.addModule). Offline renders only — the shipped
 * worklet is untouched.
 */
export function seededWorkletModule(workletPath, seed) {
  const s = seedFrom(seed);
  const key = `${s}-${createHash('sha1').update(workletPath).digest('hex').slice(0, 8)}`;
  const dest = join(tmpdir(), `revforge-seeded-worklet-${key}.js`);
  const prelude =
    `{ let a = ${s} | 0; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);` +
    ` t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }\n`;
  writeFileSync(dest, prelude + readFileSync(workletPath, 'utf8'));
  return dest;
}
