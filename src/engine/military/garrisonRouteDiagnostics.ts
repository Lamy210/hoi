// On-demand, read-only land-route diagnostics for a single garrison order.
// Never call from snapshot generation: pathfinding is intentionally explicit.
import type {Unit,WorldState} from '../core/state';
import {findPath} from '../systems/movement';

export const MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS=64;
export type GarrisonRouteStatus=
  'guarded'|'incoming'|'lost'|'paused'|'noEligibleUnits'|'routeAvailable'|'noLandPath'|'notChecked';

export interface GarrisonRouteTarget{
  province:number;
  status:GarrisonRouteStatus;
  /** Only returned for an observed, currently valid route; not a movement order. */
  candidateUnitId?:number;
  hops?:number;
}
export interface GarrisonRouteDiagnosis{
  orderId:number;
  revision:number;
  tick:number;
  pathChecks:number;
  truncated:boolean;
  targets:GarrisonRouteTarget[];
}

/**
 * Diagnose an order using exactly the movement planner's eligibility and
 * peaceful-travel pathfinder. Paths are read-only observations: other targets
 * may compete for the same eligible unit.
 */
export function diagnoseGarrisonRoutes(
  w:WorldState,orderId:number,country:number,maxPathChecks=MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS,
):GarrisonRouteDiagnosis|null {
  if(!Number.isSafeInteger(orderId)||orderId<=0||
    !Number.isSafeInteger(country)||country<0)return null;
  const g=w.garrisons.find(g=>g.id===orderId&&g.owner===country);
  if(!g)return null;
  const units=g.unitIds.map(id=>w.units.find(u=>u.id===id))
    .filter((u):u is Unit=>!!u&&!u.destroyed&&u.owner===country);
  const targets=g.provinces.filter(p=>Number.isSafeInteger(p)&&p>=0&&p<w.prov.count)
    .slice().sort((a,b)=>a-b);
  const activeTargets=new Set(targets.filter(p=>w.prov.controller[p]===country));
  const coverage=new Map([...activeTargets].map(p=>[p,0]));
  const guards=new Set<number>(),incoming=new Set<number>();
  for(const u of units){
    const dest=u.path.length>1?u.path[u.path.length-1]:u.loc;
    if(coverage.has(dest))coverage.set(dest,coverage.get(dest)!+1);
    if(u.path.length>1)incoming.add(dest);
    else guards.add(u.loc);
  }
  let pathChecks=0;
  let truncated=false;
  const results:GarrisonRouteTarget[]=[];
  const budget=Math.max(0,Math.min(MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS,
    Number.isSafeInteger(maxPathChecks)?maxPathChecks:0));
  for(const province of targets){
    if(!activeTargets.has(province)){
      results.push({province,status:'lost'});continue;
    }
    if(guards.has(province)){
      results.push({province,status:'guarded'});continue;
    }
    if(incoming.has(province)){
      results.push({province,status:'incoming'});continue;
    }
    if(g.paused){
      results.push({province,status:'paused'});continue;
    }
    const candidates=units.filter(u=>
      !u.manualHold&&!u.encircled&&!u.path.length&&!w.runtime.activeBattles.has(u.loc)&&
      w.prov.controller[u.loc]===country&&u.frontId<0&&u.loc!==province&&
      (!coverage.has(u.loc)||coverage.get(u.loc)!>1)
    ).sort((a,b)=>a.id-b.id);
    if(!candidates.length){
      results.push({province,status:'noEligibleUnits'});continue;
    }
    let found:GarrisonRouteTarget|null=null;
    let exhausted=false;
    for(const u of candidates){
      if(pathChecks>=budget){exhausted=true;truncated=true;break;}
      pathChecks++;
      const route=findPath(w,u.loc,province,country,false);
      if(route&&route.length>1){
        found={province,status:'routeAvailable',candidateUnitId:u.id,hops:route.length-1};
        break;
      }
    }
    results.push(found??{province,status:exhausted?'notChecked':'noLandPath'});
  }
  return {orderId:g.id,revision:g.revision,tick:w.tick,pathChecks,truncated,targets:results};
}
