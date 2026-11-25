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

/** Operation targeting is a read-only projection of the current snapshot. */
export type FormationTargetScope = 'all'|'attention'|'withoutFront'|'manualHold'|'idle'|'selected';
export type FormationOperation = 'hold'|'resume'|'assignFront'|'unassignFront';

export function scopedFormationUnits(
  units: readonly UiUnit[], scope: FormationTargetScope, selectedIds: readonly number[] = [],
): UiUnit[] {
  const chosen = new Set(selectedIds);
  return units.filter(u => {
    if (scope === 'selected') return chosen.has(u.id);
    if (scope === 'withoutFront') return u.frontId < 0;
    if (scope === 'manualHold') return u.manualHold;
    if (scope === 'idle') return !u.manualHold && !u.moving && !u.inBattle && !u.encircled;
    if (scope === 'attention') return u.encircled || u.inBattle || u.supply < 0.5 ||
      u.manpower < u.maxManpower || u.infEquipment < u.maxInfEquipment ||
      u.artEquipment < u.maxArtEquipment;
    return true;
  }).sort((a,b) => a.id - b.id);
}

export function formationOperationPreview(
  units: readonly UiUnit[], operation: FormationOperation, targetFrontId?: number,
): {ids:number[]; unchanged:number; releasesManualHold:number} {
  const changed = units.filter(u => {
    if (operation === 'hold') return !u.manualHold;
    if (operation === 'resume') return u.manualHold;
    if (operation === 'unassignFront') return u.frontId >= 0;
    return targetFrontId !== undefined && (u.frontId !== targetFrontId || u.manualHold);
  }).sort((a,b) => a.id - b.id);
  return {
    ids: changed.map(u => u.id),
    unchanged: units.length - changed.length,
    // assignToFront explicitly clears manualHold. Warn before sending the command.
    releasesManualHold: operation === 'assignFront'
      ? changed.filter(u => u.manualHold).length : 0,
  };
}
