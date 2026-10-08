// Original procedural synthesis, calibrated from spectral/envelope measurements.
// No reference recording or extracted waveform is included.
/** time-jump cue: total length cap (attack + sweep + release + source stop), seconds. */
export const TIME_JUMP_CUE_SECONDS=2;
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
export class ProceduralCharacter {
 constructor(ctx,destination){
  this.ctx=ctx;this.nodes=[];this.sources=[];this.shots=new Set();this.active=false;this.lastCue=-10;this.previousOverrun=false;
  this.master=this.node(ctx.createGain());this.master.gain.value=.65;
  this.limiter=this.node(ctx.createDynamicsCompressor());this.limiter.threshold.value=-15;this.limiter.knee.value=8;this.limiter.ratio.value=16;this.limiter.attack.value=.003;this.limiter.release.value=.16;
  this.master.connect(this.limiter);this.trim=this.node(ctx.createGain());this.trim.gain.value=.6;this.limiter.connect(this.trim);this.trim.connect(destination);
  this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const data=this.noise.getChannelData(0);let walk=0;
  for(let i=0;i<data.length;i++){walk=(walk+(Math.random()*2-1)*.08)/1.015;data[i]=walk*2;}
  const noise=this.node(ctx.createBufferSource());noise.buffer=this.noise;noise.loop=true;noise.start();this.sources.push(noise);
  // Tonal harmonic screams through moving formants, with a quieter noise bed.
  this.roar=this.node(ctx.createGain());this.roar.gain.value=0;
  this.warmth=this.node(ctx.createBiquadFilter());this.warmth.type='lowpass';this.warmth.frequency.value=4200;this.warmth.Q.value=.5;
  this.roar.connect(this.warmth);this.warmth.connect(this.master);
  this.space=this.node(ctx.createGain());this.space.gain.value=.22;this.space.connect(this.master);
  for(const [time,pan] of [[.023,-.65],[.037,.65]]){const delay=this.node(ctx.createDelay(.1));delay.delayTime.value=time;const filter=this.node(ctx.createBiquadFilter());filter.type='lowpass';filter.frequency.value=2200;const panner=this.node(ctx.createStereoPanner());panner.pan.value=pan;this.warmth.connect(delay);delay.connect(filter);filter.connect(panner);panner.connect(this.space);}
  this.banks=[[205,406,361,159,517,1063],[436,552,598,129,875,1402],[420,1314,377,1252,732,912]].map((anchors,k)=>{const bus=this.node(ctx.createGain());bus.gain.value=0;bus.connect(this.roar);const tone=this.node(ctx.createGain());tone.gain.value=.24;const carrier=this.osc('sawtooth',[102,145,140][k],tone);const fm=this.node(ctx.createGain());fm.gain.value=18;const mod=this.osc('sine',71+k*17,fm);fm.connect(carrier.frequency);return {bus,anchors,carrier,mod,tone,filters:anchors.map((f,i)=>{const filter=this.node(ctx.createBiquadFilter());filter.type='bandpass';filter.frequency.value=f;filter.Q.value=1.2;const gain=this.node(ctx.createGain());gain.gain.value=[1.55,.95,.6,.38,.3,.24][i];const bed=this.node(ctx.createGain());bed.gain.value=.18;noise.connect(bed);bed.connect(filter);tone.connect(filter);filter.connect(gain);gain.connect(bus);return filter;})};});
  this.body=this.node(ctx.createGain());this.body.gain.value=.23;this.body.connect(this.roar);
  this.sub=this.osc('sine',48,this.body);
  this.voices=[1,1.013,1.498,2.007].map((ratio,i)=>{const gain=this.node(ctx.createGain());gain.gain.value=[.13,.11,.055,.035][i];gain.connect(this.roar);const voice=this.osc('sine',92*ratio,gain);const drift=this.node(ctx.createGain());drift.gain.value=1.3+i*.4;this.osc('sine',.29+i*.17,drift);drift.connect(voice.frequency);return {voice,ratio};});
  this.air=this.node(ctx.createGain());this.air.gain.value=.12;this.air.connect(this.roar);
  const airNoise=this.node(ctx.createBufferSource());const airBuffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),airData=airBuffer.getChannelData(0);let smooth=0;
  for(let i=0;i<airData.length;i++){smooth=.82*smooth+.18*(Math.random()*2-1);airData[i]=smooth;}
  airNoise.buffer=airBuffer;airNoise.loop=true;airNoise.start();this.sources.push(airNoise);
  this.airFilter=this.node(ctx.createBiquadFilter());this.airFilter.type='bandpass';this.airFilter.frequency.value=1800;this.airFilter.Q.value=.55;airNoise.connect(this.airFilter);this.airFilter.connect(this.air);
  this.pulseDepth=this.node(ctx.createGain());this.pulseDepth.gain.value=0;this.pulse=this.osc('sine',2.3,this.pulseDepth);this.pulseDepth.connect(this.roar.gain);
  this.digital=this.node(ctx.createGain());this.digital.gain.value=0;this.digital.connect(this.master);this.digitalOsc=this.osc('triangle',180,this.digital);
  this.interior=this.node(ctx.createGain());this.interior.gain.value=0;this.interior.connect(this.master);
  [57,118,186,231].forEach((f,i)=>{const gain=this.node(ctx.createGain());gain.gain.value=[.7,.18,.09,.055][i];gain.connect(this.interior);this.osc('sine',f,gain);});
  this.target=this.node(ctx.createGain());this.target.gain.value=0;this.target.connect(this.master);
  [1260,1502,2099].forEach((f,i)=>{const gain=this.node(ctx.createGain());gain.gain.value=[.45,.3,.08][i];gain.connect(this.target);this.osc('sine',f,gain);});
  this.component=this.node(ctx.createGain());this.component.gain.value=0;this.component.connect(this.master);this.componentFilter=this.node(ctx.createBiquadFilter());this.componentFilter.type='lowpass';this.componentFilter.frequency.value=1600;this.componentFilter.connect(this.component);this.componentOsc=this.osc('triangle',100,this.componentFilter);
  this.targetPulse=this.node(ctx.createGain());this.targetPulse.gain.value=0;this.osc('sine',3.6,this.targetPulse);this.targetPulse.connect(this.target.gain);
 }
 node(n){this.nodes.push(n);return n;}
 osc(type,f,destination){const o=this.node(this.ctx.createOscillator());o.type=type;o.frequency.value=f;o.connect(destination);o.start();this.sources.push(o);return o;}
 smooth(p,v,time=.08){p.setTargetAtTime(v,this.ctx.currentTime,Math.max(.01,time));}
 configure(params={},kind='scifi'){this.params=params;this.kind=kind;this.smooth(this.master.gain,clip(params.masterGain??.65),.03);}
 start(){this.cancelShots();this.active=true;this.previousOverrun=false;if(this.params?.lifecycleSounds!==0)this.cue('startup');}
 update(d){
  const p=this.params??{},ion=this.active&&this.kind==='scifi';
  const rpm=clip(d.rpmNorm??d.speed??0),thr=clip(d.throttle??0),now=this.ctx.currentTime;
  const component=String(p.componentKind??''),compLevel=this.active&&component?clip(p.componentLevel??.5):0;this.smooth(this.component.gain,compLevel*(.1+thr*.4));this.componentOsc.type=component==='turbo'?'sine':component==='exhaust'?'sawtooth':'triangle';this.smooth(this.componentOsc.frequency,component==='turbo'?600+rpm*4600+thr*1100:Math.max(25,(d.rpm??800)/60*Number(p.componentCylinders??8)/2),.07);this.smooth(this.componentFilter.frequency,component==='exhaust'?300+thr*700:component==='turbo'?9000:1200+rpm*2600,.1);
  const intensity=ion&&p.tieSignature!==0?clip(p.roarLevel??.65):0;
  const mode=Math.round(clip(p.roarVariant??1,0,2)),pitch=clip(p.roarPitch??1,.5,1.8);
  const throat=clip(p.roarThroat??.6),rasp=clip(p.roarRasp??.3),flutter=clip(p.roarPulse??.4);
  const opened=clip((rpm-.02)/.75),power=.22+opened*.52+thr*.3;
  const release=clip(p.roarRelease??.65,.08,2),attack=clip(p.roarAttack??.22,.03,1);
  const envelope=d.overrun?power*.42:power;
  this.smooth(this.roar.gain,intensity*envelope,d.overrun?release:attack);
  this.smooth(this.pulseDepth.gain,intensity*envelope*flutter*.07);
  this.smooth(this.pulse.frequency,1.4+flutter*3+thr*1.5);
  const sweep=pitch*(.62+opened*.6+thr*.07)*(1+Math.sin(now*1.7)*.025*flutter);
  const explicit=[p.roarOne,p.roarTwo,p.roarThree].some(v=>v!==undefined);
  const levels=[p.roarOne,p.roarTwo,p.roarThree].map((v,i)=>explicit?clip(v??0):i===mode?1:0);
  const norm=Math.max(1,Math.sqrt(levels.reduce((a,v)=>a+v*v,0)));
  this.banks.forEach((bank,k)=>{this.smooth(bank.bus.gain,levels[k]/norm,.12);this.smooth(bank.carrier.frequency,[102,145,140][k]*sweep,attack);this.smooth(bank.mod.frequency,(71+k*17)*sweep,attack);this.smooth(bank.tone.gain,clip(p.screamTone??.8)*.32);bank.filters.forEach((f,i)=>{this.smooth(f.frequency,clip(bank.anchors[i]*sweep,40,6500),attack);this.smooth(f.Q,1.3+throat*5+i*.12);});});
  const core=76*pitch*(.72+opened*.8+thr*.1);
  this.voices.forEach(({voice,ratio})=>this.smooth(voice.frequency,core*ratio,attack));
  this.smooth(this.sub.frequency,clip(core*.52,28,130),.28);
  this.smooth(this.body.gain,.08+clip(p.roarDepth??.72)*.35,.18);
  this.smooth(this.air.gain,clip(p.roarAir??.12)*(.03+opened*.1),.2);
  this.smooth(this.digital.gain,ion?clip(p.digitalCueLevel??.16)*(.025+rpm*.1+thr*.08):0,.08);
  this.smooth(this.digitalOsc.frequency,180+rpm*1350+thr*120,.07);
  this.smooth(this.airFilter.frequency,900+opened*2100+rasp*650,.2);
  this.smooth(this.warmth.frequency,2300+opened*2200+rasp*900,.2);
  this.smooth(this.space.gain,clip(p.roarWidth??.45)*.4,.2);
  this.smooth(this.interior.gain,ion&&p.interiorNoise===1?clip(p.interiorLevel??.3)*.24:0,.3);
  const target=ion&&p.targetingNoise===1?clip(p.targetingLevel??.25)*.075:0;
  this.smooth(this.target.gain,target,.1);this.smooth(this.targetPulse.gain,target*.65,.1);
  if(ion&&d.overrun&&!this.previousOverrun&&p.gearingNoise!==0)this.cue('gearing');
  this.previousOverrun=!!d.overrun;
 }
