import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {startWar} from '../../src/engine/military/war';
import {operationalFrontProvinces} from '../../src/engine/military/fronts';
import {runFront} from '../../src/engine/systems/fronts';
import {frontView} from '../../src/ui/maprender/frontView';

async function fixture(){
  const e=await createTestEngine(1,7129,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  const origin=w.prov.id.indexOf('KR-41');
  const captured=w.prov.id.indexOf('KP-07');
  const next=w.adj.targets.slice(w.adj.offsets[captured],w.adj.offsets[captured+1])
    .filter((p,i)=>!w.adj.strait[w.adj.offsets[captured]+i]&&w.prov.controller[p]===enemy);
  expect(origin).toBeGreaterThanOrEqual(0);
  expect(captured).toBeGreaterThanOrEqual(0);
  expect(next.length).toBeGreaterThan(0);
  startWar(w,c,enemy,false);
  let seq=0;
  const cmd=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(cmd('createFront',{enemy,provinces:[origin]}).ok).toBe(true);
  const front=w.fronts[0];
  expect(cmd('setFrontStance',{frontId:front.id,stance:'attack',cap:1}).ok).toBe(true);
  const u=w.units.find(x=>x.owner===c&&!x.destroyed)!;
  u.loc=captured;
  u.path=[];u.segIdx=0;u.segProgress=0;u.segDays=0;
  u.frontId=front.id;u.manualHold=false;u.encircled=false;
  u.org=100;u.manpower=u.maxManpower;
  u.infEquipment=u.maxInfEquipment;u.artEquipment=u.maxArtEquipment;
  // Emulate a completed occupation; no source front edits or extra saved state.
  w.prov.controller[captured]=c;
  w.units=w.units.filter(x=>x.owner!==enemy||!next.includes(x.loc));
  w.runtime.supplyDirty=true;
  return {e,w,c,enemy,origin,captured,next,front,u,cmd};
}

describe('front advances after captured provinces',()=>{
  it('extends an active boundary from an occupied enemy province and advances into the next empty enemy tile',async()=>{
    const {e,w,c,captured,next,front,u}=await fixture();
    const before=hashWorld(w);
    expect(operationalFrontProvinces(w,front)).toContain(captured);
    const overlay=frontView(e.getUiSnapshot(0),[u.id],'selected')[0];
    expect(overlay.provinces).toContain(captured);
    expect(overlay.links.some(link=>link.from===captured&&next.includes(link.to))).toBe(true);
    expect(hashWorld(w)).toBe(before);
    runFront(w,front,()=>0.5);
    const orders=w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove');
    expect(orders).toHaveLength(1);
    expect(orders[0].p.unitId).toBe(u.id);
    expect(next).toContain(orders[0].p.target);
    expect(orders[0].issuer).toBe('frontai');
    expect(w.prov.controller[captured]).toBe(c);
  });

  it('does not extend to unrelated borders or override manual hold / pause',async()=>{
    const {w,c,front,u,captured}=await fixture();
    const other=w.prov.id.indexOf('JP-13');
    expect(w.prov.controller[other]).not.toBe(c);
    expect(operationalFrontProvinces(w,front)).not.toContain(other);
    u.manualHold=true;
    runFront(w,front,()=>0.5);
    expect(w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove')).toEqual([]);
    u.manualHold=false;
    front.paused=true;
    runFront(w,front,()=>0.5);
    expect(w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove')).toEqual([]);
    // The original drawn border remains persistent and unchanged.
    expect(front.provinces).not.toContain(captured);
  });
});
