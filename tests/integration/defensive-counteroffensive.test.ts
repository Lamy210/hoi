import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {startWar} from '../../src/engine/military/war';
import {chooseRetreatProvince} from '../../src/engine/systems/combat';
import {runFront} from '../../src/engine/systems/fronts';
import {operationalFrontProvinces,AUTO_ATTACK_MIN_ORG,COUNTERATTACK_MIN_ORG} from '../../src/engine/military/fronts';
import {hashWorld} from '../../src/engine/core/hash';

async function fixture(){
  const engine=await createTestEngine(1,4097,'KOR'),w=engine.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  const border=w.prov.id.indexOf('KR-41'), hostile=w.prov.id.indexOf('KP-07');
  expect(border).toBeGreaterThanOrEqual(0);
  expect(hostile).toBeGreaterThanOrEqual(0);
  const rear=w.adj.targets.slice(w.adj.offsets[border],w.adj.offsets[border+1])
    .find(p=>w.prov.controller[p]===c&&p!==border);
  expect(rear).toBeDefined();
  const prototype=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  const mk=(loc:number)=>({...prototype,id:w.nextUnitId++,loc,path:[],
    segIdx:0,segProgress:0,segDays:0,org:100,manualHold:false,
    frontId:-1,armyId:null,commanderId:-1,encircled:false,destroyed:false});
  const guard=mk(border),reserve=mk(rear!);
  w.units=w.units.filter(u=>u.owner!==c);
  w.units.push(guard,reserve);
  startWar(w,c,enemy,false);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(issue('createFront',{enemy,provinces:[border]}).ok).toBe(true);
  const front=w.fronts[0];
  expect(issue('assignToFront',{frontId:front.id,units:[guard.id,reserve.id]}).ok).toBe(true);
  return {engine,w,c,enemy,border,hostile,rear:rear!,guard,reserve,front,issue};
}

describe('defense, counterattack and operational reorganization',()=>{
  it('retreats only to a friendly, safe land province and never into a neutral state',async()=>{
    const {w,c,enemy,border,hostile,guard}=await fixture();
    guard.loc=hostile;
    expect(w.prov.controller[hostile]).toBe(enemy);
    const retreat=chooseRetreatProvince(w,guard);
    expect(retreat).not.toBeNull();
    expect(w.prov.controller[retreat!]).toBe(c);
    // The former friendly escape is now neutral: do not trespass.
    const neutral=w.countries.id.indexOf('JPN');
    for(let i=w.adj.offsets[hostile];i<w.adj.offsets[hostile+1];i++){
      const p=w.adj.targets[i];
      if(w.prov.controller[p]===c)w.prov.controller[p]=neutral;
    }
    expect(w.prov.controller[border]).toBe(neutral);
    expect(chooseRetreatProvince(w,guard)).toBeNull();
  });

  it('sends a healthy reserve to a threatened defensive position, respects manual hold',async()=>{
    const {w,enemy,border,hostile,guard,reserve,front,issue}=await fixture();
    expect(issue('setFrontStance',{frontId:front.id,stance:'hold',cap:0}).ok).toBe(true);
    // An enemy at the border with overwhelming manpower makes this position threatened.
    const base=w.units.find(u=>u.owner===enemy&&!u.destroyed)!;
    const invading={...base,id:w.nextUnitId++,loc:hostile,path:[],
      segIdx:0,segProgress:0,segDays:0,org:100,manpower:100_000,maxManpower:100_000,
      manualHold:false,encircled:false,destroyed:false};
    w.units.push(invading);
    expect(guard.loc).toBe(border);
    reserve.manualHold=true;
    runFront(w,front,()=>0.5);
    expect(w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove')).toEqual([]);
    reserve.manualHold=false;
    runFront(w,front,()=>0.5);
    const orders=w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove');
    expect(orders.map(x=>x.p.unitId)).toEqual([reserve.id]);
    expect(orders[0].p.target).toBe(border);
  });

  it('recovers before counterattacking, retakes a lost owned province and updates the map',async()=>{
    const {engine,w,c,enemy,border,hostile,rear,guard,reserve,front,issue}=await fixture();
    w.prov.controller[border]=enemy;
    guard.loc=rear;
    reserve.manualHold=true;
    expect(issue('setFrontStance',{frontId:front.id,stance:'counterattack',cap:1}).ok).toBe(true);
    expect(operationalFrontProvinces(w,front)).toContain(rear);
    const defender=w.units.find(u=>u.owner===enemy&&!u.destroyed)!;
    defender.loc=border;defender.path=[];defender.segIdx=0;defender.segDays=0;
    defender.org=19;
    guard.org=COUNTERATTACK_MIN_ORG-1;
    runFront(w,front,()=>0.5);
    expect(w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove')).toEqual([]);
    guard.org=100;
    runFront(w,front,()=>0.5);
    const pending=w.runtime.commandsSinceLastTick.splice(0).filter(x=>x.type==='frontMove');
    expect(pending).toHaveLength(1);
    expect(pending[0].p.unitId).toBe(guard.id);
    expect(pending[0].p.target).toBe(border);
    guard.org=COUNTERATTACK_MIN_ORG-1;
    expect(applyCommands(w,pending)[0].reason).toBe('staleFrontOrder');
    guard.org=100;
    // Re-queue using a fresh AI sequence rather than replaying a spent command.
    runFront(w,front,()=>0.5);
    const next=w.runtime.commandsSinceLastTick.splice(0).filter(x=>x.type==='frontMove');
    expect(next).toHaveLength(1);
    expect(applyCommands(w,next)[0].ok).toBe(true);
    guard.segDays=1;
    for(let tick=0;tick<4&&w.prov.controller[border]!==c;tick++)engine.stepTick();
    expect(w.prov.controller[border]).toBe(c);
    expect(w.prov.owner[border]).toBe(c);
    expect(engine.getUiSnapshot(0).controller[border]).toBe(c);
    expect(w.prov.controller[hostile]).toBe(enemy);
  });

  it('keeps aggressive front automation idle during reorganization and accepts saved counterattack stance',async()=>{
    const {engine,w,c,enemy,border,hostile,guard,reserve,front,issue}=await fixture();
    reserve.manualHold=true;
    guard.org=AUTO_ATTACK_MIN_ORG-1;
    w.units=w.units.filter(u=>u.owner!==enemy||u.loc!==hostile);
    expect(issue('setFrontStance',{frontId:front.id,stance:'attack',cap:1}).ok).toBe(true);
    const before=hashWorld(w);
    runFront(w,front,()=>0.5);
    expect(w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove')).toEqual([]);
    expect(hashWorld(w)).toBe(before);
    guard.org=AUTO_ATTACK_MIN_ORG;
    runFront(w,front,()=>0.5);
    const queued=w.runtime.commandsSinceLastTick.splice(0).filter(x=>x.type==='frontMove');
    expect(queued).toHaveLength(1);
    guard.org=AUTO_ATTACK_MIN_ORG-1;
    expect(applyCommands(w,queued)[0].reason).toBe('staleFrontOrder');
    expect(issue('setFrontStance',{frontId:front.id,stance:'counterattack',cap:2}).ok).toBe(true);
    const saved=engine.serialize();
    const restored=await createTestEngine(1,4097,'KOR');
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(restored.world.fronts[0].stance).toBe('counterattack');
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    expect(w.prov.controller[border]).toBe(c);
  });
});
