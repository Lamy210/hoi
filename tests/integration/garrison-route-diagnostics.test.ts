import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {hashWorld} from '../../src/engine/core/hash';
import {findPath} from '../../src/engine/systems/movement';
import {estimateGarrisonTravelDays} from '../../src/engine/military/garrisonBatchOptimization';
import {planGarrisonMoves} from '../../src/engine/military/garrisons';
import {diagnoseGarrisonRoutes,MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS} from '../../src/engine/military/garrisonRouteDiagnostics';

async function fixture(){
  const e=await createTestEngine(1,20261126,'KOR'),w=e.world,c=w.playerCountry;
  const busan=w.prov.id.indexOf('KR-26');
  const incheon=w.prov.id.indexOf('KR-28');
  const jeju=w.prov.id.indexOf('KR-49');
  expect(busan).toBeGreaterThanOrEqual(0);
  expect(incheon).toBeGreaterThanOrEqual(0);
  expect(jeju).toBeGreaterThanOrEqual(0);
  const u=w.units.find(unit=>unit.owner===c&&!unit.destroyed)!;
  expect(u).toBeDefined();
  u.loc=busan;
  u.path=[];u.segIdx=0;u.segProgress=0;u.segDays=0;
  u.manualHold=false;u.encircled=false;u.frontId=-1;
  w.garrisons.push({id:1,owner:c,provinces:[incheon,jeju],unitIds:[u.id],paused:false,revision:1});
  w.nextGarrisonId=2;
  return {e,w,c,u,busan,incheon,jeju};
}

