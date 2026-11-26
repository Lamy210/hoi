import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {hashWorld} from '../../src/engine/core/hash';
import {findPath} from '../../src/engine/systems/movement';
import {createGarrisonRouteLookup,emptyGarrisonRouteCacheStats} from '../../src/engine/military/garrisonRouteCache';
import {optimizeGarrisonBatch} from '../../src/engine/military/garrisonBatchOptimization';
import {planGarrisonMoves} from '../../src/engine/military/garrisons';

async function fixture(){
  const e=await createTestEngine(1,20261127,'KOR'),w=e.world,owner=w.playerCountry;
  const province=(id:string)=>{
    const p=w.prov.id.indexOf(id);
    expect(p,id).toBeGreaterThanOrEqual(0);
    return p;
  };
  const busan=province('KR-26'),incheon=province('KR-28');
  const jeju=province('KR-49'),seoul=province('KR-11');
  const [a,b,reserve]=w.units.filter(u=>u.owner===owner&&!u.destroyed);
  expect(a).toBeDefined();expect(b).toBeDefined();expect(reserve).toBeDefined();
  for(const unit of [a,b,reserve]){
    unit.loc=seoul;unit.path=[];unit.frontId=-1;
    unit.manualHold=false;unit.encircled=false;
  }
  return {e,w,owner,busan,incheon,jeju,seoul,a,b,reserve};
}

