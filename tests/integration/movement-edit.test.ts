import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {findPath,planMovementEdit,tickMovement} from '../../src/engine/systems/movement';
import {hashWorld} from '../../src/engine/core/hash';

async function fixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const u=w.units.find(x=>x.owner===c&&!x.destroyed)!;
  const route=Array.from({length:w.prov.count},(_,p)=>p).filter(p=>w.prov.controller[p]===c).map(p=>findPath(w,u.loc,p,c,false)).find(path=>path&&path.length>=3)!;
  expect(route).toBeDefined();
  const origin=u.loc,next=route[1],target=route.at(-1)!;
  // Synthetic fractional progress in a valid existing land segment.
  u.path=route;u.segIdx=0;u.segProgress=1;u.segDays=3;
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  return {e,w,u,origin,next,target,issue};
}
describe('manual division movement editing',()=>{
  it('stops only after an already-started segment, retaining progress and manual hold',async()=>{
    const {w,u,origin,next,issue}=await fixture();
    expect(issue('haltUnits',{units:[u.id]}).ok).toBe(true);
    expect(u.path).toEqual([origin,next]);expect(u.loc).toBe(origin);
    expect(u.segProgress).toBe(1);expect(u.segDays).toBe(3);
    tickMovement(w);expect(u.loc).toBe(origin);expect(u.segProgress).toBe(2);
    tickMovement(w);expect(u.loc).toBe(next);expect(u.path).toEqual([]);
    expect(u.manualHold).toBe(true);
  });
  it('redirects from the next endpoint, without resetting a started segment',async()=>{
    const {w,u,origin,next,issue}=await fixture();
    const plan=planMovementEdit(w,u,origin);
    expect(plan?.path).toEqual([origin,next,origin]);
    expect(issue('redirectUnits',{units:[u.id],target:origin}).ok).toBe(true);
    expect(u.path).toEqual([origin,next,origin]);expect(u.loc).toBe(origin);
    expect(u.segProgress).toBe(1);expect(u.segDays).toBe(3);
    tickMovement(w);tickMovement(w);expect(u.loc).toBe(next);
    expect(u.path.at(-1)).toBe(origin);expect(u.manualHold).toBe(true);
  });
  it('at a segment boundary, stops immediately and holds idle divisions too',async()=>{
    const {w,u,origin,issue}=await fixture();
    const idle=w.units.find(x=>x.owner===u.owner&&x.id!==u.id&&!x.destroyed)!;
    u.segProgress=0;
    expect(issue('haltUnits',{units:[u.id,idle.id]}).ok).toBe(true);
    expect(u.loc).toBe(origin);expect(u.path).toEqual([]);expect(u.segDays).toBe(0);
    expect(u.manualHold).toBe(true);expect(idle.manualHold).toBe(true);
  });
  it('rejects foreign or duplicate selections and inaccessible targets atomically',async()=>{
    const {w,u,issue}=await fixture();
    const foreign=w.units.find(x=>x.owner!==u.owner)!;
    const path=u.path.slice(),progress=u.segProgress;
    expect(issue('haltUnits',{units:[u.id,foreign.id]}).reason).toBe('notYourUnit');
    expect(issue('haltUnits',{units:[u.id,u.id]}).reason).toBe('badParams');
    expect(issue('redirectUnits',{units:[u.id],target:foreign.loc}).reason).toBe('noPath');
    expect(u.path).toEqual(path);expect(u.segProgress).toBe(progress);
    expect(u.manualHold??false).toBe(false);
  });
  it('retains edited route and progress through an existing v8 save',async()=>{
    const {e,w,u,origin,issue}=await fixture();
    expect(issue('redirectUnits',{units:[u.id],target:origin}).ok).toBe(true);
    const bytes=e.serialize(),before=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    const restored=e.world.units.find(x=>x.id===u.id)!;
    expect(restored.path).toEqual(u.path);expect(restored.segProgress).toBe(1);
    expect(restored.manualHold).toBe(true);
  });
});
