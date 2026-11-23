import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {startWar} from '../../src/engine/military/war';
import {hashWorld} from '../../src/engine/core/hash';
import {FRONTLINE_READY_ORG,selectCombatFront} from '../../src/engine/military/unitComposition';
import {projectCombatFronts} from '../../src/engine/military/combatFrontProjection';
import {reinforceIdleUnits} from '../../src/engine/systems/reinforcement';

async function battleFixture(){
  const e=await createTestEngine(1,8182,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK'),loc=w.countries.capital[c];
  const original=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  const foe=w.units.find(u=>u.owner===enemy&&!u.destroyed)!;
  w.prov.terrain[loc]=2; // mountainous width=4*20
  startWar(w,c,enemy,false);
  // This fixture intentionally creates controlled cohorts with equal widths.
  // Do not use the synthetic roster for a persistence test.
  w.units=[
    ...Array.from({length:5},(_,i)=>({...original,id:96000+i,loc,owner:c,org:100,
      path:[],segIdx:0,segProgress:0,segDays:0,frontlinePriority:5,
      manualHold:true,destroyed:false,encircled:false,
      manpower:original.maxManpower,infEquipment:original.maxInfEquipment,
      artEquipment:original.maxArtEquipment})),
    {...foe,id:96100,loc,owner:enemy,org:100,path:[],segIdx:0,segProgress:0,
      segDays:0,manualHold:true,destroyed:false,encircled:false,
      manpower:foe.maxManpower,infEquipment:foe.maxInfEquipment,
      artEquipment:foe.maxArtEquipment},
  ];
  w.nextUnitId=97000;
  w.countries.infEquipmentStock[c]=Math.max(1000,w.countries.infEquipmentStock[c]);
  w.countries.manpowerPool[c]=Math.max(10000,w.countries.manpowerPool[c]);
  w.runtime.supplyDirty=true;
  return {e,w,c,enemy,loc};
}

describe('real combat reserve rotation and recovery',()=>{
  it('prioritizes ready divisions while preserving priority within readiness tiers',async()=>{
    const {w}=await battleFixture();
    const exhausted=w.units.find(u=>u.id===96000)!;
    exhausted.frontlinePriority=9;
    exhausted.org=40;
    const before=hashWorld(w);
    const front=projectCombatFronts(w)[0].defenders;
    expect(front.engagedIds).toEqual([96001,96002,96003,96004]);
    expect(front.reserveIds).toContain(exhausted.id);
    expect(hashWorld(w)).toBe(before);
    exhausted.org=FRONTLINE_READY_ORG;
    const rejoined=projectCombatFronts(w)[0].defenders;
    expect(rejoined.engagedIds).toEqual([96000,96001,96002,96003]);
    expect(rejoined.reserveIds).toEqual([96004]);
    exhausted.org=FRONTLINE_READY_ORG-1;
    expect(projectCombatFronts(w)[0].defenders.reserveIds).toContain(exhausted.id);
  });

  it('recovers the exhausted defender on its tile, while frontline divisions take actual losses',async()=>{
    const {e,w,loc}=await battleFixture();
    const exhausted=w.units.find(u=>u.id===96000)!;
    exhausted.org=40;
    exhausted.frontlinePriority=9; // high priority does not override fatigue
    exhausted.infEquipment=Math.max(0,exhausted.maxInfEquipment-50);
    const initialEquipped=exhausted.infEquipment;
    const fighters=w.units.filter(u=>u.owner===w.playerCountry&&u.id!==exhausted.id);
    const locations=w.units.map(u=>[u.id,u.loc,u.path.slice()] as const);
    expect(projectCombatFronts(w)[0].defenders.reserveIds).toContain(exhausted.id);
    e.stepTick();
    expect(exhausted.org).toBeGreaterThan(40);
    expect(exhausted.infEquipment).toBeGreaterThan(initialEquipped);
    expect(fighters.some(u=>u.org<100)).toBe(true);
    expect(exhausted.loc).toBe(loc);
    expect(exhausted.path).toEqual([]);
    for(const [id,position] of locations){
      const u=w.units.find(x=>x.id===id);
      if(u)expect(u.loc).toBe(position);
    }
  });

  it('refills only friendly controlled reserves, not engaged troops or enemy-side waiting attackers',async()=>{
    const {w,c,enemy,loc}=await battleFixture();
    const defending=w.units.find(u=>u.id===96000)!;
    const attacker=w.units.find(u=>u.id===96100)!;
    defending.infEquipment=defending.maxInfEquipment-50;
    attacker.infEquipment=attacker.maxInfEquipment-50;
    const beforeDef=defending.infEquipment,beforeAtt=attacker.infEquipment;
    reinforceIdleUnits(w,new Set([loc]),new Set([attacker.id]));
    expect(defending.infEquipment).toBeGreaterThan(beforeDef);
    expect(attacker.infEquipment).toBe(beforeAtt);
    expect(w.prov.controller[loc]).toBe(c);
    // Captured or hostile provinces are never a free refit station for attackers.
    w.prov.controller[loc]=enemy;
    defending.infEquipment=beforeDef;
    attacker.infEquipment=beforeAtt;
    reinforceIdleUnits(w,new Set([loc]),new Set());
    expect(defending.infEquipment).toBe(beforeDef);
  });

  it('uses the fatigued frontline as a last resort if every healthy slot is filled or unavailable',async()=>{
    const {w}=await battleFixture();
    const owner=w.playerCountry;
    const units=w.units.filter(u=>u.owner===owner);
    units.forEach(u=>u.org=15);
    units[0].frontlinePriority=9;
    const chosen=selectCombatFront(w,units,4);
    expect(chosen.units.map(u=>u.id)).toEqual([96000,96001,96002,96003]);
    expect(chosen.penalties).toEqual([1,1,1,1]);
    expect(selectCombatFront(w,[units[0]],.5).penalties).toEqual([.5]);
  });

  it('keeps save-and-replay hashes stable in full-world battles',async()=>{
    const e=await createTestEngine(1,8182,'KOR'),w=e.world,c=w.playerCountry;
    const enemy=w.countries.id.indexOf('PRK'),loc=w.countries.capital[c];
    startWar(w,c,enemy,false);
    const attacker=w.units.find(u=>u.owner===enemy&&!u.destroyed)!;
    Object.assign(attacker,{loc,path:[],segIdx:0,segProgress:0,segDays:0,
      org:100,manualHold:true,encircled:false});
    w.runtime.supplyDirty=true;
    const restored=await createTestEngine(1,8182,'KOR');
    const saved=e.serialize();
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let i=0;i<16;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+i).toBe(hashWorld(w));
    }
  });
});
