import {useState} from 'react';import {validVehicle,type Vehicle} from './vehicles';
import { storageKey } from '../lib/storageKey';
export function useVehicleGarage(){
 const [vehicles,setVehicles]=useState<Vehicle[]>(()=>{try{const raw=JSON.parse(localStorage.getItem(storageKey('revforge.vehicles'))??'[]');return Array.isArray(raw)?raw.filter(validVehicle):[];}catch{return [];}});
 const [selected,setSelected]=useState(()=>{try{return localStorage.getItem(storageKey('revforge.activeVehicle'))??'';}catch{return '';}}),[error,setError]=useState('');
 const select=(id:string)=>{setSelected(id);try{localStorage.setItem(storageKey('revforge.activeVehicle'),id);}catch{setError('Vehicle selection could not be saved.');}};
 const replace=(next:Vehicle[])=>{setVehicles(next);try{localStorage.setItem(storageKey('revforge.vehicles'),JSON.stringify(next));setError('');}catch{setError('Vehicle profiles are available this session, but could not be saved.');}};
 const save=(v:Vehicle)=>{if(!validVehicle(v)){setError('Enter a valid vehicle and a top speed between 40 and 500 KPH.');return false;}replace([...vehicles.filter(x=>x.id!==v.id),v]);select(v.id);return true;};
 return {vehicles,selected,active:vehicles.find(v=>v.id===selected),error,select,save,replace,remove:(id:string)=>{replace(vehicles.filter(v=>v.id!==id));if(selected===id)select('');}};
}
