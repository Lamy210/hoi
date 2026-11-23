import {describe,expect,it} from 'vitest';
import {encode,decode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {startWar} from '../../src/engine/military/war';
import {advanceBattlePreparedness,MAX_ENTRENCHMENT,MAX_PREPARATION,
  preparednessPowerFactor} from '../../src/engine/military/preparedness';
import {unitPowerFactorsPure} from '../../src/engine/systems/combat';
import {deserializeWorld,savePayloadChecksum,SAVE_SCHEMA_VERSION} from '../../src/engine/save/serialize';

const value=(f:ReturnType<typeof unitPowerFactorsPure>,name:string)=>
  f.find(x=>x.label===name)?.value;

async function ready(){
  const e=await createTestEngine(1,6281,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  const border=w.prov.id.indexOf('KR-41');
  const u=w.units.find(x=>x.owner===c&&!x.destroyed)!;
  u.loc=border;u.path=[];u.org=100;
  w.runtime.supplyEff[border]=1;
  w.runtime.unitSupplyFactor.set(u.id,1);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  return {e,w,c,enemy,border,u,issue};
}

describe('live combat preparedness v20',()=>{
  it('accumulates fortified defense while stationary and pauses during combat without extra gain',async()=>{
    const {w,border,u}=await ready();
    for(let i=0;i<MAX_ENTRENCHMENT+3;i++)
      advanceBattlePreparedness(w,new Set(),new Set());
    expect(u.entrenchment).toBe(MAX_ENTRENCHMENT);
    expect(u.preparation).toBe(0);
    expect(preparednessPowerFactor(u,'defend')).toBeCloseTo(1.3);
    expect(value(unitPowerFactorsPure(u,w.prov.terrain[border],1,'defend'),'entrenchment')).toBeCloseTo(1.3);
    advanceBattlePreparedness(w,new Set(),new Set([border]));
    expect(u.entrenchment).toBe(MAX_ENTRENCHMENT);
    u.path=[border,w.prov.id.indexOf('KR-11')];
    advanceBattlePreparedness(w,new Set([u.id]),new Set());
    expect(u.entrenchment).toBe(0);
    expect(preparednessPowerFactor(u,'defend')).toBe(1);
    u.path=[];
    w.runtime.supplyEff[border]=0;
    advanceBattlePreparedness(w,new Set(),new Set());
    expect(u.entrenchment).toBe(0);
  });

  it('prepares only for an active offensive, then spends preparation on movement and battle',async()=>{
    const {w,c,enemy,border,u,issue}=await ready();
    startWar(w,c,enemy,false);
    expect(issue('createFront',{enemy,provinces:[border]}).ok).toBe(true);
    const front=w.fronts[0];
    expect(issue('assignToFront',{frontId:front.id,units:[u.id]}).ok).toBe(true);
    expect(issue('setFrontStance',{frontId:front.id,stance:'attack',cap:1}).ok).toBe(true);
    for(let i=0;i<MAX_PREPARATION+2;i++)
      advanceBattlePreparedness(w,new Set(),new Set());
    expect(u.preparation).toBe(MAX_PREPARATION);
    expect(preparednessPowerFactor(u,'attack')).toBeCloseTo(1.2);
    expect(value(unitPowerFactorsPure(u,w.prov.terrain[border],1,'attack'),'planning')).toBeCloseTo(1.2);
    const target=w.prov.id.indexOf('KR-11');
    u.path=[border,target];
    advanceBattlePreparedness(w,new Set([u.id]),new Set());
    expect(u.entrenchment).toBe(0);
    expect(u.preparation).toBe(MAX_PREPARATION-1);
    for(let i=0;i<MAX_PREPARATION;i++)
      advanceBattlePreparedness(w,new Set([u.id]),new Set());
    expect(u.preparation).toBe(0);
    u.path=[];
    u.manualHold=true;
    advanceBattlePreparedness(w,new Set(),new Set());
    expect(u.preparation).toBe(0);
    expect(u.entrenchment).toBe(1);
  });

  it('makes entrenched defenders take less organization damage under the same deterministic attack',async()=>{
    const setup=async(level:number)=>{
      const {e,w,c,enemy}=await ready();
      const target=w.prov.id.indexOf('KP-07');
      startWar(w,c,enemy,false);
      const originalAtt=w.units.find(u=>u.owner===c)!;
      const originalDef=w.units.find(u=>u.owner===enemy&&u.loc===target)!;
      w.units=[originalAtt,originalDef];
      Object.assign(originalAtt,{loc:target,org:100,path:[],segIdx:0,segDays:0,segProgress:0,
        encircled:false,destroyed:false,entrenchment:0,preparation:0});
      Object.assign(originalDef,{loc:target,org:100,path:[],segIdx:0,segDays:0,segProgress:0,
        encircled:false,destroyed:false,entrenchment:level,preparation:0});
      return {e,w,def:originalDef};
    };
    const flat=await setup(0),fortified=await setup(MAX_ENTRENCHMENT);
    flat.e.stepTick();fortified.e.stepTick();
    expect(fortified.def.org).toBeGreaterThan(flat.def.org);
    expect(fortified.w.prov.controller[fortified.def.loc]).toBe(flat.w.prov.controller[flat.def.loc]);
  });

  it('saves bounded levels, detects tampering, and preserves historical v19 integrity',async()=>{
    expect(SAVE_SCHEMA_VERSION).toBe(20);
    const {e,w,u}=await ready();
    u.entrenchment=MAX_ENTRENCHMENT;
    u.preparation=MAX_PREPARATION;
    const before=hashWorld(w),bytes=e.serialize();
    const restored=await createTestEngine(1,6281,'KOR');
    expect(restored.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(before);
    expect(restored.world.units.find(x=>x.id===u.id)?.entrenchment).toBe(MAX_ENTRENCHMENT);
    const pack=await loadTestPack();
    for(const field of ['entrenchment','preparation'] as const){
      const modified=decode(bytes) as any;
      modified.stores.units.find((x:any)=>x.id===u.id)[field]=field==='entrenchment'?7:6;
      modified.payloadChecksum=savePayloadChecksum(modified.header,modified.stores);
      const result=deserializeWorld(encode(modified),pack);
      expect(result.world).toBeNull();
      expect(result.violations).toContain('invalid unit combat preparedness');
    }
    const legacy=decode(bytes) as any;
    legacy.header.v=19;
    for(const unit of legacy.stores.units){
      delete unit.entrenchment;
      delete unit.preparation;
    }
    legacy.header.integrity=hashWorld(w,...([
      false,true,true,true,true,true,true,true,true,true,true,true,true,true,false
    ] as const));
    legacy.payloadChecksum=savePayloadChecksum(legacy.header,legacy.stores);
    const loaded=deserializeWorld(encode(legacy),pack);
    expect(loaded.violations).toEqual([]);
    expect(loaded.world?.units.find(x=>x.id===u.id)?.entrenchment).toBeUndefined();
    expect(loaded.world?.units.find(x=>x.id===u.id)?.preparation).toBeUndefined();
    // State changes on the next tick remain deterministic across save/load.
    const clone=await createTestEngine(1,6281,'KOR');
    expect(clone.loadFrom(bytes).ok).toBe(true);
    for(let i=0;i<8;i++){
      e.stepTick();clone.stepTick();
      expect(hashWorld(clone.world)).toBe(hashWorld(w));
    }
  });
});
