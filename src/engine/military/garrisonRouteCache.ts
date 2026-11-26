// Only a single read-only planning invocation may share these route results.
// The movement pathfinder does not depend on a division's speed; ETA does.
import type {WorldState} from '../core/state';
import {findPath} from '../systems/movement';

export type GarrisonRouteLookup=(from:number,to:number)=>number[]|null;
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
):GarrisonRouteLookup {
  const byOrigin=new Map<number,Map<number,number[]|null>>();
  return (from,to)=>{
    let destinations=byOrigin.get(from);
    if(!destinations){
      destinations=new Map();
      byOrigin.set(from,destinations);
    }
    if(!destinations.has(to)){
      destinations.set(to,search(w,from,to,owner,false));
    }
    const route=destinations.get(to);
    return route?[...route]:null;
  };
}
