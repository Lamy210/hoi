// Atomic planning of multi-army, multi-front organizational assignments.
// No path changes, no manual-hold releases, no redundant group/front persistence.
import type {WorldState} from '../core/state';
import {MAX_GROUP_ARMIES} from './armies';

export interface GroupFrontAssignment {
  armyId:number;
  frontId:number;
  expectedRevision:number;
  unitIds:number[];
}

export interface GroupFrontAssignmentPlan {
  reason:string|null;
  orders:{unitId:number;frontId:number}[];
}

const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;

/**
 * Validate every army and every division before returning an immutable command plan.
 * The input contains the full expected membership of each army, so a stale UI
 * snapshot cannot silently move newly assigned divisions to another front.
 */
export function planGroupFrontAssignments(
  w:WorldState,country:number,groupId:unknown,raw:unknown,
):GroupFrontAssignmentPlan {
  const fail=(reason:string):GroupFrontAssignmentPlan=>({reason,orders:[]});
  if(!w.countries.alive[country])return fail('countryDead');
  if(!positive(groupId))return fail('badParams');
  const group=w.armyGroups.find(g=>g.id===groupId&&g.owner===country);
  if(!group)return fail('notYourArmy');
  if(!Array.isArray(raw)||raw.length<2||raw.length>MAX_GROUP_ARMIES)return fail('badParams');
  const seenArmies=new Set<number>(),seenUnits=new Set<number>();
  const orders:GroupFrontAssignmentPlan['orders']=[];
  for(const entry of raw as unknown[]){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return fail('badParams');
    const value=entry as Partial<GroupFrontAssignment>;
    if(!positive(value.armyId)||!positive(value.frontId)||!positive(value.expectedRevision)||
      !Array.isArray(value.unitIds)||!value.unitIds.length||value.unitIds.length>256||
      value.unitIds.some(id=>!positive(id))||new Set(value.unitIds).size!==value.unitIds.length||
      seenArmies.has(value.armyId))return fail('badParams');
    seenArmies.add(value.armyId);
    const army=w.armies.find(a=>a.id===value.armyId&&a.owner===country&&a.groupId===groupId);
    if(!army)return fail('notYourArmy');
    const front=w.fronts.find(f=>f.id===value.frontId);
    if(!front)return fail('noFront');
    if(front.owner!==country)return fail('notYourFront');
    if(!w.countries.alive[front.enemy])return fail('badTarget');
    if(value.expectedRevision!==(front.revision??1))return fail('staleFrontOrder');
    const actual=w.units.filter(u=>!u.destroyed&&u.owner===country&&u.armyId===army.id)
      .map(u=>u.id).sort((a,b)=>a-b);
    const expected=[...value.unitIds].sort((a,b)=>a-b);
    if(actual.length!==expected.length||actual.some((id,i)=>id!==expected[i]))
      return fail('staleFormation');
    for(const id of actual){
      if(seenUnits.has(id))return fail('badParams');
      seenUnits.add(id);
      const unit=w.units.find(u=>u.id===id)!;
      if(w.garrisons.some(g=>g.unitIds.includes(id)))return fail('unitAlreadyAssigned');
      if(unit.path.length||unit.encircled||w.runtime.activeBattles.has(unit.loc))
        return fail('unitBusy');
      orders.push({unitId:id,frontId:front.id});
    }
  }
  if(orders.length>256)return fail('limitExceeded');
  return {reason:null,orders:orders.sort((a,b)=>a.unitId-b.unitId)};
}
