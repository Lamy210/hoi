import {describe,expect,it} from 'vitest';
import {createTestEngine,loadTestPack} from '../helpers';
import {portCapacitiesFromPack} from '../../src/engine/naval/portDefense';
import {rankGarrisonTargets} from '../../src/engine/military/garrisonPriorities';
import {planGarrisonMoves} from '../../src/engine/military/garrisons';
import {diagnoseGarrisonRoutes} from '../../src/engine/military/garrisonRouteDiagnostics';
import {hashWorld} from '../../src/engine/core/hash';

async function fixture(){
  const e=await createTestEngine(1,20261126,'KOR'),w=e.world,c=w.playerCountry;
  const index=(id:string)=>{const p=w.prov.id.indexOf(id);expect(p,id).toBeGreaterThanOrEqual(0);return p};
  const busan=index('KR-26'),incheon=index('KR-28'),capital=index('KR-11'),coast=index('KR-42');
  const division=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  division.loc=capital;division.path=[];division.manualHold=false;division.encircled=false;division.frontId=-1;
  const order={id:1,owner:c,provinces:[incheon,busan],unitIds:[division.id],paused:false,revision:1};
  w.garrisons=[order];w.nextGarrisonId=2;
  return {e,w,c,order,division,busan,incheon,capital,coast};
}

describe('catalogued port defenses without changing save schemas',()=>{
  it('builds capacity from actual port catalog rather than all coastal provinces',async()=>{
    const {e,w,busan,incheon,coast,capital}=await fixture();
    const projected=portCapacitiesFromPack(e.pack);
    expect(projected).toHaveLength(w.prov.count);
    expect(projected[busan]).toBe(110);
    expect(projected[incheon]).toBe(80);
    expect(projected[coast]).toBe(0);
    expect(projected[capital]).toBe(0);
    expect(w.runtime.portCapacities).toEqual(projected);
    expect(portCapacitiesFromPack({...e.pack,maritime:undefined}))
      .toEqual(new Array<number>(w.prov.count).fill(0));
    expect(portCapacitiesFromPack(e.pack)).toEqual(projected);
  });

  it('ranks catalogued ports by capacity before a non-port coast and uses the order in movement planning',async()=>{
    const {w,c,order,busan,incheon,coast,division}=await fixture();
    order.provinces=[coast,incheon,busan];
    const before=hashWorld(w);
    const result=rankGarrisonTargets(w,order);
    expect(result.map(p=>p.province)).toEqual([busan,incheon,coast]);
    expect(result.map(p=>p.reason)).toEqual(['port','port','coastal']);
    expect(result.map(p=>p.portCapacity)).toEqual([110,80,0]);
    expect(planGarrisonMoves(w,order)[0]?.target).toBe(busan);
    expect(diagnoseGarrisonRoutes(w,1,c,0)?.targets.map(p=>p.priorityReason))
      .toEqual(['port','port','coastal']);
    expect(division.path).toEqual([]);
    expect(hashWorld(w)).toBe(before);
  });

  it('keeps capital ahead of ports and hostile defense ahead of the capital',async()=>{
    const {w,c,order,busan,capital}=await fixture();
    order.provinces=[busan,capital];
    expect(rankGarrisonTargets(w,order).map(p=>p.province)).toEqual([capital,busan]);
    const enemy=w.countries.id.indexOf('PRK');
    const border=w.prov.id.indexOf('KR-42');
    expect(enemy).toBeGreaterThanOrEqual(0);
    w.wars.push({id:777,aggressor:c,defender:enemy,startTick:w.tick,cb:false,
      status:'active',offeredBy:-1,offerType:-1,offerDemands:[],endTick:-1,contrib:{}});
    order.provinces=[busan,border,capital];
    expect(rankGarrisonTargets(w,order)[0].province).toBe(border);
  });

  it('reconstructs catalog-derived capacity after load without saving it or changing world hash',async()=>{
    const {e,w,c,order,busan,incheon}=await fixture();
    const saved=e.serialize(),hash=hashWorld(w),initial=rankGarrisonTargets(w,order);
    // A runtime cache mutation must never affect saved bytes or integrity.
    w.runtime.portCapacities![busan]=5;
    expect(hashWorld(w)).toBe(hash);
    expect(e.serialize()).toEqual(saved);
    const restored=await createTestEngine(1,20261126,'KOR');
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hash);
    expect(restored.world.runtime.portCapacities?.[busan]).toBe(110);
    expect(restored.world.runtime.portCapacities?.[incheon]).toBe(80);
    expect(rankGarrisonTargets(restored.world,restored.world.garrisons[0])).toEqual(initial);
    expect(diagnoseGarrisonRoutes(restored.world,1,c,0)?.targets.map(t=>t.portCapacity)).toEqual([110,80]);
    for(let tick=0;tick<10;tick++){
      e.loadFrom(saved); // reset runtime cache to verified pack before deterministic steps
      break;
    }
    expect(e.loadFrom(saved).ok).toBe(true);
    for(let tick=0;tick<14;tick++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(e.world),'tick '+tick).toBe(hashWorld(restored.world));
    }
  });
});
