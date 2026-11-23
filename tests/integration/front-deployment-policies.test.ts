import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {planFrontDeployment} from '../../src/engine/military/frontDeployment';

async function fixture() {
  const e=await createTestEngine(1,911,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  const provinces=['KR-41','KR-11'].map(id=>w.prov.id.indexOf(id));
  expect(provinces.every(p=>p>=0&&w.prov.controller[p]===c)).toBe(true);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(issue('createFront',{enemy,provinces}).ok).toBe(true);
  const front=w.fronts[0];
  const units=w.units.filter(u=>u.owner===c&&!u.destroyed).slice(0,2);
  expect(units).toHaveLength(2);
  // Both units start in one rear/front tile: even mode should fill the next slot.
  for(const u of units){
    u.loc=provinces[0];u.path=[];u.segIdx=0;u.segDays=0;u.segProgress=0;
    u.manualHold=false;u.encircled=false;
  }
  return {e,w,c,enemy,front,units,provinces,issue};
}

describe('atomic front deployment modes',()=>{
  it('evenly spreads two divisions instead of stacking them, and survives save/load/replay',async()=>{
    const {e,w,c,front,units,provinces,issue}=await fixture();
    const ids=units.map(u=>u.id);
    const before=hashWorld(w);
    const plan=planFrontDeployment(w,c,front.id,front.revision,ids,'even');
    expect(plan.reason).toBeNull();
    expect(plan.orders).toHaveLength(2);
    expect(new Set(plan.orders.map(o=>o.target)).size).toBe(2);
    expect(plan.orders.every(o=>provinces.includes(o.target))).toBe(true);
    expect(hashWorld(w)).toBe(before);
    expect(issue('deployToFront',{frontId:front.id,expectedRevision:front.revision,
      units:ids,strategy:'even'}).ok).toBe(true);
    for(const order of plan.orders){
      const unit=w.units.find(u=>u.id===order.unitId)!;
      expect(unit.frontId).toBe(front.id);
      expect(unit.path).toEqual(order.path);
      expect(unit.manualHold).toBe(false);
    }
    const restored=await createTestEngine(1,911,'KOR'),saved=e.serialize();
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let day=0;day<7;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+day).toBe(hashWorld(w));
    }
  });

  it('strategic and nearest modes produce deterministic, legal, non-mutating plans',async()=>{
    const {w,c,front,units,provinces}=await fixture();
    const ids=units.map(u=>u.id);
    const hash=hashWorld(w);
    for(const mode of ['strategic','nearest'] as const){
      const first=planFrontDeployment(w,c,front.id,front.revision,ids,mode);
      const second=planFrontDeployment(w,c,front.id,front.revision,[...ids].reverse(),mode);
      expect(first.reason).toBeNull();
      expect(first).toEqual(second);
      expect(first.orders.every(o=>provinces.includes(o.target))).toBe(true);
      if(mode==='nearest')expect(first.orders.map(o=>o.target)).toEqual([provinces[0],provinces[0]]);
    }
    expect(hashWorld(w)).toBe(hash);
  });

  it('rejects duplicate/foreign/held/active or stale batches atomically',async()=>{
    const {w,c,front,units,issue}=await fixture();
    const ids=units.map(u=>u.id);
    const foreign=w.units.find(u=>u.owner!==c)!;
    const baseline=units.map(u=>({frontId:u.frontId,path:[...u.path]}));
    const bad=[
      {units:[ids[0],ids[0]],strategy:'even',expectedRevision:front.revision,reason:'badParams'},
      {units:[ids[0],foreign.id],strategy:'even',expectedRevision:front.revision,reason:'notYourUnit'},
      {units:ids,strategy:'invalid',expectedRevision:front.revision,reason:'badParams'},
      {units:ids,strategy:'even',expectedRevision:0,reason:'staleFrontOrder'},
    ];
    for(const payload of bad){
      const result=issue('deployToFront',{frontId:front.id,...payload});
      expect(result.reason).toBe(payload.reason);
      expect(units.map(u=>({frontId:u.frontId,path:[...u.path]}))).toEqual(baseline);
    }
    units[0].manualHold=true;
    expect(issue('deployToFront',{frontId:front.id,expectedRevision:front.revision,units:ids,
      strategy:'strategic'}).reason).toBe('unitBusy');
    expect(units.map(u=>({frontId:u.frontId,path:[...u.path]}))).toEqual(baseline);
    units[0].manualHold=false;
    expect(issue('deployToFront',{frontId:front.id,expectedRevision:front.revision,units:ids,
      strategy:'nearest'}).ok).toBe(true);
  });
});
