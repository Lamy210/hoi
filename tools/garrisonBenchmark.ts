// Developer-only workload. It does not modify the scenario pack or save file.
import {performance} from 'node:perf_hooks';
import {createTestEngine} from '../tests/helpers';
import type {GarrisonOrder} from '../src/engine/military/garrisons';
import {MAX_GARRISON_TARGETS,MAX_GARRISON_UNITS,planGarrisonMoves} from '../src/engine/military/garrisons';
import {emptyGarrisonRouteCacheStats} from '../src/engine/military/garrisonRouteCache';
import {hashWorld} from '../src/engine/core/hash';
import type {WorldState} from '../src/engine/core/state';

export type GarrisonWorkload='stacked'|'distributed';
export interface GarrisonBenchOptions {
  workload:GarrisonWorkload;
  units:number;
  targets:number;
  iterations:number;
  warmup:number;
}
export interface GarrisonBenchResult {
  workload:GarrisonWorkload;
  provinceCount:number;
  units:number;
  targets:number;
  iterations:number;
  warmup:number;
  p50Ms:number;
  p95Ms:number;
  minMs:number;
  maxMs:number;
  /** Observed on first measured iteration; counters cover all planner lookups. */
  routeRequests:number;
  pathSearches:number;
  cacheHits:number;
  unreachableSearches:number;
  /** Distinct impossible routes rejected by connectivity, without A*. */
  disconnectedSkips:number;
  plannedMoves:number;
  /** Not a deterministic allocation metric: process GC can affect this value. */
  heapDeltaKiB:number;
}

/** Maximum-size synthetic order on the verified East Asia map. */
export async function createGarrisonStressWorld(
  workload:GarrisonWorkload,units=MAX_GARRISON_UNITS,targets=MAX_GARRISON_TARGETS,
):Promise<{world:WorldState;order:GarrisonOrder}> {
  if(!Number.isSafeInteger(units)||units<1||units>MAX_GARRISON_UNITS||
    !Number.isSafeInteger(targets)||targets<1||targets>MAX_GARRISON_TARGETS)
    throw new Error('units/targets outside defined garrison limits');
  const engine=await createTestEngine(1,20261127,'JPN');
  const w=engine.world;
  if(w.prov.count<=targets)throw new Error('pack has insufficient provinces for workload');
  const owner=w.playerCountry;
  const template=w.units.find(u=>u.owner===owner&&!u.destroyed);
  if(!template)throw new Error('benchmark requires a valid division template');
  // Synthetic setup: every province is made traversable by one country.
  // This deliberately isolates route-search scalability from diplomacy.
  w.prov.controller.fill(owner);
  w.units=w.units.filter(u=>u.owner!==owner);
  const sourceProvinces=Array.from({length:w.prov.count-targets},(_,i)=>targets+i);
  const sourceIndex=(i:number)=>workload==='stacked'?0:i%sourceProvinces.length;
  const created=Array.from({length:units},(_,i)=>({
    ...template,
    id:w.nextUnitId++,
    owner,loc:sourceProvinces[sourceIndex(i)],
    armyId:null,frontId:-1,manualHold:false,encircled:false,destroyed:false,
    path:[],segIdx:0,segProgress:0,segDays:0,
  }));
  w.units.push(...created);
  const order:GarrisonOrder={
    id:1,owner,
    provinces:Array.from({length:targets},(_,i)=>i),
    unitIds:created.map(u=>u.id),
    paused:false,revision:1,
  };
  w.garrisons=[order];
  w.nextGarrisonId=2;
  return {world:w,order};
}

function nearestRank(data:readonly number[],q:number):number {
  const index=Math.max(0,Math.ceil(data.length*q)-1);
  return data[index];
}

export async function runGarrisonBench(options:GarrisonBenchOptions):Promise<GarrisonBenchResult>{
  const {workload,units,targets,iterations,warmup}=options;
  if(!Number.isSafeInteger(iterations)||iterations<1||iterations>1000||
    !Number.isSafeInteger(warmup)||warmup<0||warmup>1000)
    throw new Error('iterations must be 1..1000; warmup must be 0..1000');
  const {world:w,order}=await createGarrisonStressWorld(workload,units,targets);
  const baselineHash=hashWorld(w);
  const times:number[]=[];
  let expectedPlan:string|undefined;
  let firstStats=emptyGarrisonRouteCacheStats(),plannedMoves=0;
  const heapBefore=process.memoryUsage().heapUsed;
  for(let i=0;i<warmup+iterations;i++){
    const stats=emptyGarrisonRouteCacheStats();
    const begin=performance.now();
    const plan=planGarrisonMoves(w,order,stats);
    const elapsed=performance.now()-begin;
    const signature=JSON.stringify(plan);
    if(expectedPlan===undefined)expectedPlan=signature;
    else if(signature!==expectedPlan)throw new Error('non-deterministic garrison plan');
    if(i>=warmup){
      times.push(elapsed);
      if(times.length===1){firstStats=stats;plannedMoves=plan.length;}
    }
  }
  const heapDeltaKiB=(process.memoryUsage().heapUsed-heapBefore)/1024;
  if(hashWorld(w)!==baselineHash)throw new Error('planner mutated WorldState');
  times.sort((a,b)=>a-b);
  return {
    workload,provinceCount:w.prov.count,units,targets,iterations,warmup,
    p50Ms:nearestRank(times,0.5),p95Ms:nearestRank(times,0.95),
    minMs:times[0],maxMs:times[times.length-1],
    routeRequests:firstStats.requests,pathSearches:firstStats.searches,
    cacheHits:firstStats.hits,unreachableSearches:firstStats.unreachable,
    disconnectedSkips:firstStats.disconnected,
    plannedMoves,heapDeltaKiB,
  };
}
