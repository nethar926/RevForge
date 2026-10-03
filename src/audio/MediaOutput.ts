/** Routes the actual synth mix through a media element, with direct-output fallback. */
export class MediaOutput {
 readonly element:HTMLAudioElement; readonly stream:MediaStreamAudioDestinationNode;
 private output:AudioNode|null=null; private routed=false;
 constructor(privateContext:AudioContext){
  this.stream=privateContext.createMediaStreamDestination();
  this.element=new Audio();this.element.setAttribute('playsinline','');this.element.srcObject=this.stream.stream;
 }
 /** True while the mix is routed through the media element (Background audio active). */
 get active():boolean{return this.routed;}
 attach(output:AudioNode){if(this.output===output)return;this.output=output;if(this.routed){try{output.disconnect(output.context.destination);}catch{}output.connect(this.stream);}}
 async enable(){
  await this.element.play();
  if(this.output&&!this.routed){try{this.output.disconnect(this.output.context.destination);}catch{}this.output.connect(this.stream);}
  this.routed=true;
 }
 disable(){if(this.output&&this.routed){try{this.output.disconnect(this.stream);}catch{}this.output.connect(this.output.context.destination);}this.routed=false;this.element.pause();}
 dispose(){this.element.pause();this.element.srcObject=null;this.stream.stream.getTracks().forEach(t=>t.stop());this.stream.disconnect();this.output=null;}
}
