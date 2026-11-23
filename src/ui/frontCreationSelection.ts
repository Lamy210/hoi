import type {UiSnapshot,UiUnit} from '../engine/ui';

/** Preview-only selection: never steal a division from an existing front implicitly. */
export type FrontCreationSource = 'none'|'selected'|'unassigned'|`army:${number}`|`group:${number}`;

export function frontCreationCandidates(
  snap:Pick<UiSnapshot,'units'|'armies'|'armyGroups'|'playerCountry'>,
  source:string,selectedIds:readonly number[],
):{ids:number[];alreadyAssigned:number;manualHold:number}{
  const c=snap.playerCountry;
  const selected=new Set(selectedIds);
  const armyId=source.startsWith('army:')?Number(source.slice(5)):NaN;
  const groupId=source.startsWith('group:')?Number(source.slice(6)):NaN;
  const validArmies=new Set(snap.armies.filter(a=>a.owner===c&&a.id===armyId).map(a=>a.id));
  const validGroups=new Set(snap.armyGroups.filter(g=>g.owner===c&&g.id===groupId).map(g=>g.id));
  const groupArmies=new Set(snap.armies.filter(a=>a.owner===c&&a.groupId!==null&&validGroups.has(a.groupId)).map(a=>a.id));
  const applicable:UiUnit[]=snap.units.filter(u=>u.owner===c&&(
    source==='selected'?selected.has(u.id):
    source==='unassigned'?u.armyId===null:
    source.startsWith('army:')?u.armyId!==null&&validArmies.has(u.armyId):
    source.startsWith('group:')?u.armyId!==null&&groupArmies.has(u.armyId):false
  ));
  const eligible=applicable.filter(u=>u.frontId<0);
  return {ids:[...new Set(eligible.map(u=>u.id))].sort((a,b)=>a-b),
    alreadyAssigned:applicable.length-eligible.length,manualHold:eligible.filter(u=>u.manualHold).length};
}
