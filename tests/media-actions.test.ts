import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCommand} from '../src/forge/mediaActions.ts';
test('media pause shifts only for an active manual gearbox with the option enabled',()=>{
 assert.equal(mediaCommand('pause',true,true,true),'up');
 assert.equal(mediaCommand('pause',true,true,false),'stop');
 assert.equal(mediaCommand('pause',true,false,true),'stop');
 assert.equal(mediaCommand('pause',false,true,true),'none');
});
test('track controls shift manual gears and leave automatic transmission alone',()=>{
 assert.equal(mediaCommand('nexttrack',true,true,true),'up');
 assert.equal(mediaCommand('previoustrack',true,true,true),'down');
 for(const action of ['nexttrack','previoustrack'] as const){
  assert.equal(mediaCommand(action,true,false,true),'none');
  assert.equal(mediaCommand(action,false,true,true),'none');
 }
});
test('play starts a stopped engine without shifting a running engine',()=>{
 assert.equal(mediaCommand('play',false,true,true),'start');
 assert.equal(mediaCommand('play',true,true,true),'none');
});
test('received play/pause fires blasters only while a Twin-Ion engine is running',()=>{
 for(const action of ['play','pause'] as const)assert.equal(mediaCommand(action,true,false,false,true),'blaster');
 assert.equal(mediaCommand('play',false,false,false,true),'start');
 assert.equal(mediaCommand('pause',false,false,false,true),'none');
});
import {LEGACY_MEDIA_OPT_IN_KEY,MEDIA_BUTTONS_KEY,carrierWav,isElementPlaying,mediaMetadataFields,mediaPlaybackState,mediaSessionHeld,readMediaButtons} from '../src/forge/mediaActions.ts';
test('next/previous act as paddles in Auto when the gearbox can shift (caller switches to Manual)',()=>{
 assert.equal(mediaCommand('nexttrack',true,false,true,false,true),'up');
 assert.equal(mediaCommand('previoustrack',true,false,true,false,true),'down');
 assert.equal(mediaCommand('nexttrack',true,false,true,false,false),'none');
 assert.equal(mediaCommand('nexttrack',false,false,true,false,true),'none');
 assert.equal(mediaCommand('pause',true,false,true,false,true),'stop');
 // Twin-Ion keeps next/previous for gears.
 assert.equal(mediaCommand('nexttrack',true,true,true,true,true),'up');
});
test('session is held only while the engine runs or starts, and only when the setting is on',()=>{
 assert.equal(mediaSessionHeld(true,true),true);
 assert.equal(mediaSessionHeld(true,false,true),true);
 assert.equal(mediaSessionHeld(true,false,false),false);
 assert.equal(mediaSessionHeld(false,true,true),false);
 assert.equal(mediaPlaybackState(true),'playing');
 assert.equal(mediaPlaybackState(false),'none');
});
test('media buttons default on; a stored legacy opt-in "false" is dropped once; an explicit off is kept',()=>{
 const store=(init:Record<string,string>)=>{const m=new Map(Object.entries(init));return {m,getItem:(k:string)=>m.get(k)??null,removeItem:(k:string)=>{m.delete(k);}};};
 assert.equal(readMediaButtons(store({})),true);
 const legacy=store({[LEGACY_MEDIA_OPT_IN_KEY]:'false'});assert.equal(readMediaButtons(legacy),true);assert.equal(legacy.m.has(LEGACY_MEDIA_OPT_IN_KEY),false);
 assert.equal(readMediaButtons(store({[MEDIA_BUTTONS_KEY]:'false'})),false);
 assert.equal(readMediaButtons(store({[MEDIA_BUTTONS_KEY]:'true',[LEGACY_MEDIA_OPT_IN_KEY]:'false'})),true);
 assert.equal(readMediaButtons(null),true);
 assert.equal(readMediaButtons({getItem:()=>{throw Error('blocked');},removeItem:()=>{}}),true);
});
test('metadata names the pack, RevForge and the gearbox',()=>{
 const art=[{src:'a.png',sizes:'96x96',type:'image/png'}];
 assert.deepEqual(mediaMetadataFields('Night Pursuit',true,art),{title:'Night Pursuit',artist:'RevForge',album:'Manual gearbox',artwork:art});
 assert.equal(mediaMetadataFields('',false).title,'RevForge');
 assert.equal(mediaMetadataFields('V8',false).album,'Automatic gearbox');
});
test('only a really playing element counts (paused, muted, silent volume, not ready, ended are rejected)',()=>{
 const ok={paused:false,muted:false,volume:1,ended:false,readyState:4};
 assert.equal(isElementPlaying(ok),true);
 for(const bad of [{paused:true},{muted:true},{volume:0},{ended:true},{readyState:1}])assert.equal(isElementPlaying({...ok,...bad}),false);
 assert.equal(isElementPlaying(null),false);
});
test('carrier is a >5 s PCM WAV of low-level noise (not digital silence, below -55 dBFS)',()=>{
 const b=carrierWav(),v=new DataView(b),tag=(o:number)=>String.fromCharCode(...new Uint8Array(b,o,4));
 assert.equal(tag(0),'RIFF');assert.equal(tag(8),'WAVE');assert.equal(tag(36),'data');
 const rate=v.getUint32(24,true),bytes=v.getUint32(40,true);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);
 assert.ok(bytes/2/rate>5,'longer than 5 s');assert.equal(b.byteLength,44+bytes);
 let peak=0,sum=0,nonzero=0;for(let i=0;i<bytes/2;i++){const s=v.getInt16(44+i*2,true)/32768;peak=Math.max(peak,Math.abs(s));sum+=s*s;if(s)nonzero++;}
 const rmsDb=10*Math.log10(sum/(bytes/2)),peakDb=20*Math.log10(peak);
 assert.ok(nonzero>bytes/4,'not silence');assert.ok(peakDb<=-59.9&&peakDb>-61,`peak ${peakDb}`);assert.ok(rmsDb<-62&&rmsDb>-70,`rms ${rmsDb}`);
});
