// Deterministic bounded assignment improvement after the garrison planner has
// selected the target set and safely movable divisions.
// Reassigning destinations among the same divisions preserves guard withdrawals,
// manual control, command budget, target coverage and save compatibility.
import type {Unit,WorldState} from '../core/state';
import {findPath,segmentDays} from '../systems/movement';
import type {GarrisonMovePlan} from './garrisons';

const MAX_ASSIGNMENTS=4;
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
 * Exact minimum-total-ETA assignment for the ALREADY SELECTED targets and
 * divisions (up to the weekly four-command budget). Does not choose a different
 * target or unassign a defender. At most 12 additional land-path searches and
 * 4! = 24 possible allocations; accepts only strict ETA improvements.
 *
 * This is not a global optimum over all eligible divisions/target subsets.
 */
export function optimizeGarrisonBatch(
  w:WorldState,orders:readonly GarrisonMovePlan[],
):GarrisonMovePlan[]{
  if(orders.length<=1||orders.length>MAX_ASSIGNMENTS)return orders.map(o=>({...o,path:[...o.path]}));
  const units=orders.map(o=>w.units.find(u=>u.id===o.unitId&&!u.destroyed));
  if(units.some(u=>!u))return orders.map(o=>({...o,path:[...o.path]}));
  const selected=units as Unit[];
  const choices:Array<Array<RouteChoice|null>>=[];
  for(let targetIndex=0;targetIndex<orders.length;targetIndex++){
    const target=orders[targetIndex].target;
    const row:Array<RouteChoice|null>=[];
    for(let unitIndex=0;unitIndex<selected.length;unitIndex++){
      const unit=selected[unitIndex];
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
    for(let unitIndex=0;unitIndex<selected.length;unitIndex++){
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
