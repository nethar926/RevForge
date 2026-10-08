import {useLayoutEffect,useState,type RefObject} from 'react';

/**
 * Drive-window layout mode (Tesla in Drive shrinks the browser from ~16:10 to ~5:4).
 * Measured: parked 1280×800 / 1255×784 → aspect 1.60; driving 773×601 → 1.29 and
 * 760×560 → 1.36. 1.45 sits between the two clusters (≈ their geometric mean), and
 * any height ≤ 640 CSS px (1024×600 class screens) is too short for the parked layout.
 */
export const DRIVE_WINDOW_MAX_ASPECT=1.45;
export const DRIVE_WINDOW_MAX_HEIGHT=640;
export const isDriveWindow=(w:number,h:number)=>w>0&&h>0&&(w/h<DRIVE_WINDOW_MAX_ASPECT||h<=DRIVE_WINDOW_MAX_HEIGHT);

export interface Rect {x:number;y:number;w:number;h:number}
/** Gap kept between the cluster and the top bar / dock / throttle card / screen edge. */
export const DRIVE_WINDOW_GAP=8;
/** Clusters may grow a little to use the window, never beyond this. */
export const DRIVE_WINDOW_MAX_UPSCALE=1.4;

const hit=(a:Rect,b:Rect)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

/** Candidate free rects between the top bar and the dock that avoid every obstacle (throttle card). */
export function freeRects(vw:number,top:number,dockTop:number,obstacles:Rect[],gap=DRIVE_WINDOW_GAP):Rect[] {
 const base={x:gap,y:top+gap,w:vw-2*gap,h:dockTop-top-2*gap};
 let rects:Rect[]=[base];
 for(const o of obstacles){
  const next:Rect[]=[];
  for(const r of rects){
   if(!hit(r,o)){next.push(r);continue;}
   next.push({...r,h:o.y-gap-r.y});                                  // above
   next.push({...r,y:o.y+o.h+gap,h:r.y+r.h-(o.y+o.h+gap)});          // below
   next.push({...r,w:o.x-gap-r.x});                                  // left
   next.push({...r,x:o.x+o.w+gap,w:r.x+r.w-(o.x+o.w+gap)});          // right
  }
  rects=next.filter(r=>r.w>40&&r.h>40);
 }
 return rects.length?rects:[base];
}

/** Largest uniform scale of an nw×nh box over the candidate rects (keeps the cluster's aspect). */
export function bestFit(nw:number,nh:number,rects:Rect[],maxScale=DRIVE_WINDOW_MAX_UPSCALE):{s:number;rect:Rect} {
 let best={s:0,rect:rects[0]};
 for(const r of rects){const s=Math.min(maxScale,r.w/nw,r.h/nh);if(s>best.s+1e-3)best={s,rect:r};}
 return best;
}

const VARS=['--fit-scale','--dw-s','--dw-cx','--dw-cy','--dw-left','--dw-bottom','--dw-w','--dw-pt','--dw-pr','--dw-pb','--dw-pl'];
const shown=(e:Element|null):e is HTMLElement=>!!e&&(e as HTMLElement).offsetParent!==null;

/**
 * Detects drive-window mode for the Drive page stage and fits the cluster into the
 * free area between the top bar and the dock (reserving the throttle card).
 * Writes CSS vars on .skin-body only; outside drive-window mode nothing is written,
 * so the parked layout is untouched. ResizeObserver/MutationObserver only — no per-frame work.
 */
