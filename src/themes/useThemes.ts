import {sanitizeCluster,defaultCluster,type ClusterWidget} from './clusterModel';
import type {FontChoice} from './FontPicker';
import { useCallback, useState } from 'react';
import type { EnginePatch } from '../audio';
import { DEFAULT_THEME, themeForId } from './catalog';
import { storageKey } from '../lib/storageKey';
export interface Combination { id: string; name: string; skinId: string; atmosphereId?:string; sound: EnginePatch; widgets?:ClusterWidget[];fonts?:Record<string,FontChoice>;colors?:Record<string,Record<string,string>>; }
const THEME_KEY = 'drivesynth.theme.v2';
const PAIRS_KEY = 'drivesynth.combinations.v1';
export function useThemes() {
  const [widgets,setWidgets]=useState<ClusterWidget[]>(()=>{try{return sanitizeCluster(JSON.parse(localStorage.getItem(storageKey("revforge.cluster"))??"null"));}catch{return defaultCluster;}});
  const saveWidgets=(next:ClusterWidget[])=>{setWidgets(next);try{localStorage.setItem(storageKey("revforge.cluster"),JSON.stringify(next));}catch{setStorageError("Cluster could not be saved.");}};
  const [fonts,setFonts]=useState<Record<string,FontChoice>>(()=>{try{return JSON.parse(localStorage.getItem(storageKey("revforge.fonts"))??"{}");}catch{return {};}});
  const setFont=(id:string,value:FontChoice)=>{const next={...fonts,[id]:value};setFonts(next);try{localStorage.setItem(storageKey("revforge.fonts"),JSON.stringify(next));}catch{setStorageError("Fonts could not be saved.");}};
  const [colors,setColors]=useState<Record<string,Record<string,string>>>(()=>{try{return JSON.parse(localStorage.getItem(storageKey('revforge.colors'))??'{}');}catch{return {};}});
  const saveColors=(next:Record<string,Record<string,string>>)=>{setColors(next);try{localStorage.setItem(storageKey('revforge.colors'),JSON.stringify(next));}catch{setStorageError('Color settings could not be saved.');}};
  const setColor=(id:string,key:string,value:string)=>{if(/^#[0-9a-f]{6}$/i.test(value))saveColors({...colors,[id]:{...colors[id],[key]:value}});};
  const resetColors=(id:string)=>{const next={...colors};delete next[id];saveColors(next);};

  const [skinId,setSkin] = useState(()=>{try{const next=themeForId(localStorage.getItem(storageKey(THEME_KEY)) ?? DEFAULT_THEME).id;try{localStorage.setItem(storageKey(THEME_KEY),next);}catch{/* session */}return next;}catch{return DEFAULT_THEME;}});
  const [atmosphereId,setAtmosphere]=useState(()=>{try{const next=themeForId(localStorage.getItem(storageKey("revforge.atmosphere"))??DEFAULT_THEME).id;try{localStorage.setItem(storageKey("revforge.atmosphere"),next);}catch{/* session */}return next;}catch{return DEFAULT_THEME;}});
  const selectAtmosphere=useCallback((id:string)=>{const t=themeForId(id);if(t.family!=="RoadView")return;setAtmosphere(t.id);try{localStorage.setItem(storageKey("revforge.atmosphere"),t.id);}catch{/* session only */}},[]);
  const [combinations,setCombinations] = useState<Combination[]>(()=>{try {const data=JSON.parse(localStorage.getItem(storageKey(PAIRS_KEY))??'[]');return Array.isArray(data)?data.filter(x=>x && typeof x.id==='string' && typeof x.name==='string' && x.sound?.params && typeof x.skinId==='string'):[];}catch{return [];}});
  const [storageError,setStorageError]=useState('');
  const selectSkin = useCallback((id:string)=>{const next=themeForId(id).id;setSkin(next);try{localStorage.setItem(storageKey(THEME_KEY),next);setStorageError('');}catch{setStorageError('This browser could not save your theme.');}},[]);
  const saveCombination = (name:string,sound:EnginePatch) => {
    const id=crypto.randomUUID();
    const next=[...combinations,{id,name:name.trim()||`${themeForId(skinId).name} + ${sound.name}`,skinId,atmosphereId,widgets:structuredClone(widgets),fonts:structuredClone(fonts),colors:structuredClone(colors),sound:{...structuredClone(sound),id:`user-combination-${id}`}}];
    setCombinations(next);try{localStorage.setItem(storageKey(PAIRS_KEY),JSON.stringify(next));setStorageError('');}catch{setStorageError('Combination is available this session, but storage is full or blocked.');}
  };
  const removeCombination=(id:string)=>{const next=combinations.filter(c=>c.id!==id);setCombinations(next);try{localStorage.setItem(storageKey(PAIRS_KEY),JSON.stringify(next));setStorageError('');}catch{setStorageError('Could not save this deletion.');}};
  const loadAppearance=(c:Combination)=>{selectSkin(c.skinId);if(c.atmosphereId)selectAtmosphere(c.atmosphereId);if(c.widgets)saveWidgets(sanitizeCluster(c.widgets));if(c.colors)saveColors(c.colors);if(c.fonts){setFonts(c.fonts);try{localStorage.setItem(storageKey("revforge.fonts"),JSON.stringify(c.fonts));}catch{setStorageError("Fonts could not be saved.");}}};
  const importCombinations=(items:unknown[])=>{const valid=items.filter((x):x is Combination=>!!x&&typeof x==='object'&&typeof (x as Combination).id==='string'&&typeof (x as Combination).name==='string'&&typeof (x as Combination).skinId==='string'&&!!(x as Combination).sound?.params);const next=[...new Map([...combinations,...valid].map(c=>[c.id,c])).values()];setCombinations(next);try{localStorage.setItem(storageKey(PAIRS_KEY),JSON.stringify(next));}catch{setStorageError("Configurations could not be saved.");}};
  return {loadAppearance,importCombinations,widgets,saveWidgets,fonts,setFont,colors,setColor,resetColors,skinId,selectSkin,atmosphereId,selectAtmosphere,combinations,saveCombination,removeCombination,storageError};
}
