import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {getSystems} from '../../src/engine/core/scheduler';
import {dailyEquipmentOutput} from '../../src/engine/systems/production';
import {hashWorld} from '../../src/engine/core/hash';
import {deserializeWorld,savePayloadChecksum} from '../../src/engine/save/serialize';

const send=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],
  type:string,p:Record<string,unknown>,seq:number,issuer='player')=>
  applyCommands(w,[{issuer,seq,type,p}])[0];

describe('opt-in model-aware two-goods production (v15)',()=>{
  it('retains legacy output until enabled, then manufactures live output just once',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const original=dailyEquipmentOutput(w,c);
    expect(w.productionMode[c]).toBe('legacy');
    expect(original.infantry).toBeGreaterThan(0);
    const line=w.productionLines.find(l=>l.country===c&&l.modelId==='infantry-rifle-1990')!;
    expect(send(w,'updateProductionLine',{lineId:line.id,factories:0,priority:5,active:false},1).ok).toBe(true);
    expect(dailyEquipmentOutput(w,c)).toEqual(original);
    expect(send(w,'setProductionMode',{mode:'lines'},2).ok).toBe(true);
    const live=dailyEquipmentOutput(w,c);
    expect(live.infantry).toBe(0);
    expect(live.artillery).toBeGreaterThan(0);
    const stocks=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    getSystems().find(sys=>sys.name==='production')!.fn(w);
    expect(w.countries.infEquipmentStock[c]-stocks[0]).toBeCloseTo(live.infantry);
    expect(w.countries.artEquipmentStock[c]-stocks[1]).toBeCloseTo(live.artillery);
    expect(send(w,'setProductionMode',{mode:'legacy'},3).ok).toBe(true);
    expect(dailyEquipmentOutput(w,c)).toEqual(original);
  });
  it('allocates by priority and changes efficiency only for active, allocated lines',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const old=w.productionLines.filter(l=>l.country===c);
    const frozen=old[0].efficiency;
    for(let i=0;i<old.length;i++)
      expect(send(w,'updateProductionLine',{lineId:old[i].id,factories:0,priority:1,active:false},i+1).ok).toBe(true);
    expect(send(w,'createProductionLine',{modelId:'infantry-rifle-1990',factories:3,priority:9},3).ok).toBe(true);
    const active=w.productionLines.at(-1)!;
    expect(active.efficiency).toBe(.1);
    expect(send(w,'setProductionMode',{mode:'lines'},4).ok).toBe(true);
    const initial=dailyEquipmentOutput(w,c);
    expect(initial.infantry).toBeGreaterThan(0);
    expect(initial.artillery).toBe(0);
    getSystems().find(sys=>sys.name==='production')!.fn(w);
    expect(active.efficiency).toBeCloseTo(.105);
    expect(old[0].efficiency).toBe(frozen);
    expect(dailyEquipmentOutput(w,c).infantry).toBeGreaterThan(initial.infantry);
    w.countries.milFactories[c]=0;
    const efficiency=active.efficiency;
    expect(dailyEquipmentOutput(w,c)).toEqual({infantry:0,artillery:0});
    getSystems().find(sys=>sys.name==='production')!.fn(w);
    expect(active.efficiency).toBe(efficiency);
  });
  it('blocks invalid modes or unresearched models and does not alter deployed equipment on activation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const before=w.units.filter(u=>u.owner===c).map(u=>[u.id,u.infEquipment,u.artEquipment]);
    expect(send(w,'setProductionMode',{mode:'invalid'},1).reason).toBe('badParams');
    expect(send(w,'createProductionLine',{modelId:'infantry-rifle-2035',factories:3,priority:9},2).reason).toBe('techLocked');
    w.research[c].done.push('small-arms-next');
    expect(send(w,'createProductionLine',{modelId:'infantry-rifle-2035',factories:3,priority:9},3).ok).toBe(true);
    expect(send(w,'setProductionMode',{mode:'lines'},4).ok).toBe(true);
    expect(w.units.filter(u=>u.owner===c).map(u=>[u.id,u.infEquipment,u.artEquipment])).toEqual(before);
  });
  it('preserves v15 mode across saves and migrates valid v14 saves with the old hash',async()=>{
    const e=await createTestEngine(),pack=await loadTestPack(),w=e.world,c=w.playerCountry;
    expect(send(w,'setProductionMode',{mode:'lines'},1).ok).toBe(true);
    const initialHash=hashWorld(w),valid=e.serialize();
    expect(e.loadFrom(valid).ok).toBe(true);
    expect(e.world.productionMode[c]).toBe('lines');
    expect(hashWorld(e.world)).toBe(initialHash);
    const legacy=decode(valid) as any;
    legacy.header.v=14;
    delete legacy.stores.productionMode;
    legacy.header.integrity=hashWorld(w,false,true,true,true,true,true,true,true,true,false);
    legacy.payloadChecksum=savePayloadChecksum(legacy.header,legacy.stores);
    const restored=deserializeWorld(encode(legacy),pack);
    expect(restored.violations).toEqual([]);
    expect(restored.world!.productionMode.every(mode=>mode==='legacy')).toBe(true);
    const bad=decode(valid) as any;
    bad.stores.productionMode[c]='bogus';
    bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
    expect(deserializeWorld(encode(bad),pack).violations).toContain('invalid v15 production mode');
    const missing=decode(valid) as any;
    delete missing.stores.productionMode;
    missing.payloadChecksum=savePayloadChecksum(missing.header,missing.stores);
    expect(deserializeWorld(encode(missing),pack).violations).toContain('invalid v15 production mode');
  });
  it('keeps post-save continuation and equipment output deterministic',async()=>{
    const e=await createTestEngine(),w=e.world;
    expect(send(w,'setProductionMode',{mode:'lines'},1).ok).toBe(true);
    for(let i=0;i<7;i++)e.stepTick();
    const checkpoint=e.serialize();
    const restored=await createTestEngine();
    expect(restored.loadFrom(checkpoint).ok).toBe(true);
    for(let i=0;i<30;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(e.world),'tick '+e.world.tick).toBe(hashWorld(restored.world));
    }
  });
});
