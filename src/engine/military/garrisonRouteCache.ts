// Only a single read-only planning invocation may share these route results.
// The movement pathfinder does not depend on a division's speed; ETA does.
import type {WorldState} from '../core/state';
import {canEnterProvince,findPath} from '../systems/movement';

export type GarrisonRouteLookup=(from:number,to:number)=>number[]|null;
/** Optional, caller-owned counters; not part of WorldState or save data. */
export interface GarrisonRouteCacheStats {
  requests:number;
  searches:number;
  hits:number;
  unreachable:number;
  /** Distinct uncrossable origin/objective pairs skipped before A*. */
  disconnected:number;
}
export function emptyGarrisonRouteCacheStats():GarrisonRouteCacheStats {
  return {requests:0,searches:0,hits:0,unreachable:0,disconnected:0};
}
type LandPathSearch=(world:WorldState,from:number,to:number,owner:number,allowHostile:boolean)=>number[]|null;

/**
 * Return a conservative connectivity preflight for peaceful land travel.
 * False means definitely unreachable; true only means that the original A*
 * may find a route. A foreign-controlled origin is allowed to depart because
 * findPath only applies entry permissions to neighbors, not its starting node.
 *
 * The passable graph is undirected in the current scenario format. Build it
 * anew per planning/diagnosis invocation; no cached access rights cross ticks.
 */
export function createGarrisonConnectivity(
  w:WorldState,owner:number,
):(from:number,to:number)=>boolean {
  const n=w.prov.count;
  const passable=Array.from({length:n},(_,p)=>canEnterProvince(w,p,owner,false));
  const component=new Array<number>(n).fill(-1);
  const queue:number[]=[];
  let componentId=0;
  for(let start=0;start<n;start++){
    if(!passable[start]||component[start]!==-1)continue;
    component[start]=componentId;
    queue.push(start);
    for(let index=0;index<queue.length;index++){
      const at=queue[index];
      for(let edge=w.adj.offsets[at];edge<w.adj.offsets[at+1];edge++){
        const next=w.adj.targets[edge];
        if(!passable[next]||component[next]!==-1)continue;
        component[next]=componentId;
        queue.push(next);
      }
    }
    queue.length=0;
    componentId++;
  }
  return (from,to)=>{
    if(from===to)return true;
    if(!Number.isSafeInteger(from)||from<0||from>=n||
       !Number.isSafeInteger(to)||to<0||to>=n)return false;
    return component[to]!==-1&&
      (component[from]===-1||component[from]===component[to]);
  };
}

/**
 * Reuse legal land paths for identical origins and objectives within one
 * garrison planning invocation. Cache failed searches as well.
 *
 * No module-level cache: diplomacy, wars and province control may change on
 * the next tick. Return a copy so consumers cannot mutate a cached path.
 * Division-specific ETA must still be calculated separately with segmentDays.
 */
export function createGarrisonRouteLookup(
  w:WorldState,owner:number,
  search:LandPathSearch=findPath,
  stats?:GarrisonRouteCacheStats,
):GarrisonRouteLookup {
  const couldReach=createGarrisonConnectivity(w,owner);
  const byOrigin=new Map<number,Map<number,number[]|null>>();
  return (from,to)=>{
    if(stats)stats.requests++;
    let destinations=byOrigin.get(from);
    if(!destinations){
      destinations=new Map();
      byOrigin.set(from,destinations);
    }
    if(!destinations.has(to)){
      // A* admits from===to even on a blocked node. Otherwise, the target
      // must be passable; two passable nodes in different components cannot
      // be connected. A blocked origin falls back to the original A* check.
      const disconnected=!couldReach(from,to);
      if(disconnected){
        destinations.set(to,null);
        if(stats){stats.disconnected++;stats.unreachable++;}
      }else{
        if(stats)stats.searches++;
        const route=search(w,from,to,owner,false);
        if(!route&&stats)stats.unreachable++;
        destinations.set(to,route);
      }
    }else if(stats)stats.hits++;
    const route=destinations.get(to);
    return route?[...route]:null;
  };
}
