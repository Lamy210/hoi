// Only a single read-only planning invocation may share these route results.
// The movement pathfinder does not depend on a division's speed; ETA does.
import type {WorldState} from '../core/state';
import {findPath} from '../systems/movement';

export type GarrisonRouteLookup=(from:number,to:number)=>number[]|null;
/** Optional, caller-owned counters; not part of WorldState or save data. */
export interface GarrisonRouteCacheStats {
  requests:number;
  searches:number;
  hits:number;
  unreachable:number;
}
export function emptyGarrisonRouteCacheStats():GarrisonRouteCacheStats {
  return {requests:0,searches:0,hits:0,unreachable:0};
}
type LandPathSearch=(world:WorldState,from:number,to:number,owner:number,allowHostile:boolean)=>number[]|null;

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
  const byOrigin=new Map<number,Map<number,number[]|null>>();
  return (from,to)=>{
    if(stats)stats.requests++;
    let destinations=byOrigin.get(from);
    if(!destinations){
      destinations=new Map();
      byOrigin.set(from,destinations);
    }
    if(!destinations.has(to)){
      if(stats)stats.searches++;
      const route=search(w,from,to,owner,false);
      if(!route&&stats)stats.unreachable++;
      destinations.set(to,route);
    }else if(stats)stats.hits++;
    const route=destinations.get(to);
    return route?[...route]:null;
  };
}
