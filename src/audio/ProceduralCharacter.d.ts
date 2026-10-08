import type {DrivingInput,EngineParams,EngineKind} from './types';
export const TIME_JUMP_CUE_SECONDS:number;
export class ProceduralCharacter {
 constructor(context:AudioContext,destination:AudioNode);
 configure(params:Partial<EngineParams>,kind:EngineKind):void;
 start():void;update(input:DrivingInput):void;stop(immediate?:boolean):void;cue(type:string):void;dispose():void;
}
