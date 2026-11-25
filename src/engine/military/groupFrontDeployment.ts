// Coordinate multiple front plans before making any state changes.
// This planner never mutates WorldState. An entire group deployment is accepted
// or rejected as a single command, including all route and revision checks.
import type {WorldState} from '../core/state';
import {planFrontDeployment,type FrontDeploymentMode} from './frontDeployment';
import {planGroupFrontAssignments,type GroupFrontAssignment} from './groupFrontAssignments';

export interface GroupFrontDeploymentOrder {
  unitId:number;
  frontId:number;
  target:number;
  path:number[];
}
export interface GroupFrontDeploymentPlan {
  reason:string|null;
  orders:GroupFrontDeploymentOrder[];
}

export function planGroupFrontDeployment(
  w:WorldState,country:number,groupId:unknown,assignments:unknown,mode:unknown,
):GroupFrontDeploymentPlan {
  const fail=(reason:string):GroupFrontDeploymentPlan=>({reason,orders:[]});
  const assignment=planGroupFrontAssignments(w,country,groupId,assignments);
  if(assignment.reason)return fail(assignment.reason);
  if(mode!=='even'&&mode!=='strategic'&&mode!=='nearest')return fail('badParams');
  // Merge the armies targeting the same front before ranking destination tiles.
  // This retains the existing single-front algorithm's load balancing.
  const fronts=new Map<number,{revision:number;units:number[]}>();
  for(const entry of assignments as GroupFrontAssignment[]){
    const target=fronts.get(entry.frontId);
    if(target)target.units.push(...entry.unitIds);
    else fronts.set(entry.frontId,{revision:entry.expectedRevision,units:[...entry.unitIds]});
  }
  const orders:GroupFrontDeploymentOrder[]=[];
  for(const [frontId,batch] of [...fronts].sort((a,b)=>a[0]-b[0])){
    const plan=planFrontDeployment(w,country,frontId,batch.revision,batch.units,mode as FrontDeploymentMode);
    if(plan.reason)return fail(plan.reason);
    orders.push(...plan.orders.map(order=>({frontId,...order})));
  }
  return {reason:null,orders:orders.sort((a,b)=>a.unitId-b.unitId)};
}
