import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OfflineAudioContext } from "node-web-audio-api";
import { RevForgeVoice } from "../src/forge/RevForgeVoice.js";
const packs = JSON.parse(
  readFileSync(new URL("../src/forge/revforge-packs.json", import.meta.url)),
);
// Web Audio's offline renderer cannot resume before rendering. Only its state getter is adapted;
// all oscillators, buffers, filters, waveshaping and compression run through the real renderer.
const timers = new Set();
globalThis.window = {
  setInterval: (fn, ms) => {
    const id = setInterval(fn, ms);
    timers.add(id);
    return id;
  },
  clearInterval: (id) => {
    clearInterval(id);
    timers.delete(id);
  },
};
for (const pack of packs)
  test(`native RevForge ${pack.id}: audible, finite, bounded output`, async () => {
    const offline = new OfflineAudioContext(2, 22050, 44100);
    const context = new Proxy(offline, {
      get(target, key) {
        if (key === "state") return "running";
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const voice = new RevForgeVoice(context, offline.destination);
    try {
      await voice.start(pack.engine, {
        masterVolume: 0.85,
        engineVolume: 1,
        musicVolume: 0.45,
      });
      voice.update({
        rpm: pack.engine.redline * 0.55,
        load: 0.7,
        accel: 2,
        shifting: false,
        overrun: false,
      });
      const buffer = await offline.startRendering();
      let sum = 0,
        peak = 0;
      for (const sample of buffer.getChannelData(0)) {
        assert.ok(Number.isFinite(sample));
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(sum / buffer.length);
      assert.ok(rms > 0.0001, `silent output: ${rms}`);
      assert.ok(peak < 1.5, `unexpected peak: ${peak}`);
    } finally {
      voice.dispose();
    }
    assert.equal(voice.osc.length, 0);
    assert.equal(voice.sources.length, 0);
    assert.equal(voice.nodes.length, 0);
    assert.equal(timers.size, 0);
  });
test("changing voice architecture cleans the previous graph and timers", async () => {
  const offline = new OfflineAudioContext(2, 4410, 44100);
  const ctx = new Proxy(offline, {
    get(t, k) {
      if (k === "state") return "running";
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  const voice = new RevForgeVoice(ctx, offline.destination);
  await voice.start(packs.find((p) => p.id === "copper-mile").engine, {
    masterVolume: 0.85,
    engineVolume: 1,
    musicVolume: 0.45,
  });
  voice.applyPatch(packs.find((p) => p.id === "ember-dusk").engine);
  assert.equal(timers.size, 0);
  voice.update({
    rpm: 3000,
    load: 0.6,
    accel: 1,
    shifting: false,
    overrun: false,
  });
  await offline.startRendering();
  voice.dispose();
  assert.equal(voice.nodes.length, 0);
});
for(const mode of ['turbine-whir','turbine-afterburner','starfighter-on','starfighter-off'])
 test(`flight character ${mode}: renders and gates signature`,async()=>{
  const offline=new OfflineAudioContext(2,22050,44100);
  const ctx=new Proxy(offline,{get(t,k){if(k==='state')return 'running';const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
  const voice=new RevForgeVoice(ctx,offline.destination);
  const jet=mode.startsWith('turbine');
  const engine={...packs[0].engine,voice:jet?'turbine':'starfighter'};
  try{
   await voice.start(engine,{masterVolume:.8,engineVolume:1,musicVolume:0});
   voice.update({rpm:engine.redline*.95,load:1,accel:2,shifting:false,overrun:false,tieSignature:mode!=='starfighter-off',flight:{spool:.95,thrust:mode==='turbine-afterburner'?1:0,afterburner:mode==='turbine-afterburner'?1:0}});
   const rendered=await offline.startRendering();const data=rendered.getChannelData(0);
   assert.ok(data.every(Number.isFinite));assert.ok(data.some(x=>Math.abs(x)>.001));
   assert.ok(Math.max(...data.map(Math.abs))<1.5);
   if(mode==='starfighter-off')assert.ok(voice.screamGain.gain.value<.00011);
   if(mode==='starfighter-on')assert.ok(voice.screamGain.gain.value>.1);
   if(mode==='turbine-afterburner')assert.ok(voice.raspGain.gain.value>.2);
   if(mode==='turbine-whir')assert.ok(voice.raspGain.gain.value<.009);
  }finally{voice.dispose();}
 });
