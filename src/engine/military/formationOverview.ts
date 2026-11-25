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
/**
 * UI-only preflight for an atomic front deployment. The engine remains the
 * authority for paths, ownership and revision checks at command application.
 */
export function canDeployFormation(
  snap: UiSnapshot, units: readonly UiUnit[], frontId: number | undefined,
): boolean {
  const country = snap.playerCountry;
  const front = snap.fronts.find(f => f.id === frontId && f.owner === country);
  if (!front || !front.provinces.some(p => snap.controller[p] === country)) return false;
  if (!units.length || units.length > 256) return false;
  const garrisonIds = new Set(snap.garrisons.flatMap(g => g.unitIds));
  return units.every(u => u.owner === country &&
    !garrisonIds.has(u.id) && !u.manualHold && !u.moving &&
    !u.inBattle && !u.encircled);
}

/**
 * Toggle the entire army within the currently focused formation.
 * Out-of-formation selection never leaks into a group command.
 * A null result means the selection is invalid or would exceed command limits.
 */
export function toggleFormationArmySelection(
  units: readonly UiUnit[], armyId: number, selectedIds: readonly number[], maxUnits = 256,
): number[] | null {
  const members = units.filter(u => u.armyId === armyId).map(u => u.id);
  if (!members.length) return null;
  const scoped = new Set(units.map(u => u.id));
  const next = new Set(selectedIds.filter(id => scoped.has(id)));
  const fullySelected = members.every(id => next.has(id));
  for (const id of members) {
    if (fullySelected) next.delete(id);
    else next.add(id);
  }
  return next.size <= maxUnits ? [...next].sort((a, b) => a - b) : null;
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
export type FormationTargetScope = 'all'|'attention'|'lowSupply'|'understrength'|'withoutFront'|'manualHold'|'idle'|'selected';
export type FormationOperation = 'hold'|'resume'|'assignFront'|'unassignFront';

export function scopedFormationUnits(
  units: readonly UiUnit[], scope: FormationTargetScope, selectedIds: readonly number[] = [],
): UiUnit[] {
  const chosen = new Set(selectedIds);
  return units.filter(u => {
    if (scope === 'selected') return chosen.has(u.id);
    if (scope === 'lowSupply') return u.supply < 0.5;
    if (scope === 'understrength') return u.manpower < u.maxManpower ||
      u.infEquipment < u.maxInfEquipment || u.artEquipment < u.maxArtEquipment;
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
