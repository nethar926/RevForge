/** Routes the actual synth mix through a media element, with direct-output fallback.
 * Keep-alive: the car or browser can pause the element (e.g. the backup camera covering the page in
 * reverse). While routed, an unexpected pause retries play(); only after MAX_REJECTS consecutive
 * rejections do we fall back to direct output (and tell the host via onFallback). */
const MAX_REJECTS = 3;
const RETRY_MS = [0, 400, 1200];
export class MediaOutput {
 readonly element:HTMLAudioElement; readonly stream:MediaStreamAudioDestinationNode;
 private output:AudioNode|null=null; private routed=false; private rejects=0; private retryTimer:ReturnType<typeof setTimeout>|null=null;
 /** Called once when play() keeps getting rejected and we switch to direct output. */
 onFallback:(()=>void)|null=null;
 constructor(privateContext:AudioContext){
  this.stream=privateContext.createMediaStreamDestination();
  this.element=new Audio();this.element.setAttribute('playsinline','');this.element.srcObject=this.stream.stream;
  (this.element as Partial<HTMLAudioElement>).addEventListener?.('pause',this.onPause);
 }
 get isRouted(){return this.routed;}
 attach(output:AudioNode){if(this.output===output)return;this.output=output;if(this.routed){try{output.disconnect(output.context.destination);}catch{}output.connect(this.stream);}}
 async enable(){
  await this.element.play();
  this.rejects=0;
  if(this.output&&!this.routed){try{this.output.disconnect(this.output.context.destination);}catch{}this.output.connect(this.stream);}
  this.routed=true;
 }
 /** Re-start a paused element while routed (watchdog / page visible again). Safe to call often. */
 kick(){if(this.routed&&this.element.paused&&!this.retryTimer)this.retry();}
 private onPause=()=>{if(this.routed&&!this.retryTimer)this.retry();};
 private retry(){
  const delay=RETRY_MS[Math.min(this.rejects,RETRY_MS.length-1)];
  this.retryTimer=setTimeout(()=>{
   this.retryTimer=null;
   if(!this.routed||!this.element.paused)return;
   Promise.resolve().then(()=>this.element.play()).then(()=>{this.rejects=0;},()=>{
    this.rejects++;
    if(this.rejects>=MAX_REJECTS){this.disable();this.onFallback?.();}
    else this.retry();
   });
  },delay);
 }
 private clearRetry(){if(this.retryTimer){clearTimeout(this.retryTimer);this.retryTimer=null;}}
 disable(){this.clearRetry();if(this.output&&this.routed){try{this.output.disconnect(this.stream);}catch{}this.output.connect(this.output.context.destination);}this.routed=false;this.rejects=0;this.element.pause();}
 dispose(){this.clearRetry();this.routed=false;(this.element as Partial<HTMLAudioElement>).removeEventListener?.('pause',this.onPause);this.element.pause();this.element.srcObject=null;this.stream.stream.getTracks().forEach(t=>t.stop());this.stream.disconnect();this.output=null;}
}
