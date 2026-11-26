// Deterministic bounded assignment improvement after the garrison planner has
// selected the target set and safely movable divisions.
// Reassigning destinations among the same divisions preserves guard withdrawals,
// manual control, command budget, target coverage and save compatibility.
import type {Unit,WorldState} from '../core/state';
import {findPath,segmentDays} from '../systems/movement';
import type {GarrisonMovePlan,GarrisonOrder} from './garrisons';

const MAX_ASSIGNMENTS=4;
export const MAX_GARRISON_EXTRA_RESERVES=8;
const IMPROVEMENT_EPSILON=1e-9;

interface RouteChoice {
  unitId:number;
  path:number[];
  days:number;
}

/** Estimated execution duration of a legal route for a particular division. */
export function estimateGarrisonTravelDays(
  w:WorldState,unit:Unit,path:readonly number[],
):number {
  if(path.length<2||path[0]!==unit.loc)return Infinity;
  let days=0;
  for(let i=0;i<path.length-1;i++){
    const segment=segmentDays(w,path[i],path[i+1],unit);
    if(!Number.isFinite(segment)||segment<=0)return Infinity;
    days+=segment;
  }
  return days;
}

/**
 * Choose a small deterministic sample of idle reserves. Never pull a reserve
 * from ANY protected garrison objective: the initial greedy planner owns guard
 * withdrawal decisions and already enforces the last-guard constraint.
 * Squared map distance is used only to shortlist, never to claim route legality.
 */
export function selectGarrisonReserveCandidates(
  w:WorldState,
  g:Pick<GarrisonOrder,'owner'|'provinces'|'unitIds'>,
  plans:readonly GarrisonMovePlan[],
):Unit[]{
  if(plans.length<2||plans.length>MAX_ASSIGNMENTS)return [];
  const chosen=new Set(plans.map(p=>p.unitId));
  const protectedTargets=new Set(g.provinces);
  const objectives=plans.map(p=>p.target);
  return g.unitIds
    .filter(id=>!chosen.has(id))
    .map(id=>w.units.find(u=>u.id===id))
    .filter((u):u is Unit=>!!u&&!u.destroyed&&u.owner===g.owner&&
      !u.manualHold&&!u.encircled&&u.path.length===0&&u.frontId<0&&
      !w.runtime.activeBattles.has(u.loc)&&w.prov.controller[u.loc]===g.owner&&
      !protectedTargets.has(u.loc))
    .map(u=>{
      const distance=Math.min(...objectives.map(p=>{
        const dx=w.prov.cx[u.loc]-w.prov.cx[p];
        const dy=w.prov.cy[u.loc]-w.prov.cy[p];
        return dx*dx+dy*dy;
      }));
      return {u,distance};
    })
    .sort((a,b)=>a.distance-b.distance||a.u.id-b.u.id)
    .slice(0,MAX_GARRISON_EXTRA_RESERVES)
    .map(v=>v.u);
}

/**
 * Exact minimum-total-ETA assignment over the ALREADY SELECTED objectives and
 * chosen divisions plus at most 8 additional safe reserves. For four objectives
 * it evaluates up to 12P4 assignments and performs <=44 extra path queries.
 * Improvements must be strict; the original allocation is always a fallback.
 *
 * This is a bounded heuristic subset, NOT a global optimum over all garrison
 * divisions or objectives.
 */
export function optimizeGarrisonBatch(
  w:WorldState,orders:readonly GarrisonMovePlan[],
  extraUnits:readonly Unit[]=[],
):GarrisonMovePlan[]{
  if(orders.length<=1||orders.length>MAX_ASSIGNMENTS)return orders.map(o=>({...o,path:[...o.path]}));
  const units=orders.map(o=>w.units.find(u=>u.id===o.unitId&&!u.destroyed));
  if(units.some(u=>!u))return orders.map(o=>({...o,path:[...o.path]}));
  const selected=units as Unit[];
  const selectedIds=new Set(selected.map(u=>u.id));
  const candidates=[...selected];
  for(const unit of extraUnits){
    if(candidates.length>=selected.length+MAX_GARRISON_EXTRA_RESERVES)break;
    if(selectedIds.has(unit.id)||unit.destroyed||unit.owner!==selected[0].owner||
      unit.manualHold||unit.encircled||unit.path.length>0||unit.frontId>=0||
      w.prov.controller[unit.loc]!==unit.owner||
      w.runtime.activeBattles.has(unit.loc))continue;
    selectedIds.add(unit.id);
    candidates.push(unit);
  }
  const choices:Array<Array<RouteChoice|null>>=[];
  for(let targetIndex=0;targetIndex<orders.length;targetIndex++){
    const target=orders[targetIndex].target;
    const row:Array<RouteChoice|null>=[];
    for(let unitIndex=0;unitIndex<candidates.length;unitIndex++){
      const unit=candidates[unitIndex];
      const path=targetIndex===unitIndex?orders[targetIndex].path:
        findPath(w,unit.loc,target,unit.owner,false);
      const days=path?estimateGarrisonTravelDays(w,unit,path):Infinity;
      row.push(path&&Number.isFinite(days)?{unitId:unit.id,path,days}:null);
    }
    choices.push(row);
  }
  // The original assignment is the fallback, including its original route.
  const original=orders.map((_,i)=>choices[i][i]);
  if(original.some(x=>!x))return orders.map(o=>({...o,path:[...o.path]}));
  let bestCost=original.reduce((sum,x)=>sum+x!.days,0);
  let bestAssignment=orders.map((_,i)=>i);
  const assignment=new Array<number>(orders.length);
  const search=(targetIndex:number,used:number,cost:number):void=>{
    if(targetIndex===orders.length){
      if(cost<bestCost-IMPROVEMENT_EPSILON){
        bestCost=cost;
        bestAssignment=[...assignment];
      }
      return;
    }
    for(let unitIndex=0;unitIndex<candidates.length;unitIndex++){
      if((used&(1<<unitIndex))!==0)continue;
      const choice=choices[targetIndex][unitIndex];
      if(!choice||cost+choice.days>=bestCost-IMPROVEMENT_EPSILON)continue;
      assignment[targetIndex]=unitIndex;
      search(targetIndex+1,used|(1<<unitIndex),cost+choice.days);
    }
  };
  search(0,0,0);
  return orders.map((o,i)=>{
    const choice=choices[i][bestAssignment[i]]!;
    return {unitId:choice.unitId,target:o.target,path:[...choice.path]};
  });
}
