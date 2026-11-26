import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {findPath} from '../../src/engine/systems/movement';
import {runGarrison} from '../../src/engine/systems/garrisons';
import {planGarrisonMoves,validateGarrisons} from '../../src/engine/military/garrisons';
import {deserializeWorld,savePayloadChecksum,SAVE_SCHEMA_VERSION,type SaveHeader} from '../../src/engine/save/serialize';

async function fixture(){
  const e=await createTestEngine(1,9172,'KOR'),w=e.world,c=w.playerCountry;
  const own=w.units.filter(u=>u.owner===c&&!u.destroyed);
  expect(own.length).toBeGreaterThanOrEqual(2);
  const unit=own[0];
  const target=w.prov.controller.findIndex((controller,p)=>controller===c&&p!==unit.loc&&
    (findPath(w,unit.loc,p,c,false)?.length??0)>1);
  expect(target).toBeGreaterThanOrEqual(0);
  let seq=0;
  const cmd=(type:string,p:Record<string,unknown>,issuer='player')=>
    applyCommands(w,[{issuer,seq:++seq,type,p}])[0];
  return {e,w,c,unit,target,own,cmd};
}

describe('designated province garrison and deterministic movement',()=>{
  it('creates a defensive order and actually issues a validated land movement',async()=>{
    const {e,w,c,unit,target,cmd}=await fixture();
    const original=unit.loc;
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    expect(w.garrisons).toHaveLength(1);
    const before=hashWorld(w);
    const plan=planGarrisonMoves(w,w.garrisons[0]);
    expect(plan.map(p=>p.unitId)).toEqual([unit.id]);
    expect(plan[0].path[0]).toBe(original);
    expect(plan[0].path[plan[0].path.length-1]).toBe(target);
    expect(hashWorld(w)).toBe(before);
    runGarrison(w,1);
    const queued=w.runtime.commandsSinceLastTick.find(c=>c.type==='garrisonMove');
    expect(queued?.p.target).toBe(target);
    e.stepTick();
    expect(unit.loc!==original||unit.path.length>1).toBe(true);
    expect(unit.frontId).toBe(-1);
    for(let tick=0;tick<40&&unit.loc!==target;tick++)e.stepTick();
    expect(unit.loc).toBe(target);
    expect(unit.path).toEqual([]);
    expect(w.prov.controller[target]).toBe(c);
  });

  it('respects manual hold and never strips the last defender at a target',async()=>{
    const {w,unit,target,cmd}=await fixture();
    expect(cmd('createGarrison',{provinces:[target,unit.loc],unitIds:[unit.id]}).ok).toBe(true);
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);
    expect(cmd('deleteGarrison',{orderId:1,expectedRevision:1}).ok).toBe(true);
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    expect(cmd('setManualHold',{units:[unit.id],hold:true}).ok).toBe(true);
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);
    expect(cmd('setManualHold',{units:[unit.id],hold:false}).ok).toBe(true);
    expect(planGarrisonMoves(w,w.garrisons[0])).toHaveLength(1);
  });

  it('rejects a direct AI movement that would strip the last guard from a target',async()=>{
    const {w,unit,target,cmd}=await fixture();
    const source=unit.loc;
    expect(cmd('createGarrison',{provinces:[source,target],unitIds:[unit.id]}).ok).toBe(true);
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);
    const originalPath=[...unit.path];
    // Without command-boundary validation this legitimate AI issuer could
    // remove the last defender even though the periodic planner would not.
    const result=cmd('garrisonMove',{
      orderId:1,revision:1,unitId:unit.id,target,
    },'frontai');
    expect(result).toMatchObject({ok:false,reason:'staleGarrisonOrder'});
    expect(unit.loc).toBe(source);
    expect(unit.path).toEqual(originalPath);
    expect(w.garrisons[0].unitIds).toEqual([unit.id]);
  });

  it('revalidates the guard count between two queued AI movements',async()=>{
    const {unit,own,target,cmd}=await fixture();
    const source=unit.loc,other=own.find(u=>u.id!==unit.id)!;
    other.loc=source;other.path=[];other.frontId=-1;other.manualHold=false;
    expect(cmd('createGarrison',{
      provinces:[source,target],unitIds:[unit.id,other.id],
    }).ok).toBe(true);
    // Both orders were legal when two defenders stood at the source.
    // After the first command starts moving, the second must be rejected.
    const first=cmd('garrisonMove',{
      orderId:1,revision:1,unitId:unit.id,target,
    },'frontai');
    expect(first.ok).toBe(true);
    expect(unit.path.length).toBeGreaterThan(1);
    const second=cmd('garrisonMove',{
      orderId:1,revision:1,unitId:other.id,target,
    },'frontai');
    expect(second).toMatchObject({ok:false,reason:'staleGarrisonOrder'});
    expect(other.loc).toBe(source);
    expect(other.path).toEqual([]);
    expect(unit.path[unit.path.length-1]).toBe(target);
  });

  it('does not withdraw the only physical guard before an incoming reinforcement arrives',async()=>{
    const {w,c,unit,own,target,cmd}=await fixture();
    const source=unit.loc,reinforcement=own.find(u=>u.id!==unit.id)!;
    const route=findPath(w,target,source,c,false);
    expect(route?.length).toBeGreaterThan(1);
    reinforcement.loc=target;reinforcement.path=route!;
    reinforcement.frontId=-1;reinforcement.manualHold=false;reinforcement.encircled=false;
    expect(cmd('createGarrison',{
      provinces:[source,target],unitIds:[unit.id,reinforcement.id],
    }).ok).toBe(true);
    // The replacement is assigned to source, but is physically elsewhere.
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);
    const beforePath=[...unit.path];
    const rejected=cmd('garrisonMove',{
      orderId:1,revision:1,unitId:unit.id,target,
    },'frontai');
    expect(rejected).toMatchObject({ok:false,reason:'staleGarrisonOrder'});
    expect(unit.loc).toBe(source);
    expect(unit.path).toEqual(beforePath);
    // Once the incoming division actually arrives, one of the two
    // stationed guards may legally redeploy without leaving source empty.
    reinforcement.loc=source;reinforcement.path=[];
    const planned=planGarrisonMoves(w,w.garrisons[0]);
    expect(planned).toHaveLength(1);
    expect(planned[0].target).toBe(target);
    const allowed=cmd('garrisonMove',{
      orderId:1,revision:1,unitId:unit.id,target,
    },'frontai');
    expect(allowed.ok).toBe(true);
    expect(unit.path[unit.path.length-1]).toBe(target);
    expect(reinforcement.loc).toBe(source);
  });

  it('rejects foreign divisions, duplicate targets and double assignment without mutation',async()=>{
    const {w,c,unit,target,cmd}=await fixture();
    const foreign=w.units.find(u=>u.owner!==c&&!u.destroyed)!;
    const initial=w.nextGarrisonId;
    const bad=[
      {provinces:[target],unitIds:[unit.id,foreign.id]},
      {provinces:[target,target],unitIds:[unit.id]},
      {provinces:[target],unitIds:[unit.id,unit.id]},
      {provinces:[foreign.loc],unitIds:[unit.id]},
      {provinces:[],unitIds:[unit.id]},
    ];
    for(const input of bad){
      expect(cmd('createGarrison',input).ok).toBe(false);
      expect(w.garrisons).toHaveLength(0);
      expect(w.nextGarrisonId).toBe(initial);
    }
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).reason).toBe('unitAlreadyAssigned');
    expect(w.garrisons).toHaveLength(1);
    const enemy=w.countries.id.indexOf('PRK');
    expect(cmd('createFront',{enemy,provinces:[unit.loc],units:[unit.id]}).reason).toBe('unitAlreadyAssigned');
    expect(cmd('createFront',{enemy,provinces:[unit.loc]}).ok).toBe(true);
    expect(cmd('assignToFront',{frontId:1,units:[unit.id]}).reason).toBe('unitAlreadyAssigned');
    expect(cmd('deployToFront',{frontId:1,expectedRevision:1,units:[unit.id],strategy:'nearest'}).reason).toBe('unitAlreadyAssigned');
    expect(unit.frontId).toBe(-1);
    expect(validateGarrisons(w)).toEqual([]);
  });

  it('cancels an in-flight queued order on pause/revision and rejects stale operations',async()=>{
    const {w,unit,target,cmd}=await fixture();
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    runGarrison(w,1);
    const issued=w.runtime.commandsSinceLastTick.find(c=>c.type==='garrisonMove')!;
    expect(issued).toBeTruthy();
    expect(cmd('setGarrisonPaused',{orderId:1,expectedRevision:1,paused:true}).ok).toBe(true);
    expect(cmd('setGarrisonPaused',{orderId:1,expectedRevision:1,paused:false}).reason).toBe('staleGarrisonOrder');
    const oldPath=unit.path.slice();
    expect(applyCommands(w,[issued])[0].reason).toBe('staleGarrisonOrder');
    expect(unit.path).toEqual(oldPath);
    expect(planGarrisonMoves(w,w.garrisons[0])).toEqual([]);
    expect(cmd('setGarrisonPaused',{orderId:1,expectedRevision:2,paused:false}).ok).toBe(true);
    expect(cmd('deleteGarrison',{orderId:1,expectedRevision:2}).reason).toBe('staleGarrisonOrder');
    expect(cmd('deleteGarrison',{orderId:1,expectedRevision:3}).ok).toBe(true);
    expect(w.garrisons).toHaveLength(0);
  });

  it('saves v21 and replays deterministically, preserving an active garrison',async()=>{
    const {e,w,unit,target,cmd}=await fixture();
    expect(SAVE_SCHEMA_VERSION).toBe(21);
    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    const data=e.serialize(),baseline=hashWorld(w);
    const restored=await createTestEngine(1,9172,'KOR');
    expect(restored.loadFrom(data).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(baseline);
    expect(restored.getUiSnapshot(0).garrisons[0].provinces).toEqual([target]);
    for(let tick=0;tick<35;tick++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+tick).toBe(hashWorld(w));
    }
  });

  it('preserves historical v20 hashes and rejects corrupted v21 references',async()=>{
    const {e,w,unit,target,cmd}=await fixture();
    const pack=await loadTestPack();
    const empty=decode(e.serialize()) as {
      header:SaveHeader;stores:Record<string,unknown>;payloadChecksum:number
    };
    empty.header.v=20;
    delete empty.stores.garrisons;
    delete (empty.stores.counters as Record<string,unknown>).nextGarrisonId;
    empty.header.integrity=hashWorld(w,false,true,true,true,true,true,true,true,true,true,true,true,true,true,true,false);
    empty.payloadChecksum=savePayloadChecksum(empty.header,empty.stores);
    const legacy=deserializeWorld(encode(empty),pack);
    expect(legacy.violations).toEqual([]);
    expect(legacy.world?.garrisons).toEqual([]);
    expect(legacy.world?.nextGarrisonId).toBe(1);

    expect(cmd('createGarrison',{provinces:[target],unitIds:[unit.id]}).ok).toBe(true);
    const corrupted=decode(e.serialize()) as typeof empty;
    ((corrupted.stores.garrisons as Array<{unitIds:number[]}>)[0]).unitIds=[9999999];
    corrupted.payloadChecksum=savePayloadChecksum(corrupted.header,corrupted.stores);
    expect(deserializeWorld(encode(corrupted),pack).violations)
      .toContain('invalid garrison division reference');
  });
});
