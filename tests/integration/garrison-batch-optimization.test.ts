import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {hashWorld} from '../../src/engine/core/hash';
import {findPath} from '../../src/engine/systems/movement';
import {planGarrisonMoves,GARRISON_COMMAND_BUDGET,type GarrisonMovePlan} from '../../src/engine/military/garrisons';
import {estimateGarrisonTravelDays,optimizeGarrisonBatch} from '../../src/engine/military/garrisonBatchOptimization';
import type {Unit,WorldState} from '../../src/engine/core/state';

async function fixture(){
  const e=await createTestEngine(1,20261126,'KOR'),w=e.world,c=w.playerCountry;
  const province=(id:string)=>{
    const p=w.prov.id.indexOf(id);
    expect(p,id).toBeGreaterThanOrEqual(0);
    return p;
  };
  const [a,b,d]=w.units.filter(u=>u.owner===c&&!u.destroyed);
  expect(a).toBeDefined();expect(b).toBeDefined();expect(d).toBeDefined();
  for(const u of [a,b,d]){
    u.path=[];u.segIdx=0;u.segProgress=0;u.segDays=0;
    u.frontId=-1;u.encircled=false;u.manualHold=false;
  }
  const busan=province('KR-26'),incheon=province('KR-28'),capital=province('KR-11');
  const g={id:1,owner:c,provinces:[incheon,busan],unitIds:[a.id,b.id],paused:false,revision:1};
  w.garrisons=[g];w.nextGarrisonId=2;
  return {e,w,c,province,a,b,d,busan,incheon,capital,g};
}

function pathPlan(w:WorldState,u:Unit,target:number):GarrisonMovePlan{
  const path=findPath(w,u.loc,target,u.owner,false);
  expect(path).not.toBeNull();
  expect(path!.length).toBeGreaterThan(1);
  return {unitId:u.id,target,path:path!};
}
function duration(w:WorldState,plans:readonly GarrisonMovePlan[]):number{
  return plans.reduce((sum,p)=>{
    const unit=w.units.find(u=>u.id===p.unitId)!;
    return sum+estimateGarrisonTravelDays(w,unit,p.path);
  },0);
}

describe('bounded garrison batch assignment optimization',()=>{
  it('reduces total travel days across two port targets without changing target priority or assigned divisions',async()=>{
    const {w,a,b,busan,incheon,province,g}=await fixture();
    a.loc=province('KR-45');b.loc=province('KR-46');
    const initial=[pathPlan(w,a,busan),pathPlan(w,b,incheon)];
    const swapped=[pathPlan(w,b,busan),pathPlan(w,a,incheon)];
    const before=hashWorld(w);
    const originalDays=duration(w,initial),swapDays=duration(w,swapped);
    expect(swapDays).toBeLessThan(originalDays);
    const optimized=optimizeGarrisonBatch(w,initial);
    expect(optimized.map(p=>p.target)).toEqual([busan,incheon]);
    expect(optimized.map(p=>p.unitId)).toEqual([b.id,a.id]);
    expect(duration(w,optimized)).toBeCloseTo(swapDays,8);
    expect(initial.map(p=>p.unitId)).toEqual([a.id,b.id]);
    expect(hashWorld(w)).toBe(before);
    // Production planner may select a different pair ordering on the initial pass,
    // but must return the minimum-cost assignment for its chosen two divisions.
    const production=planGarrisonMoves(w,g);
    expect(production).toHaveLength(2);
    expect(production.map(p=>p.target)).toEqual([busan,incheon]);
    expect(new Set(production.map(p=>p.unitId))).toEqual(new Set([a.id,b.id]));
    expect(duration(w,production)).toBeCloseTo(Math.min(originalDays,swapDays),8);
  });

  it('finds exact minimum ETA among the chosen three divisions and objectives',async()=>{
    const {w,a,b,d,busan,incheon,capital,province}=await fixture();
    a.loc=province('KR-45');b.loc=province('KR-46');d.loc=province('KR-29');
    const selected=[a,b,d],targets=[capital,busan,incheon];
    const initial=targets.map((t,i)=>pathPlan(w,selected[i],t));
    const before=hashWorld(w);
    let best=Infinity;
    for(const i of [0,1,2])for(const j of [0,1,2])for(const k of [0,1,2]){
      if(new Set([i,j,k]).size!==3)continue;
      const candidate=[i,j,k].map((n,t)=>pathPlan(w,selected[n],targets[t]));
      best=Math.min(best,duration(w,candidate));
    }
    const result=optimizeGarrisonBatch(w,initial);
    expect(duration(w,result)).toBeCloseTo(best,8);
    expect(result.map(p=>p.target)).toEqual(targets);
    expect(new Set(result.map(p=>p.unitId))).toEqual(new Set(selected.map(u=>u.id)));
    expect(hashWorld(w)).toBe(before);
  });

  it('preserves fixed guards, manual holds and the weekly command budget',async()=>{
    const {w,a,b,busan,incheon,capital,province,g}=await fixture();
    g.provinces=[capital,busan,incheon];
    a.loc=capital;b.loc=province('KR-45');
    expect(planGarrisonMoves(w,g).map(p=>p.unitId)).toEqual([b.id]);
    a.loc=province('KR-46');a.manualHold=true;
    expect(planGarrisonMoves(w,g).map(p=>p.unitId)).toEqual([b.id]);
    a.manualHold=false;
    const plans=planGarrisonMoves(w,g);
    expect(plans.length).toBeLessThanOrEqual(GARRISON_COMMAND_BUDGET);
    expect(plans.map(p=>p.target)).toEqual([capital,busan]);
    const before=hashWorld(w);
    const oversized=Array.from({length:5},(_,i)=>({...plans[0],unitId:plans[0].unitId+i}));
    expect(optimizeGarrisonBatch(w,oversized)).toEqual(oversized);
    expect(hashWorld(w)).toBe(before);
  });

  it('keeps planning and 14-tick replay deterministic after save/load',async()=>{
    const {e,w,a,b,busan,incheon,province,g}=await fixture();
    a.loc=province('KR-45');b.loc=province('KR-46');
    const before=hashWorld(w),saved=e.serialize(),planned=planGarrisonMoves(w,g);
    expect(hashWorld(w)).toBe(before);
    const restored=await createTestEngine(1,20261126,'KOR');
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(planGarrisonMoves(restored.world,restored.world.garrisons[0])).toEqual(planned);
    expect(hashWorld(restored.world)).toBe(before);
    expect(planned.map(p=>p.target)).toEqual([busan,incheon]);
    for(let tick=0;tick<14;tick++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+tick).toBe(hashWorld(e.world));
    }
  });
});
