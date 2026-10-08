/** Routes the actual synth mix through a media element, with direct-output fallback. */
export class MediaOutput {
 readonly element:HTMLAudioElement; readonly stream:MediaStreamAudioDestinationNode;
 private output:AudioNode|null=null; private isRouted=false;
 constructor(privateContext:AudioContext){
  this.stream=privateContext.createMediaStreamDestination();
  this.element=new Audio();this.element.setAttribute('playsinline','');this.element.srcObject=this.stream.stream;
 }
 /** True while the mix is routed through the media element (Background audio active). */
 get active():boolean{return this.isRouted;}
 /** True once enable() succeeded, until disable(). */
 get routed():boolean{return this.isRouted;}
 /** The element only while the mix is routed through it AND it is playing; otherwise null
  *  (Frontend's media-session hook pauses its placeholder whenever an element is returned). */
 playingElement():HTMLAudioElement|null{return this.isRouted&&!this.element.paused?this.element:null;}
 attach(output:AudioNode){if(this.output===output)return;this.output=output;if(this.isRouted){try{output.disconnect(output.context.destination);}catch{}output.connect(this.stream);}}
 async enable(){
  await this.element.play();
  if(this.output&&!this.isRouted){try{this.output.disconnect(this.output.context.destination);}catch{}this.output.connect(this.stream);}
  this.isRouted=true;
 }
 disable(){if(this.output&&this.isRouted){try{this.output.disconnect(this.stream);}catch{}this.output.connect(this.output.context.destination);}this.isRouted=false;this.element.pause();}
 dispose(){this.element.pause();this.element.srcObject=null;this.stream.stream.getTracks().forEach(t=>t.stop());this.stream.disconnect();this.output=null;}
}
