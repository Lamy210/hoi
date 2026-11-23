import type { UiSnapshot } from '../../engine/ui';
import type { MapFrontOverlay } from './types';

export type FrontVisibility = 'all'|'selected'|'off';
export function frontView(snap:UiSnapshot,selectedIds:readonly number[],visibility:FrontVisibility):MapFrontOverlay[]{
  if(visibility==='off')return [];
  const selected=new Set(selectedIds);
  const selectedFronts=new Set(snap.units.filter(u=>u.owner===snap.playerCountry&&selected.has(u.id)).map(u=>u.frontId));
  const enemies=new Set(snap.countries[snap.playerCountry].atWar);
  return snap.fronts.filter(f=>f.owner===snap.playerCountry&&snap.countries[f.enemy]?.alive&&(visibility==='all'||selectedFronts.has(f.id))).map(f=>{
    const provinces=[...new Set(f.provinces)].filter(p=>snap.controller[p]===f.owner).sort((a,b)=>a-b);
    const targets=[...new Set(f.targets)].filter(p=>snap.controller[p]===f.enemy).sort((a,b)=>a-b);
    const links=f.borderLinks.filter(e=>provinces.includes(e.from)&&snap.controller[e.to]===f.enemy);
    const arrows=f.stance==='attack'&&!f.paused&&f.cap>0?links.filter(e=>targets.includes(e.to)):[];
    return {id:f.id,provinces,targets,links,arrows,stance:f.stance,paused:f.paused,highlighted:selectedFronts.has(f.id)};
  }).sort((a,b)=>Number(a.highlighted)-Number(b.highlighted)||a.id-b.id);
}
