// Persistent defensive area orders. Never silently move divisions assigned to
// frontline operations or under explicit manual control.
import type {Unit,WorldState} from '../core/state';
import {findPath} from '../systems/movement';
import {rankGarrisonTargets} from './garrisonPriorities';
import {estimateGarrisonTravelDays,optimizeGarrisonBatch,selectGarrisonReserveCandidates} from './garrisonBatchOptimization';

export interface GarrisonOrder {
  id:number;
  owner:number;
  provinces:number[];
  unitIds:number[];
  paused:boolean;
  revision:number;
}

export const MAX_GARRISON_ORDERS=64;
export const MAX_GARRISON_TARGETS=64;
export const MAX_GARRISON_UNITS=256;
export const GARRISON_COMMAND_BUDGET=4;

const positiveId=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
const nonnegativeId=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>=0;
function uniqueIds(ids:unknown,max:number,minimum:number):ids is number[]{
  return Array.isArray(ids)&&ids.length>=minimum&&ids.length<=max&&
    ids.every(positiveId)&&new Set(ids).size===ids.length;
}
function uniqueProvinces(ids:unknown,max:number,minimum:number):ids is number[]{
  return Array.isArray(ids)&&ids.length>=minimum&&ids.length<=max&&
    ids.every(nonnegativeId)&&new Set(ids).size===ids.length;
}

/** Validates all inputs before mutating the world; no partial subscriptions. */
export function validateGarrisonCreation(
  w:WorldState,owner:number,provinces:unknown,unitIds:unknown,
):string|null {
  if(!w.countries.alive[owner])return 'countryDead';
  if(w.garrisons.filter(g=>g.owner===owner).length>=MAX_GARRISON_ORDERS||
     !positiveId(w.nextGarrisonId)||w.nextGarrisonId>=Number.MAX_SAFE_INTEGER)
    return 'limitExceeded';
  if(!uniqueProvinces(provinces,MAX_GARRISON_TARGETS,1)||
     !uniqueIds(unitIds,MAX_GARRISON_UNITS,1))return 'badParams';
  if(provinces.some(p=>p>=w.prov.count))return 'badProvince';
  if(provinces.some(p=>w.prov.controller[p]!==owner))return 'notControlledByYou';
  for(const id of unitIds){
    const u=w.units.find(u=>u.id===id&&!u.destroyed);
    if(!u||u.owner!==owner)return 'notYourUnit';
    if(u.frontId>=0||w.garrisons.some(g=>g.unitIds.includes(id)))return 'unitAlreadyAssigned';
  }
  return null;
}

/** Structural and ownership validation for untrusted saves. Controller is
 * deliberately not checked, since a garrison objective can be occupied.
 */
export function validateGarrisons(w:WorldState):string[]{
  const errors:string[]=[];
  if(!positiveId(w.nextGarrisonId))return ['invalid next garrison id'];
  const usedIds=new Set<number>(),usedUnitIds=new Set<number>(),counts=new Map<number,number>();
  for(const g of w.garrisons){
    if(!g||!positiveId(g.id)||g.id>=w.nextGarrisonId||usedIds.has(g.id)||
      !nonnegativeId(g.owner)||g.owner>=w.countries.count||
      !Number.isSafeInteger(g.revision)||g.revision<1||
      typeof g.paused!=='boolean'){
      errors.push('invalid garrison metadata');continue;
    }
    usedIds.add(g.id);
    counts.set(g.owner,(counts.get(g.owner)??0)+1);
    if(counts.get(g.owner)!>MAX_GARRISON_ORDERS)errors.push('garrison order limit');
    if(!uniqueProvinces(g.provinces,MAX_GARRISON_TARGETS,1)||
       g.provinces.some(p=>p>=w.prov.count))errors.push('invalid garrison target');
    if(!uniqueIds(g.unitIds,MAX_GARRISON_UNITS,1)){
      errors.push('invalid garrison division ids');continue;
    }
    for(const id of g.unitIds){
      if(usedUnitIds.has(id))errors.push('duplicate garrison division');
      usedUnitIds.add(id);
      const u=w.units.find(u=>u.id===id);
      if(!u||u.owner!==g.owner||u.frontId>=0)errors.push('invalid garrison division reference');
    }
  }
  return errors;
}

export interface GarrisonMovePlan {unitId:number;target:number;path:number[]}

/** Stable one-tick planning: defend threatened and strategically important targets
 * first, never strip their last guard. Only legitimate land paths are considered. */
export function planGarrisonMoves(w:WorldState,g:GarrisonOrder):GarrisonMovePlan[]{
  if(g.paused||!w.countries.alive[g.owner])return [];
  const targets=rankGarrisonTargets(w,g).map(t=>t.province);
  const units=g.unitIds.map(id=>w.units.find(u=>u.id===id))
    .filter((u):u is Unit=>!!u&&!u.destroyed&&u.owner===g.owner);
  const coverage=new Map(targets.map(p=>[p,0]));
  for(const u of units){
    const dest=u.path.length>1?u.path[u.path.length-1]:u.loc;
    if(coverage.has(dest))coverage.set(dest,coverage.get(dest)!+1);
  }
  const busyUnits=new Set<number>();
  const orders:GarrisonMovePlan[]=[];
  for(const target of targets){
    if(coverage.get(target)!>0||orders.length>=GARRISON_COMMAND_BUDGET)continue;
    const candidates=units.filter(u=>!busyUnits.has(u.id)&&!u.manualHold&&
      !u.encircled&&!u.path.length&&!w.runtime.activeBattles.has(u.loc)&&
      w.prov.controller[u.loc]===g.owner&&u.frontId<0&&u.loc!==target&&
      (!coverage.has(u.loc)||coverage.get(u.loc)!>1))
      .map(u=>({u,path:findPath(w,u.loc,target,g.owner,false)}))
      .filter((v):v is {u:Unit;path:number[]}=>!!v.path&&v.path.length>1)
      .map(v=>({...v,days:estimateGarrisonTravelDays(w,v.u,v.path)}))
      .filter(v=>Number.isFinite(v.days))
      .sort((a,b)=>a.days-b.days||a.path.length-b.path.length||a.u.id-b.u.id);
    const best=candidates[0];
    if(!best)continue;
    orders.push({unitId:best.u.id,target,path:best.path});
    busyUnits.add(best.u.id);
    if(coverage.has(best.u.loc))coverage.set(best.u.loc,coverage.get(best.u.loc)!-1);
    coverage.set(target,coverage.get(target)!+1);
  }
  // Keep the chosen objectives and the existing guard withdrawals fixed, but
  // consider nearby idle reserves outside every protected objective as well.
  const reserves=selectGarrisonReserveCandidates(w,g,orders);
  return optimizeGarrisonBatch(w,orders,reserves);
}
