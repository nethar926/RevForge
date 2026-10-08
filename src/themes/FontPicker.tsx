import {HigListPicker} from '../ui/hig';
export const fontOptions:Record<string,string>={default:'Theme default',system:'System sans',mono:'Monospace',serif:'Serif',aurebesh:'FT Aurebesh',oswald:'Oswald'};
export const fontCss:Record<string,string>={system:'system-ui, sans-serif',mono:'ui-monospace, monospace',serif:'Georgia, serif',aurebesh:'"FT Aurebesh", monospace',oswald:'"Oswald", "Arial Narrow", sans-serif'};
export interface FontChoice {numbers:string;labels:string;}
const fontPick=Object.entries(fontOptions).map(([value,label])=>({value,label}));
export function FontPicker({value,onChange}:{value:FontChoice;onChange:(v:FontChoice)=>void}){return <div className="font-picker">{(['numbers','labels'] as const).map(k=><HigListPicker key={k} label={k==='numbers'?'Number font':'Label font'} value={value[k]} options={fontPick} onChange={v=>onChange({...value,[k]:v})}/>)}</div>;}
