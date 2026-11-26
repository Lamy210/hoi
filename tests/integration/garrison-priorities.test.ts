import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {hashWorld} from '../../src/engine/core/hash';
import {rankGarrisonTargets} from '../../src/engine/military/garrisonPriorities';
import {planGarrisonMoves} from '../../src/engine/military/garrisons';
import {diagnoseGarrisonRoutes} from '../../src/engine/military/garrisonRouteDiagnostics';
import type {War} from '../../src/engine/core/state';

async function fixture(){
  const e=await createTestEngine(1,20261126,'KOR');
  const w=e.world,c=w.playerCountry;
  const index=(id:string)=>{
    const p=w.prov.id.indexOf(id);
    expect(p,id).toBeGreaterThanOrEqual(0);
    return p;
  };
  const capital=index('KR-11'),coast=index('KR-26'),border=index('KR-42'),origin=index('KR-41');
  const unit=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  unit.loc=origin;unit.path=[];unit.segIdx=0;unit.segProgress=0;unit.segDays=0;
  unit.manualHold=false;unit.encircled=false;unit.frontId=-1;
  const order={id:1,owner:c,provinces:[coast,capital],unitIds:[unit.id],paused:false,revision:1};
  w.garrisons=[order];
  w.nextGarrisonId=2;
  return {e,w,c,unit,order,capital,coast,border,origin};
}

describe('threat-aware garrison target priorities',()=>{
  it('prefers the capital to a coastal site in peacetime regardless of province ID order',async()=>{
    const {w,order,capital,coast,unit}=await fixture();
    expect(coast).toBeLessThan(capital);
    const before=hashWorld(w);
    const priorities=rankGarrisonTargets(w,order);
    expect(priorities.map(x=>x.province)).toEqual([capital,coast]);
    expect(priorities.map(x=>x.reason)).toEqual(['capital','coastal']);
    expect(planGarrisonMoves(w,order)).toMatchObject([{unitId:unit.id,target:capital}]);
    expect(hashWorld(w)).toBe(before);
  });

  it('promotes active hostile borders above the capital, but not in peacetime',async()=>{
    const {w,c,order,border,capital}=await fixture();
    order.provinces=[capital,border];
    expect(rankGarrisonTargets(w,order)[0].province).toBe(capital);
    const enemy=w.countries.id.indexOf('PRK');
    expect(enemy).toBeGreaterThanOrEqual(0);
    const war:War={id:999,aggressor:c,defender:enemy,startTick:w.tick,cb:false,
      status:'active',offeredBy:-1,offerType:-1,offerDemands:[],endTick:-1,contrib:{}};
    w.wars.push(war);
    const ranked=rankGarrisonTargets(w,order);
    expect(ranked[0]).toMatchObject({province:border,reason:'hostileBorder',hostileNeighbors:1});
    expect(ranked[1]).toMatchObject({province:capital,reason:'capital'});
    expect(planGarrisonMoves(w,order)[0]?.target).toBe(border);
    war.status='ended';
    expect(rankGarrisonTargets(w,order)[0].province).toBe(capital);
  });

  it('uses stable tiebreakers and never treats a generic coast as a verified port',async()=>{
    const {w,order,c,coast}=await fixture();
    const incheon=w.prov.id.indexOf('KR-28');
    expect(incheon).toBeGreaterThanOrEqual(0);
    order.provinces=[incheon,coast];
    const a=rankGarrisonTargets(w,order),b=rankGarrisonTargets(w,{owner:c,provinces:[coast,incheon]});
    expect(a).toEqual(b);
    expect(a.map(p=>p.reason)).toEqual(['coastal','coastal']);
    expect(a.map(p=>p.province)).toEqual([coast,incheon]); // Busan has higher population
    w.prov.controller[coast]=w.countries.id.indexOf('JPN');
    expect(rankGarrisonTargets(w,order).map(p=>p.province)).toEqual([incheon]);
  });

  it('keeps the existing last-guard and manual-hold protections',async()=>{
    const {w,order,unit,capital,coast}=await fixture();
    unit.loc=capital;
    expect(planGarrisonMoves(w,order)).toEqual([]);
    unit.loc=w.prov.id.indexOf('KR-41');
    unit.manualHold=true;
    expect(planGarrisonMoves(w,order)).toEqual([]);
    unit.manualHold=false;
    expect(planGarrisonMoves(w,order)).toHaveLength(1);
    expect(planGarrisonMoves(w,order)[0].target).toBe(capital);
    expect(order.provinces).toEqual([coast,capital]);
  });

  it('exposes the same ranking via read-only diagnostics, preserving order across save/load',async()=>{
    const {e,w,c,order,capital,coast}=await fixture();
    const before=hashWorld(w);
    const diag=diagnoseGarrisonRoutes(w,1,c,0);
    expect(diag?.targets.map(t=>t.province)).toEqual([capital,coast]);
    expect(diag?.targets.map(t=>t.priorityRank)).toEqual([1,2]);
    expect(diag?.targets.map(t=>t.priorityReason)).toEqual(['capital','coastal']);
    expect(diag?.targets.map(t=>t.status)).toEqual(['notChecked','notChecked']);
    expect(hashWorld(w)).toBe(before);
    const restored=await createTestEngine(1,20261126,'KOR');
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(before);
    expect(rankGarrisonTargets(restored.world,restored.world.garrisons[0]))
      .toEqual(rankGarrisonTargets(w,order));
  });
});
