/** Read-only battle frontage projection for the actual WorldState/UI.
 * Both the daily battle resolver and this projection use selectCombatFront().
 * Display this as the current-state *forecast*, not a log of past combat.
 */
import {atWar,type Unit,type WorldState} from '../core/state';
import {selectCombatFront,unitCombatWidth} from './unitComposition';
import {TERRAIN_DATA} from '../systems/combat';

export interface CombatFrontSideProjection {
  readonly totalUnits:number;
  readonly engagedIds:readonly number[];
  readonly reserveIds:readonly number[];
  readonly selectedWidth:number;
  readonly effectiveWidth:number;
  readonly widthPenalties:readonly {unitId:number;factor:number}[];
}
export interface CombatFrontProjection {
  readonly province:number;
  readonly capacity:number;
  readonly attackers:CombatFrontSideProjection;
  readonly defenders:CombatFrontSideProjection;
}
interface Candidates { attackers:Unit[]; defenders:Unit[]; }

export function provinceCombatCapacity(w:Pick<WorldState,'prov'>,province:number):number {
  if(!Number.isSafeInteger(province)||province<0||province>=w.prov.count)
    throw new RangeError('invalid province');
  const terrain=w.prov.terrain[province];
  const slots=TERRAIN_DATA[terrain]?.width;
  if(!Number.isFinite(slots)||slots<=0)throw new RangeError('invalid terrain width');
  return slots*20; // live game uses legacy slots × 20; strategy-v1 has other widths
}

function projectSide(w:WorldState,units:readonly Unit[],slots:number):CombatFrontSideProjection {
  const sorted=[...units].sort((a,b)=>a.id-b.id);
  const selected=selectCombatFront(w,sorted,slots);
  const active=new Set(selected.units.map(u=>u.id));
  return {
    totalUnits:sorted.length,
    engagedIds:selected.units.map(u=>u.id),
    reserveIds:sorted.filter(u=>!active.has(u.id)).map(u=>u.id),
    selectedWidth:selected.units.reduce((sum,u)=>sum+unitCombatWidth(w,u),0),
    effectiveWidth:selected.units.reduce((sum,u,i)=>sum+unitCombatWidth(w,u)*selected.penalties[i],0),
    widthPenalties:selected.units.map((u,i)=>({unitId:u.id,factor:selected.penalties[i]})),
  };
}

/** Reconstructs exactly the two sides that the current daily battle gatherer
 * would see if combat ran now: non-destroyed, non-moving units, at war.
 * Other units must not be shown as reserves of a nonexistent engagement.
 */
export function projectCombatFronts(w:WorldState):CombatFrontProjection[] {
  const groups=new Map<number,Candidates>();
  for(const u of w.units){
    if(u.destroyed||u.path.length>0)continue;
    const controller=w.prov.controller[u.loc];
    const side=u.owner===controller?'defenders':atWar(w,u.owner,controller)?'attackers':null;
    if(side===null)continue;
    const group=groups.get(u.loc)??{attackers:[],defenders:[]};
    group[side].push(u);groups.set(u.loc,group);
  }
  const fronts:CombatFrontProjection[]=[];
  for(const [province,group] of [...groups].sort(([a],[b])=>a-b)){
    if(!group.attackers.length||!group.defenders.length)continue;
    const slots=TERRAIN_DATA[w.prov.terrain[province]]?.width;
    if(slots===undefined)throw new RangeError('invalid combat terrain');
    fronts.push({
      province,capacity:slots*20,
      attackers:projectSide(w,group.attackers,slots),
      defenders:projectSide(w,group.defenders,slots),
    });
  }
  return fronts;
}