export function useDriveWindow(stageRef:RefObject<HTMLDivElement|null>,key:string):boolean {
 const [on,setOn]=useState(false);
 useLayoutEffect(()=>{
  const stage=stageRef.current;
  const viewport=stage?.closest<HTMLElement>('.rev-viewport');
  if(!stage||!viewport||!stage.closest('.rev-scene')){setOn(false);return;}
  const body=()=>stage.querySelector<HTMLElement>(':scope > .skin-body');
  const clear=()=>{const b=body();if(b)for(const v of VARS)b.style.removeProperty(v);};
  const measure=()=>{
   const sr=stage.getBoundingClientRect();
   const active=isDriveWindow(sr.width,sr.height);
   setOn(active);
   const b=body();
   if(!b)return;
   if(!active||!on){clear();return;}
   const kids=(sel:string)=>[...viewport.querySelectorAll(sel)].filter(shown).map(e=>e.getBoundingClientRect());
   const topR=kids('.rev-topbar > *'), dockR=kids('.rev-dock > *');
   const top=topR.length?Math.max(...topR.map(r=>r.bottom))-sr.top:0;
   const dockTop=dockR.length?Math.min(...dockR.map(r=>r.top))-sr.top:sr.height;
   const obstacles=kids('.rev-throttle').map(r=>({x:r.left-sr.left,y:r.top-sr.top,w:r.width,h:r.height}));
   const rects=freeRects(sr.width,top,dockTop,obstacles);
   const set=(k:string,v:string)=>{if(b.style.getPropertyValue(k)!==v)b.style.setProperty(k,v);};
   // Scale writes use a dead-band: the text floor below depends on the scale, so tiny re-fits must not ping-pong.
   const setScale=(fit:number,total:number)=>{const cur=parseFloat(b.style.getPropertyValue('--fit-scale'));if(Number.isFinite(cur)&&Math.abs(cur-fit)<.004)return;set('--fit-scale',String(+fit.toFixed(4)));set('--dw-s',String(+total.toFixed(4)));};
   if(stage.classList.contains('is-fullscreen')){
    // Full Screen skins/packs fit themselves inside the body's content box: hand them the best free rect.
    // Pack mounts advertise data-fit-box="designW,minH,maxH" (height elastic within the range):
    // pick the free rect with the largest uniform scale; otherwise the largest-area rect.
    const spec=b.querySelector<HTMLElement>(':scope > [data-fit-box]')?.dataset.fitBox?.split(',').map(Number);
    const area=(r:Rect)=>r.w*r.h;
    const rect=spec&&spec.length===3&&spec.every(n=>n>0)
     ?rects.reduce((a,c)=>{const sc=(r:Rect)=>Math.min(r.w/spec[0],r.h/Math.max(spec[1],Math.min(spec[2],spec[0]*r.h/r.w)));const d=sc(c)-sc(a);return d>1e-3||(Math.abs(d)<=1e-3&&area(c)>area(a))?c:a;},rects[0])
     :rects.reduce((a,c)=>area(c)>area(a)?c:a,rects[0]);
    set('--dw-pt',`${rect.y}px`);set('--dw-pl',`${rect.x}px`);
    set('--dw-pr',`${sr.width-rect.x-rect.w}px`);set('--dw-pb',`${sr.height-rect.y-rect.h}px`);
    return;
   }
   const hud=parseFloat(getComputedStyle(b).getPropertyValue('--hud-scale'))||1;
   const nw=b.offsetWidth,nh=b.offsetHeight;
   if(!nw||!nh)return;
   if(stage.classList.contains('layout-road')){
    // RoadView keeps its bottom-left anchor (the scene stays visible); sit above the throttle card.
    const r=rects.reduce((a,c)=>c.w>a.w?c:a,rects[0]);
    const s=Math.min(1,r.h/nh)*Math.min(1,hud);
    set('--dw-left',`${r.x}px`);set('--dw-bottom',`${sr.height-r.y-r.h}px`);set('--dw-w',`${r.w}px`);
    setScale(s/hud,s);
    return;
   }
   const {s,rect}=bestFit(nw,nh,rects);
   set('--dw-cx',`${rect.x+rect.w/2}px`);set('--dw-cy',`${rect.y+rect.h/2}px`);
   // Dashboard-scale pref can shrink the fitted cluster but never push it past the free area.
   setScale(s*Math.min(1,hud)/hud,s*Math.min(1,hud));
  };
  let raf=0;
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;measure();});};
  measure();
  const ro=new ResizeObserver(schedule);
  const watch=()=>{ro.disconnect();ro.observe(stage);const b=body();if(b){ro.observe(b);for(const k of b.children)ro.observe(k);}for(const e of viewport.querySelectorAll('.rev-topbar, .rev-dock, .rev-throttle'))ro.observe(e);};
  watch();
  const mo=new MutationObserver(()=>{watch();schedule();});
  mo.observe(viewport,{childList:true});
  const b=body();if(b)mo.observe(b,{childList:true});
  window.addEventListener('resize',schedule);
  return ()=>{cancelAnimationFrame(raf);ro.disconnect();mo.disconnect();window.removeEventListener('resize',schedule);clear();};
 },[stageRef,key,on]);
 return on;
}
