import test from 'node:test';import assert from 'node:assert/strict';import {MediaOutput} from '../src/audio/MediaOutput.ts';
test('media routing avoids duplicate output and restores direct sound when disabled',async()=>{
 const original=(globalThis as any).Audio;let plays=0,pauses=0,stops=0;
 (globalThis as any).Audio=class {srcObject:any;setAttribute(){} async play(){plays++;}pause(){pauses++;}};
 try{const destination={},stream={stream:{getTracks:()=>[{stop:()=>stops++}]},disconnect(){}};const ctx={destination,createMediaStreamDestination:()=>stream};const connections=new Set<any>([destination]);const node={context:ctx,connect:(n:any)=>connections.add(n),disconnect:(n:any)=>{if(!connections.delete(n))throw Error('not connected');}};
 const route=new MediaOutput(ctx as any);route.attach(node as any);await route.enable();await route.enable();assert.deepEqual([...connections],[stream]);route.disable();assert.deepEqual([...connections],[destination]);route.dispose();assert.equal(stops,1);assert.equal(plays,2);assert.ok(pauses>=1);
 }finally{(globalThis as any).Audio=original;}
});
test('media keep-alive re-plays after an outside pause and falls back to direct only after repeated rejections',async()=>{
 const original=(globalThis as any).Audio;let plays=0;let reject=false;let el:any;
 (globalThis as any).Audio=class {srcObject:any;paused=true;l:any={};constructor(){el=this;}setAttribute(){}addEventListener(t:string,f:any){this.l[t]=f;}removeEventListener(t:string){delete this.l[t];}async play(){plays++;if(reject)throw Error('NotAllowed');this.paused=false;}pause(){this.paused=true;this.l.pause?.();}};
 const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 try{const destination={},stream={stream:{getTracks:()=>[]},disconnect(){}};const ctx={destination,createMediaStreamDestination:()=>stream};const connections=new Set<any>([destination]);const node={context:ctx,connect:(n:any)=>connections.add(n),disconnect:(n:any)=>{if(!connections.delete(n))throw Error('not connected');}};
 const route=new MediaOutput(ctx as any);route.attach(node as any);await route.enable();assert.equal(plays,1);
 // outside pause (backup camera): re-plays, stays on the media route
 el.paused=true;el.l.pause();await wait(20);assert.equal(plays,2);assert.equal(el.paused,false);assert.deepEqual([...connections],[stream]);
 // play keeps getting rejected: 3 tries, then direct output + onFallback
 let fell=0;route.onFallback=()=>fell++;reject=true;el.paused=true;el.l.pause();await wait(1800);
 assert.equal(fell,1);assert.equal(route.isRouted,false);assert.deepEqual([...connections],[destination]);
 // a deliberate disable() does not retry
 const before=plays;route.kick();await wait(20);assert.equal(plays,before);route.dispose();
 }finally{(globalThis as any).Audio=original;}
});
test('media keep-alive never replays after Stop/Shutdown (wantsPlay false)',async()=>{
 const original=(globalThis as any).Audio;let plays=0;let el:any;
 (globalThis as any).Audio=class {srcObject:any;paused=true;l:any={};constructor(){el=this;}setAttribute(){}addEventListener(t:string,f:any){this.l[t]=f;}removeEventListener(t:string){delete this.l[t];}async play(){plays++;this.paused=false;}pause(){this.paused=true;this.l.pause?.();}};
 const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 try{const destination={},stream={stream:{getTracks:()=>[]},disconnect(){}};const ctx={destination,createMediaStreamDestination:()=>stream};const node={context:ctx,connect(){},disconnect(){}};
 const route=new MediaOutput(ctx as any);let wants=true;route.wantsPlay=()=>wants;route.attach(node as any);await route.enable();assert.equal(plays,1);
 wants=false;el.paused=true;el.l.pause();await wait(20);route.kick();await wait(20);assert.equal(plays,1);assert.equal(el.paused,true);
 wants=true;route.kick();await wait(20);assert.equal(plays,2);route.dispose();
 }finally{(globalThis as any).Audio=original;}
});
