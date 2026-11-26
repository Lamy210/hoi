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
    expect(ranked[0]).toMatchObject({province:border,hostileNeighbors:1});
    expect(ranked[0].reason).toBe(ranked[0].hostileDivisions>0?'hostileForces':'hostileBorder');
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

  it('uses observed enemy concentrations to prioritize an equally exposed frontier',async()=>{
    const {w,c,order,unit,capital}=await fixture();
    const west=w.prov.id.indexOf('KR-41'),east=w.prov.id.indexOf('KR-42');
    const enemyProvince=w.prov.id.indexOf('KR-47');
    const enemy=w.countries.id.indexOf('PRK');
    expect(west).toBeGreaterThanOrEqual(0);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(enemyProvince).toBeGreaterThanOrEqual(0);
    expect(enemy).toBeGreaterThanOrEqual(0);
    unit.loc=capital;
    order.provinces=[east,west];
    w.wars.push({id:1001,aggressor:enemy,defender:c,startTick:w.tick,cb:false,
      status:'active',offeredBy:-1,offerType:-1,offerDemands:[],endTick:-1,contrib:{}});
    // Enemy occupation creates two hostile borders for each objective:
    // west: KP-06/KP-07, east: KP-07/KR-47.
    w.prov.controller[enemyProvince]=enemy;
    const enemyUnits=w.units.filter(u=>u.owner===enemy&&!u.destroyed);
    expect(enemyUnits.length).toBeGreaterThanOrEqual(3);
    const far=w.prov.id.indexOf('KP-01');
    for(const u of enemyUnits)u.loc=far;
    const baseline=rankGarrisonTargets(w,order);
    expect(baseline.map(x=>x.hostileNeighbors)).toEqual([2,2]);
    const previous=baseline[0].province;
    // Test the new pressure signal independently of the prior border count:
    // concentrate forces beside whichever objective was previously second.
    const target=baseline[1].province;
    const localEnemyProvince=target===east?enemyProvince:w.prov.id.indexOf('KP-06');
    for(const u of enemyUnits.slice(0,3))u.loc=localEnemyProvince;
    const before=hashWorld(w);
    const ranked=rankGarrisonTargets(w,order);
    expect(ranked[0]).toMatchObject({
      province:target,hostileNeighbors:2,hostileDivisions:3,reason:'hostileForces',
    });
    expect(ranked[1]).toMatchObject({province:previous,hostileNeighbors:2,hostileDivisions:0});
    expect(planGarrisonMoves(w,order)[0]?.target).toBe(target);
    expect(diagnoseGarrisonRoutes(w,1,c,0)?.targets[0]).toMatchObject({
      province:target,priorityRank:1,priorityReason:'hostileForces',hostileDivisions:3,
    });
    expect(hashWorld(w)).toBe(before);
    // Destroyed enemy divisions must not inflate threat.
    enemyUnits[0].destroyed=true;
    expect(rankGarrisonTargets(w,order)[0].hostileDivisions).toBe(2);
    // A peace agreement removes the threat signal even if the units remain nearby.
    w.wars[w.wars.length-1].status='ended';
    expect(rankGarrisonTargets(w,order).every(p=>p.hostileDivisions===0)).toBe(true);
    expect(rankGarrisonTargets(w,order).every(p=>p.hostileNeighbors===0)).toBe(true);
  });

  it('ignores neutral and destroyed foreign divisions even beside a hostile border',async()=>{
    const {w,c,order,border}=await fixture();
    order.provinces=[border];
    const enemy=w.countries.id.indexOf('PRK');
    const japan=w.countries.id.indexOf('JPN');
    w.wars.push({id:1002,aggressor:enemy,defender:c,startTick:w.tick,cb:false,
      status:'active',offeredBy:-1,offerType:-1,offerDemands:[],endTick:-1,contrib:{}});
    const kp07=w.prov.id.indexOf('KP-07');
    const hostile=w.units.find(u=>u.owner===enemy&&!u.destroyed)!;
    const neutral=w.units.find(u=>u.owner===japan&&!u.destroyed)!;
    for(const u of w.units.filter(u=>u.owner===enemy))u.loc=w.prov.id.indexOf('KP-01');
    hostile.loc=kp07;
    neutral.loc=kp07;
    const before=hashWorld(w);
    expect(rankGarrisonTargets(w,order)[0].hostileDivisions).toBe(1);
    hostile.destroyed=true;
    expect(rankGarrisonTargets(w,order)[0].hostileDivisions).toBe(0);
    expect(hashWorld(w)).not.toBe(before);
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
