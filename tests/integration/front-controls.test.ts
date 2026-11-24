import { describe, expect, it } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { startWar, endWar } from '../../src/engine/military/war';
import { runFront } from '../../src/engine/systems/fronts';
import { hashWorld } from '../../src/engine/core/hash';
import { savePayloadChecksum } from '../../src/engine/save/serialize';

async function fixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const enemy=w.countries.alive.findIndex((alive,i)=>alive&&i!==c);
  const own=w.units.filter(u=>u.owner===c&&!u.destroyed);
  const u=own[0];
  const target=w.adj.targets.slice(w.adj.offsets[u.loc],w.adj.offsets[u.loc+1]).find(p=>w.prov.controller[p]===c)!;
  expect(target).toBeDefined();
  const war=startWar(w,c,enemy,false);
  let seq=0,autoSeq=0;
  const player=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  const auto=(revision:number)=>applyCommands(w,[{issuer:'frontai',seq:++autoSeq,type:'frontMove',p:{unitId:u.id,target,frontId:1,revision}}])[0];
  expect(player('createFront',{enemy,provinces:[target]}).ok).toBe(true);
  return {e,w,c,own,u,target,war,player,auto};
}

describe('front assignment and automation',()=>{
  it('assigns multiple units atomically, rejects duplicates and foreign units',async()=>{
    const {w,c,own,player}=await fixture();
    const foreign=w.units.find(u=>u.owner!==c)!;
    expect(player('assignToFront',{frontId:1,units:[own[0].id,foreign.id]}).reason).toBe('notYourUnit');
    expect(own[0].frontId).toBe(-1);
    expect(player('assignToFront',{frontId:1,units:[own[0].id,own[0].id]}).reason).toBe('badParams');
    expect(player('assignToFront',{frontId:1,units:own.slice(0,2).map(u=>u.id)}).ok).toBe(true);
    expect(own.slice(0,2).every(u=>u.frontId===1)).toBe(true);
    expect(player('unassignFromFront',{units:[own[1].id]}).ok).toBe(true);
    expect(own[0].frontId).toBe(1);expect(own[1].frontId).toBe(-1);
  });
  it('paused and outdated front commands cannot start movement',async()=>{
    const {w,u,player,auto}=await fixture();
    player('assignToFront',{frontId:1,units:[u.id]});
    const revision=w.fronts[0].revision??1;
    expect(player('setFrontPaused',{frontId:1,paused:true}).ok).toBe(true);
    expect(auto(revision).reason).toBe('staleFrontOrder');
    expect(player('setFrontPaused',{frontId:1,paused:false}).ok).toBe(true);
    expect(auto(revision).reason).toBe('staleFrontOrder');
    expect(u.path).toEqual([]);
    expect(auto(w.fronts[0].revision??1).ok).toBe(true);
    expect(u.path.length).toBeGreaterThan(1);
  });
  it('manual travel remains preferred after movement and resume restores automation',async()=>{
    const {w,u,target,player,auto}=await fixture();
    player('assignToFront',{frontId:1,units:[u.id]});
    expect(player('travelUnits',{units:[u.id],target}).ok).toBe(true);
    expect(u.manualHold).toBe(true);
    // Isolate the post-arrival hold without changing game time.
    u.path=[];u.segIdx=0;u.segProgress=0;u.segDays=0;
    expect(auto(w.fronts[0].revision??1).reason).toBe('staleFrontOrder');
    runFront(w,w.fronts[0],()=>0.5);
    expect(w.runtime.commandsSinceLastTick.some(c=>c.type==='frontMove'&&c.p.unitId===u.id)).toBe(false);
    expect(player('setManualHold',{units:[u.id],hold:false}).ok).toBe(true);
    expect(auto(w.fronts[0].revision??1).ok).toBe(true);
  });
  it('peace invalidates old automation and v8 persists pause and manual hold',async()=>{
    const {e,w,u,war,player,auto}=await fixture();
    player('assignToFront',{frontId:1,units:[u.id]});
    player('setManualHold',{units:[u.id],hold:true});
    const revision=w.fronts[0].revision??1;
    endWar(w,war);
    expect(w.fronts[0].paused).toBe(true);
    expect(auto(revision).reason).toBe('staleFrontOrder');
    const bytes=e.serialize(),before=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    expect(e.world.fronts[0].paused).toBe(true);
    expect(e.world.units.find(x=>x.id===u.id)?.manualHold).toBe(true);
    const bad=decode(bytes) as any;
    bad.stores.fronts[0].revision=0;
    bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
    expect(e.loadFrom(encode(bad)).ok).toBe(false);
  });
  it('v7-shaped save validates using the old hash',async()=>{
    const e=await createTestEngine(),w=e.world;
    const old=decode(e.serialize()) as any;
    delete old.stores.customTemplates; delete old.stores.counters.nextCustomTemplateId;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode; delete old.stores.modelProduction; delete old.stores.modelStock; delete old.stores.issuedEquipment;
    old.header.v=7;
    // Undo the v21 fields before emulating an actual historical save.
    delete old.stores.garrisons; delete old.stores.counters.nextGarrisonId;old.header.integrity=hashWorld(w,false,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.units.every(u=>!u.manualHold)).toBe(true);
  });
});