describe('per-planning-invocation garrison land-route cache',()=>{
  it('reuses real routes and failed searches, returning independent path arrays',async()=>{
    const {w,owner,busan,incheon,jeju}=await fixture();
    const before=hashWorld(w);
    let underlyingSearches=0;
    const lookup=createGarrisonRouteLookup(w,owner,(world,from,to,country,hostile)=>{
      underlyingSearches++;
      expect(hostile).toBe(false);
      expect(country).toBe(owner);
      return findPath(world,from,to,country,hostile);
    });
    const expected=findPath(w,busan,incheon,owner,false)!;
    expect(expected.length).toBeGreaterThan(1);
    const first=lookup(busan,incheon)!;
    expect(first).toEqual(expected);
    first[0]=-999;
    expect(lookup(busan,incheon)).toEqual(expected);
    expect(underlyingSearches).toBe(1);

    expect(findPath(w,busan,jeju,owner,false)).toBeNull();
    expect(lookup(busan,jeju)).toBeNull();
    expect(lookup(busan,jeju)).toBeNull();
    expect(underlyingSearches).toBe(1);
    expect(hashWorld(w)).toBe(before);

    // A new planning invocation must re-evaluate the current world rather
    // than retaining a path from a previous tick.
    const next=createGarrisonRouteLookup(w,owner,(...args)=>{
      underlyingSearches++;
      return findPath(...args);
    });
    expect(next(busan,incheon)).toEqual(expected);
    expect(underlyingSearches).toBe(2);
  });

  it('reports exact lookup, cache hit and unreachable metrics without changing plans',async()=>{
    const {w,owner,busan,incheon,jeju}=await fixture();
    const stats=emptyGarrisonRouteCacheStats();
    const before=hashWorld(w);
    const route=createGarrisonRouteLookup(w,owner,undefined,stats);
    expect(route(busan,incheon)).not.toBeNull();
    expect(route(busan,incheon)).not.toBeNull();
    expect(route(busan,jeju)).toBeNull();
    expect(route(busan,jeju)).toBeNull();
    expect(stats).toEqual({requests:4,searches:1,hits:2,unreachable:1,disconnected:1});
    expect(hashWorld(w)).toBe(before);
  });

  it('preserves findPath reachability for a sample of routes with blocked provinces',async()=>{
    const {w,owner,busan,incheon,jeju}=await fixture();
    const before=hashWorld(w);
    const lookup=createGarrisonRouteLookup(w,owner);
    const sample=[busan,incheon,jeju, ...w.prov.id
      .map((id,index)=>({id,index}))
      .filter(p=>p.id.startsWith('KR-')||p.id.startsWith('KP-'))
      .slice(0,14).map(p=>p.index)];
    for(const from of sample){
      for(const to of sample){
        // Compare path validity, not path identity, because this preflight
        // only rejects provably disconnected pairs before the original A*.
        expect(lookup(from,to)===null,'route '+from+' -> '+to)
          .toBe(findPath(w,from,to,owner,false)===null);
      }
    }
    expect(hashWorld(w)).toBe(before);
  });

  it('rechecks control changes on the next invocation and does not reject a blocked origin',async()=>{
    const {w,owner,busan,incheon}=await fixture();
    const foreign=w.countries.id.indexOf('PRK');
    expect(foreign).toBeGreaterThanOrEqual(0);
    const originalController=w.prov.controller[incheon];
    // A foreign target cannot be entered without a treaty or access.
    w.prov.controller[incheon]=foreign;
    expect(findPath(w,busan,incheon,owner,false)).toBeNull();
    const stats=emptyGarrisonRouteCacheStats();
    expect(createGarrisonRouteLookup(w,owner,undefined,stats)(busan,incheon)).toBeNull();
    expect(stats.disconnected).toBe(1);
    expect(stats.searches).toBe(0);
    // After control is restored, the next planning invocation must search
    // under current rights rather than preserving the prior rejection.
    w.prov.controller[incheon]=originalController;
    const restored=createGarrisonRouteLookup(w,owner);
    expect(restored(busan,incheon)).toEqual(findPath(w,busan,incheon,owner,false));
    // A blocked origin is intentionally allowed to exit in the original
    // pathfinder, so the component prefilter must not create a false negative.
    w.prov.controller[busan]=foreign;
    const fromForeign=createGarrisonRouteLookup(w,owner);
    expect(fromForeign(busan,incheon)).toEqual(findPath(w,busan,incheon,owner,false));
  });

  it('deduplicates stacked divisions across greedy selection and allocation without changing outcomes',async()=>{
    const {e,w,owner,busan,incheon,seoul,a,b,reserve}=await fixture();
    const before=hashWorld(w);
    let requests=0,searches=0;
    const shared=createGarrisonRouteLookup(w,owner,(...args)=>{
      searches++;
      return findPath(...args);
    });
    const route=(from:number,to:number)=>{
      requests++;
      return shared(from,to);
    };
    const first=route(seoul,busan),second=route(seoul,incheon);
    expect(first?.length).toBeGreaterThan(1);
    expect(second?.length).toBeGreaterThan(1);
    const proposed=[
      {unitId:a.id,target:busan,path:first!},
      {unitId:b.id,target:incheon,path:second!},
    ];
    const optimized=optimizeGarrisonBatch(w,proposed,[reserve],route);
    const independent=optimizeGarrisonBatch(w,proposed,[reserve]);
    expect(optimized).toEqual(independent);
    expect(optimized.map(p=>p.target)).toEqual([busan,incheon]);
    // 2 initial lookups + 4 non-diagonal combinations, but only two
    // unique origin/target pairs are searched because all three share Seoul.
    expect(requests).toBe(6);
    expect(searches).toBe(2);
    expect(hashWorld(w)).toBe(before);

    w.garrisons=[{
      id:1,owner,provinces:[busan,incheon],
      unitIds:[a.id,b.id,reserve.id],paused:false,revision:1,
    }];
    w.nextGarrisonId=2;
    const hash=hashWorld(w);
    const planned=planGarrisonMoves(w,w.garrisons[0]);
    expect(planned.map(p=>p.target)).toEqual([busan,incheon]);
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual(planned);
    expect(hashWorld(w)).toBe(hash);
    const serialized=e.serialize();
    const restored=await createTestEngine(1,20261127,'KOR');
    expect(restored.loadFrom(serialized).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hash);
    expect(planGarrisonMoves(restored.world,restored.world.garrisons[0])).toEqual(planned);
    for(let day=0;day<7;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+day).toBe(hashWorld(w));
    }
  });
});
