import type {useThemes} from './useThemes';
import {themeForId} from './catalog';
import {sceneForId} from '../forge/catalog';
export const instrumentDefaults={text:'#e9eef2',muted:'#a0acb9',panel:'#081016',warning:'#ff5353',destination:'#ef684a',present:'#7cdda2',departed:'#efbd64'};
export function ThemeColors({themes}:{themes:ReturnType<typeof useThemes>}){
 const theme=themeForId(themes.skinId),scene=sceneForId(themeForId(themes.atmosphereId).sceneId??'road-66');
 const gradientDefaults: Record<string,string>=(theme.id==='gradient'||theme.id==='gradient-macro')?{beam:'#9fdcff',beamDeep:'#3f8fe0'}:{};
 const controls=(id:string,defaults:Record<string,string>)=>Object.entries({...defaults,...themes.colors[id]}).map(([key,value])=><label key={key} className="theme-color-field"><span>{key.replace(/([A-Z])/g,' $1')}</span><input type="color" aria-label={`${id} ${key} color`} value={value} onInput={e=>themes.setColor(id,key,e.currentTarget.value)} onChange={e=>themes.setColor(id,key,e.target.value)}/><input key={value} aria-label={`${id} ${key} hex`} type="text" defaultValue={value} maxLength={7} spellCheck={false} onChange={e=>themes.setColor(id,key,e.target.value)}/></label>);
 return <section className="sound-character"><h3>Theme colors · {theme.name}</h3><div className="character-knobs">{controls(theme.id,{accent:theme.accent,secondary:theme.secondary,...instrumentDefaults,...gradientDefaults})}</div><button onClick={()=>themes.resetColors(theme.id)}>Reset instrument colors</button><h3>Atmosphere colors</h3><div className="character-knobs">{controls(themes.atmosphereId+'-scene',scene.palette)}</div><button onClick={()=>themes.resetColors(themes.atmosphereId+'-scene')}>Reset atmosphere colors</button><p>Colors are saved separately for each theme.</p></section>;
}