/** skipShutdownCue: the engine voice plays its own key-off (Night Pursuit, Chrono V6). */
 stop(immediate=false,skipShutdownCue=false){const was=this.active;this.active=false;this.update({});if(immediate)for(const n of [this.roar,this.pulseDepth,this.interior,this.target,this.targetPulse,this.digital,this.component]){n.gain.cancelScheduledValues(this.ctx.currentTime);n.gain.setValueAtTime(0,this.ctx.currentTime);}this.cancelShots();if(was&&!immediate&&!skipShutdownCue&&this.params?.lifecycleSounds!==0)this.cue('shutdown');}
 cue(type){
  if(type==='ion-cannon'||type==='blaster'){this.cannon();return;}
  const p=this.params??{},ctx=this.ctx,now=ctx.currentTime;
  if(type==='blaster'&&(!this.active||this.kind!=='scifi'||now-this.lastCue<.18))return;
  if(type==='gearing'&&(!this.active||this.kind!=='scifi'||p.gearingNoise===0))return;
  if(type==='blaster')this.lastCue=now;
  const jump=type==='time-jump';
  // time-jump: exponential decay to 1.9 s, linear release to silence by 1.96 s, sources stop 1.99 s (≤ TIME_JUMP_CUE_SECONDS, no step).
  const duration=type==='lock'?.28:jump?TIME_JUMP_CUE_SECONDS-.1:type==='startup'?2.18:type==='shutdown'?1.65:type==='gearing'?1.15:.32;
  const gain=ctx.createGain(),osc=ctx.createOscillator(),noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),mix=ctx.createGain();
  const shot={sources:[osc,noise],nodes:[osc,noise,filter,mix,gain]};this.shots.add(shot);
  const level=type==='gearing'?clip(p.gearingLevel??.4)*.32:type==='blaster'?clip(p.blasterLevel??.55)*.45:clip(p.lifecycleLevel??.55)*.32;
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+(type==='startup'?.45:.025));gain.gain.exponentialRampToValueAtTime(.0001,now+duration);if(jump)gain.gain.linearRampToValueAtTime(0,now+duration+.06);else gain.gain.setValueAtTime(0,now+duration+.01);gain.connect(this.master);
  osc.type='sine';
  const base=this.kind==='scifi'?420:this.kind==='aerospace'?300:this.kind==='ice'?110:230;
  const from=type==='lock'?740:type==='time-jump'?90:type==='startup'?base*.22:type==='blaster'?1800:base;
  const to=type==='lock'?1110:type==='time-jump'?2400:type==='startup'?base:type==='blaster'?65:38;
  osc.frequency.setValueAtTime(from,now);osc.frequency.exponentialRampToValueAtTime(to,now+duration*.8);osc.connect(gain);
  noise.buffer=this.noise;noise.loop=true;filter.type='bandpass';filter.Q.value=type==='gearing'?2.8:1.2;
  filter.frequency.setValueAtTime(type==='startup'?120:850,now);filter.frequency.exponentialRampToValueAtTime(type==='startup'?900:75,now+duration);
  mix.gain.value=type==='blaster'?.15:.7;noise.connect(filter);filter.connect(mix);mix.connect(gain);
  let ended=0;const clean=()=>{if(++ended<2)return;for(const n of shot.nodes)try{n.disconnect();}catch{}this.shots.delete(shot);};osc.onended=clean;noise.onended=clean;
  const end=jump?now+TIME_JUMP_CUE_SECONDS-.01:now+duration+.03;osc.start(now);noise.start(now);osc.stop(end);noise.stop(end);
 }
 cannon(){
  const ctx=this.ctx,t=ctx.currentTime,p=this.params??{};if(!this.active||this.kind!=='scifi'||t-this.lastCue<.22)return;this.lastCue=t;
  const nodes=[],sources=[],bus=ctx.createGain(),shot={nodes,sources};nodes.push(bus);bus.connect(this.master);this.shots.add(shot);
  const level=clip(p.blasterLevel??.55)*.32,pitch=clip(p.ionCannonPitch??1,.5,1.5);let ended=0;
  const clean=()=>{if(++ended!==sources.length)return;nodes.forEach(n=>n.disconnect());this.shots.delete(shot);};
  // A paired, low-mid energy discharge with metallic FM and a filtered pressure tail.
  for(const offset of [0,.095]){const o=ctx.createOscillator(),mod=ctx.createOscillator(),fm=ctx.createGain(),g=ctx.createGain();nodes.push(o,mod,fm,g);sources.push(o,mod);o.type='sine';mod.type='sine';mod.frequency.setValueAtTime(88*pitch,t+offset);fm.gain.setValueAtTime(135,t+offset);fm.gain.exponentialRampToValueAtTime(8,t+offset+.45);mod.connect(fm);fm.connect(o.frequency);o.frequency.setValueAtTime(680*pitch,t+offset);o.frequency.exponentialRampToValueAtTime(430*pitch,t+offset+.035);o.frequency.exponentialRampToValueAtTime(290*pitch,t+offset+.55);g.gain.setValueAtTime(0,t+offset);g.gain.linearRampToValueAtTime(level,t+offset+.009);g.gain.exponentialRampToValueAtTime(.0001,t+offset+.65);o.connect(g);g.connect(bus);o.start(t+offset);mod.start(t+offset);o.stop(t+offset+.7);mod.stop(t+offset+.7);o.onended=clean;mod.onended=clean;}
  const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=this.noise;f.type='lowpass';f.frequency.setValueAtTime(1900,t);f.frequency.exponentialRampToValueAtTime(180,t+.65);g.gain.setValueAtTime(level*.7,t);g.gain.exponentialRampToValueAtTime(.0001,t+.8);n.connect(f);f.connect(g);g.connect(bus);nodes.push(n,f,g);sources.push(n);n.onended=clean;n.start(t);n.stop(t+.85);
 }
 cancelShots(){for(const shot of this.shots){for(const s of shot.sources)try{s.stop();}catch{}for(const n of shot.nodes)try{n.disconnect();}catch{}}this.shots.clear();}
 dispose(){this.active=false;this.cancelShots();for(const s of this.sources)try{s.stop();}catch{}for(const n of this.nodes)try{n.disconnect();}catch{}this.sources=[];this.nodes=[];}
}