describe('read-only on-demand garrison land-route diagnosis',()=>{
  it('distinguishes a viable mainland route from an isolated owned island',async()=>{
    const {w,c,u,incheon,jeju,busan}=await fixture();
    expect(findPath(w,busan,incheon,c,false)).not.toBeNull();
    expect(findPath(w,busan,jeju,c,false)).toBeNull();
    const before=hashWorld(w);
    const result=diagnoseGarrisonRoutes(w,1,c);
    expect(result).not.toBeNull();
    expect(result?.tick).toBe(w.tick);
    expect(result?.revision).toBe(1);
    expect(result?.pathChecks).toBeLessThanOrEqual(MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS);
    expect(result?.targets.find(x=>x.province===incheon)).toMatchObject({
      province:incheon,status:'routeAvailable',candidateUnitId:u.id,
    });
    expect(result?.targets.find(x=>x.province===jeju)).toMatchObject({
      province:jeju,status:'noLandPath',
    });
    const route=findPath(w,busan,incheon,c,false)!;
    const estimatedDays=estimateGarrisonTravelDays(w,u,route);
    expect(result?.targets.find(x=>x.province===incheon)?.estimatedDays)
      .toBeCloseTo(estimatedDays,8);
    expect(result?.targets.find(x=>x.province===jeju)?.estimatedDays).toBeUndefined();
    expect(result?.targets.find(x=>x.province===incheon)?.hops).toBe(route.length-1);
    expect(hashWorld(w)).toBe(before);
    expect(u.path).toEqual([]);
  });

  it('reports an unreachable island without spending the remaining A* budget',async()=>{
    const {w,c,incheon,jeju}=await fixture();
    const before=hashWorld(w);
    // The mainland target uses the only permitted A* call. The island has
    // no land connection and can be rejected without claiming an extra check.
    const diagnosis=diagnoseGarrisonRoutes(w,1,c,1);
    expect(diagnosis?.pathChecks).toBe(1);
    expect(diagnosis?.truncated).toBe(false);
    expect(diagnosis?.targets.find(t=>t.province===incheon)?.status).toBe('routeAvailable');
    expect(diagnosis?.targets.find(t=>t.province===jeju)?.status).toBe('noLandPath');
    expect(diagnosis?.targets.find(t=>t.province===jeju)?.estimatedDays).toBeUndefined();
    expect(hashWorld(w)).toBe(before);
    // Explicit zero-budget requests preserve the previous "not checked"
    // semantics; a connectivity preflight alone is not a user-requested scan.
    const zero=diagnoseGarrisonRoutes(w,1,c,0);
    expect(zero?.pathChecks).toBe(0);
    expect(zero?.truncated).toBe(true);
    expect(zero?.targets.map(t=>t.status)).toEqual(['notChecked','notChecked']);
  });

  it('rejects co-located isolated candidates without unnecessary A* calls',async()=>{
    const {w,c,u,incheon,jeju}=await fixture();
    const another=w.units.find(v=>v.owner===c&&!v.destroyed&&v.id!==u.id)!;
    expect(another).toBeDefined();
    for(const unit of [u,another]){
      unit.loc=jeju;unit.path=[];unit.manualHold=false;unit.encircled=false;unit.frontId=-1;
    }
    w.garrisons[0].provinces=[incheon];
    w.garrisons[0].unitIds=[u.id,another.id];
    const before=hashWorld(w);
    const diagnosis=diagnoseGarrisonRoutes(w,1,c,1);
    expect(diagnosis?.pathChecks).toBe(0);
    expect(diagnosis?.truncated).toBe(false);
    expect(diagnosis?.targets).toMatchObject([{province:incheon,status:'noLandPath'}]);
    expect(hashWorld(w)).toBe(before);
  });

  it('reports a bounded or unavailable check, never guessing a route',async()=>{
    const {w,c,u,incheon,jeju}=await fixture();
    expect(diagnoseGarrisonRoutes(w,1,c,0)?.targets.map(t=>t.status))
      .toEqual(['notChecked','notChecked']);
    expect(diagnoseGarrisonRoutes(w,1,c,0)?.truncated).toBe(true);
    expect(diagnoseGarrisonRoutes(w,1,c,0)?.targets.every(t=>t.estimatedDays===undefined)).toBe(true);
    u.manualHold=true;
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.map(t=>t.status))
      .toEqual(['noEligibleUnits','noEligibleUnits']);
    u.manualHold=false;
    w.garrisons[0].paused=true;
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.map(t=>t.status))
      .toEqual(['paused','paused']);
    w.garrisons[0].paused=false;
    w.garrisons[0].unitIds=[];
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.map(t=>t.status))
      .toEqual(['noEligibleUnits','noEligibleUnits']);
    expect(incheon).not.toBe(jeju);
  });

  it('shows guard, incoming route and lost province without path search',async()=>{
    const {w,c,u,busan,incheon,jeju}=await fixture();
    w.garrisons[0].provinces=[jeju,busan,incheon];
    u.path=[busan,incheon];
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.find(t=>t.province===incheon)?.status).toBe('incoming');
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.find(t=>t.province===busan)?.status).toBe('noEligibleUnits');
    u.path=[];
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.find(t=>t.province===busan)?.status).toBe('guarded');
    const enemy=w.countries.id.indexOf('JPN');
    expect(enemy).toBeGreaterThanOrEqual(0);
    w.prov.controller[jeju]=enemy;
    expect(diagnoseGarrisonRoutes(w,1,c)?.targets.find(t=>t.province===jeju)?.status).toBe('lost');
  });

  it('does not report the last stationed defender as movable while its relief is still incoming',async()=>{
    const {w,c,u,busan,incheon}=await fixture();
    const relief=w.units.find(unit=>unit.owner===c&&!unit.destroyed&&unit.id!==u.id)!;
    expect(relief).toBeDefined();
    const seoul=w.prov.id.indexOf('KR-11');
    expect(seoul).toBeGreaterThanOrEqual(0);
    relief.loc=seoul;
    relief.path=[seoul,busan];
    relief.manualHold=false;relief.encircled=false;relief.frontId=-1;
    w.garrisons[0].provinces=[busan,incheon];
    w.garrisons[0].unitIds=[u.id,relief.id];

    const before=hashWorld(w);
    const pending=diagnoseGarrisonRoutes(w,1,c);
    expect(pending?.targets.find(t=>t.province===busan)?.status).toBe('guarded');
    expect(pending?.targets.find(t=>t.province===incheon)).toMatchObject({
      province:incheon,status:'noEligibleUnits',
    });
    expect(pending?.targets.find(t=>t.province===incheon)?.candidateUnitId).toBeUndefined();
    expect(pending?.pathChecks).toBe(0);
    expect(hashWorld(w)).toBe(before);
    // The existing weekly planner also protects the last physical defender.
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);

    // A relief becomes a real guard only after its movement has completed.
    relief.loc=busan;
    relief.path=[];
    const afterArrival=hashWorld(w);
    const arrived=diagnoseGarrisonRoutes(w,1,c);
    expect(arrived?.targets.find(t=>t.province===incheon)?.status).toBe('routeAvailable');
    expect(planGarrisonMoves(w,w.garrisons[0])).toHaveLength(1);
    expect(hashWorld(w)).toBe(afterArrival);
  });

  it('denies foreign and malformed requests and keeps existing orders untouched',async()=>{
    const {w,c}=await fixture();
    expect(diagnoseGarrisonRoutes(w,1,c+1)).toBeNull();
    expect(diagnoseGarrisonRoutes(w,999999,c)).toBeNull();
    expect(diagnoseGarrisonRoutes(w,0,c)).toBeNull();
    expect(diagnoseGarrisonRoutes(w,Number.NaN,c)).toBeNull();
    const before=hashWorld(w);
    const result=diagnoseGarrisonRoutes(w,1,c,Number.MAX_SAFE_INTEGER);
    expect(result?.pathChecks).toBeLessThanOrEqual(MAX_GARRISON_DIAGNOSTIC_PATH_CHECKS);
    expect(hashWorld(w)).toBe(before);
  });
});
