import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCommand,runMediaCommand,type MediaCommandDeps} from '../src/forge/mediaActions.ts';
test('media pause shifts only for an active manual gearbox with the option enabled',()=>{
 assert.equal(mediaCommand('pause',true,true,true),'up');
 assert.equal(mediaCommand('pause',true,true,false),'mute');
 assert.equal(mediaCommand('pause',true,false,true),'mute');
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
test('play starts a stopped engine and only unmutes a running one',()=>{
 assert.equal(mediaCommand('play',false,true,true),'start');
 assert.equal(mediaCommand('play',true,true,true),'unmute','play on a running engine unmutes (no restart)');
});
test('received play/pause fires blasters only while a Twin-Ion engine is running',()=>{
 for(const action of ['play','pause'] as const)assert.equal(mediaCommand(action,true,false,false,true),'blaster');
 assert.equal(mediaCommand('play',false,false,false,true),'start');
 assert.equal(mediaCommand('pause',false,false,false,true),'none');
});
test('car pause mutes, never stops; car stop is the only media button that ends the sound',()=>{
 for(const running of [true,false])for(const manual of [true,false])for(const pauseShifts of [true,false])for(const blasters of [true,false]){
  const c=mediaCommand('pause',running,manual,pauseShifts,blasters);
  assert.ok(c!=='stop'&&c!=='start',`pause ${running} ${manual} ${pauseShifts} ${blasters} -> ${c}`);
 }
 assert.equal(mediaCommand('pause',true,false,false),'mute');
 assert.equal(mediaCommand('pause',true,true,true),'up','opt-in pause shifts unchanged');
 assert.equal(mediaCommand('stop',true,false,false),'stop');
 assert.equal(mediaCommand('stop',true,false,false,true),'stop');
 assert.equal(mediaCommand('stop',false,false,false),'none');
});

/** fake Drive: engine + sim state, the app mute, the media element */
function drive(){
 const st={running:true,muted:false,starts:0,stops:0,shutoffs:0,elementPauses:0,arms:0,simTicks:0};
 const session={playbackState:'playing' as MediaSessionPlaybackState};
 const deps:MediaCommandDeps={session,arm:()=>{st.arms++;},start:()=>{st.starts++;st.running=true;},stop:()=>{st.stops++;st.shutoffs++;st.running=false;},
  mute:()=>{st.muted=true;},unmute:()=>{st.muted=false;},shift:()=>{}};
 const press=(action:'play'|'pause'|'stop')=>runMediaCommand(mediaCommand(action,st.running,false,true),deps);
 return {st,session,press};
}
test('car pause then play resumes without a restart: muted while paused, engine never stopped or restarted',()=>{
 const d=drive();
 d.press('pause');
 assert.deepEqual([d.st.running,d.st.muted,d.session.playbackState],[true,true,'paused']);
 assert.equal(d.st.stops,0,'pause never calls stop()');
 assert.equal(d.st.shutoffs,0,'no shutoff sound');
 d.press('pause'); // a second pause stays paused
 assert.deepEqual([d.st.running,d.st.muted,d.st.stops],[true,true,0]);
 d.press('play');
 assert.deepEqual([d.st.running,d.st.muted,d.session.playbackState],[true,false,'playing']);
 assert.equal(d.st.starts,0,'no restart: the engine kept running through the pause');
 assert.equal(d.st.stops,0);
 assert.equal(d.st.elementPauses,0,'the media element is never paused');
});
test('car stop ends the sound; play then starts the engine unmuted',()=>{
 const d=drive();
 d.press('pause'); d.press('stop');
 assert.deepEqual([d.st.running,d.st.stops],[false,1]);
 d.press('play');
 assert.deepEqual([d.st.running,d.st.muted,d.st.starts,d.session.playbackState],[true,false,1,'playing']);
});
