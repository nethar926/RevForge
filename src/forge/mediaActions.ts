export type VehicleMediaAction = 'play'|'pause'|'stop'|'nexttrack'|'previoustrack';
/**
 * Car media button → Drive command. A car pause is a real PAUSE: 'mute' silences the engine output through the app's
 * transient mute (mediaPause.ts, in memory, never the saved masterMuted → output gain 0) and keeps the engine and the sim running (no stop(), no shutoff, the
 * <audio> element is never paused). 'play' unmutes ('unmute', or 'start' when the engine is off). Only a car 'stop',
 * the on-screen Shutdown, the shutdown guard or a pack shutdown end the sound. The opt-in "pause shifts" (manual
 * gearbox) and the Twin-Ion blasters keep their pause mapping.
 */
export type VehicleMediaCommand = 'start'|'stop'|'mute'|'unmute'|'up'|'down'|'blaster'|'none';
export function mediaCommand(action:VehicleMediaAction, running:boolean, manual:boolean, pauseShifts:boolean, blasters=false):VehicleMediaCommand {
 if(running&&blasters&&(action==='play'||action==='pause'))return 'blaster';
 if(action==='play') return running?'unmute':'start';
 if(!running) return 'none';
 if(action==='stop') return 'stop';
 if(action==='pause') return manual&&pauseShifts?'up':'mute';
 if(!manual) return 'none';
 return action==='nexttrack'?'up':'down';
}

export interface MediaCommandDeps {
 session:{playbackState:MediaSessionPlaybackState};
 /** (re)play the media element that carries the session */
 arm():void;
 fire?():void;
 start():void;
 stop():void;
 mute():void;
 unmute():void;
 shift(direction:number):void;
}
/** Runs a mediaCommand result (useVehicleMedia dispatch; pure so tests can drive pause → play). */
export function runMediaCommand(command:VehicleMediaCommand, d:MediaCommandDeps):void {
 if(command==='blaster'){d.fire?.();d.arm();d.session.playbackState='playing';}
 if(command==='start'){d.arm();d.unmute();d.start();d.session.playbackState='playing';}
 // car pause = real pause: mute through the app's mute (output gain), keep the engine + sim; never stop(), never the
 // shutoff, never pause the <audio> element (Dan's resume re-plays a paused element)
 if(command==='mute'){d.mute();d.session.playbackState='paused';}
 if(command==='unmute'){d.unmute();d.arm();d.session.playbackState='playing';}
 // car stop: the only media button that ends the sound (the Shutdown path)
 if(command==='stop')d.stop();
 if(command==='up'||command==='down'){d.shift(command==='up'?1:-1);d.arm();d.session.playbackState='playing';}
}
