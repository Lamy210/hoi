// Read-only operational view of an army or army group. The canonical hierarchy
// remains Unit.armyId -> Army.groupId; no redundant membership is persisted.
import type {UiSnapshot,UiUnit} from '../ui';
import {summarizeDivisions} from './armySummary';

export type FormationScope={kind:'army'|'group';id:number};
export function formationUnits(snap:UiSnapshot,scope:FormationScope):UiUnit[] {
  const country=snap.playerCountry;
  const armyIds=scope.kind==='group'
    ? new Set(snap.armies.filter(a=>a.owner===country&&a.groupId===scope.id&&
      snap.armyGroups.some(g=>g.owner===country&&g.id===scope.id)).map(a=>a.id))
    : new Set(snap.armies.filter(a=>a.owner===country&&a.id===scope.id).map(a=>a.id));
  return snap.units.filter(u=>u.owner===country&&u.armyId!==null&&armyIds.has(u.armyId))
    .sort((a,b)=>a.id-b.id);
}
export function formationOperationalSummary(units:readonly UiUnit[]){
  const resources=summarizeDivisions(units);
  let moving=0,combat=0,encircled=0,manualHold=0,frontAssigned=0,needsAttention=0;
  for(const u of units){
    if(u.moving)moving++;
    if(u.inBattle)combat++;
    if(u.encircled)encircled++;
    if(u.manualHold)manualHold++;
    if(u.frontId>=0)frontAssigned++;
    if(u.encircled||u.inBattle||u.supply<0.5||u.manpower<u.maxManpower||
      u.infEquipment<u.maxInfEquipment||u.artEquipment<u.maxArtEquipment)needsAttention++;
  }
  return {...resources,moving,combat,encircled,manualHold,frontAssigned,needsAttention};
}
