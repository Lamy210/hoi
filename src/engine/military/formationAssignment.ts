// Pure, snapshot-only previews for division / army group transfers.
// Validation mirrors existing commands and does not alter simulation state.
import type {UiUnit} from '../ui';
import type {Army,ArmyGroup} from './armies';
import {MAX_ARMY_UNITS,MAX_GROUP_ARMIES} from './armies';

export interface AssignmentPreview{
  reason:'empty'|'badSelection'|'notOwned'|'noTarget'|'limitExceeded'|'unchanged'|null;
  selected:number;
  current:number;
  projected:number;
  moved:number;
  capacity:number;
}

const distinct=(ids:readonly number[],max:number)=>
  ids.length>0&&ids.length<=max&&
  ids.every(id=>Number.isSafeInteger(id)&&id>0)&&new Set(ids).size===ids.length;

export function previewDivisionAssignment(
  units:readonly Pick<UiUnit,'id'|'owner'|'armyId'>[],armies:readonly Army[],
  owner:number,selectedIds:readonly number[],targetArmyId:number|null
):AssignmentPreview{
  const capacity=MAX_ARMY_UNITS;
  const chosen=units.filter(u=>u.owner===owner&&selectedIds.includes(u.id));
  const current=targetArmyId===null?0:units.filter(u=>u.owner===owner&&u.armyId===targetArmyId).length;
  const base={selected:selectedIds.length,current,projected:current,moved:0,capacity};
  if(!selectedIds.length)return {...base,reason:'empty'};
  if(!distinct(selectedIds,256)||chosen.length!==selectedIds.length)return {...base,reason:'badSelection'};
  if(targetArmyId!==null&&!armies.some(a=>a.id===targetArmyId&&a.owner===owner))
    return {...base,reason:'noTarget'};
  const moved=chosen.filter(u=>u.armyId!==targetArmyId).length;
  const projected=targetArmyId===null?0:current+chosen.filter(u=>u.armyId!==targetArmyId).length;
  return {...base,projected,moved,reason:projected>capacity?'limitExceeded':!moved?'unchanged':null};
}

export function previewArmyGroupAssignment(
  armies:readonly Army[],groups:readonly ArmyGroup[],
  owner:number,selectedIds:readonly number[],targetGroupId:number|null
):AssignmentPreview{
  const capacity=MAX_GROUP_ARMIES;
  const chosen=armies.filter(a=>a.owner===owner&&selectedIds.includes(a.id));
  const current=targetGroupId===null?0:armies.filter(a=>a.owner===owner&&a.groupId===targetGroupId).length;
  const base={selected:selectedIds.length,current,projected:current,moved:0,capacity};
  if(!selectedIds.length)return {...base,reason:'empty'};
  if(!distinct(selectedIds,256)||chosen.length!==selectedIds.length)return {...base,reason:'badSelection'};
  if(targetGroupId!==null&&!groups.some(g=>g.id===targetGroupId&&g.owner===owner))
    return {...base,reason:'noTarget'};
  const moved=chosen.filter(a=>a.groupId!==targetGroupId).length;
  const projected=targetGroupId===null?0:current+moved;
  return {...base,projected,moved,reason:projected>capacity?'limitExceeded':!moved?'unchanged':null};
}
