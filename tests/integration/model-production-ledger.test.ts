import {describe,expect,it} from 'vitest';
import {encode,decode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {getSystems} from '../../src/engine/core/scheduler';
import {hashWorld} from '../../src/engine/core/hash';
import {forecastProductionLines} from '../../src/engine/systems/production';
import {deserializeWorld,savePayloadChecksum,SAVE_SCHEMA_VERSION} from '../../src/engine/save/serialize';
import {recordModelProduction,validateModelProductionLedger} from '../../src/engine/systems/modelProductionLedger';

const production=()=>getSystems().find(sys=>sys.name==='production')!;
const command=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],
  seq:number,type:string,p:Record<string,unknown>)=>
  applyCommands(w,[{issuer:'player',seq,type,p}])[0];

describe('v16 typed manufacturing history, not inventory',()=>{
  it('credits model history only for live line output, never legacy shares',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const oldStocks=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    production().fn(w);
    expect(w.modelProduction).toEqual([]);
    expect(w.countries.infEquipmentStock[c]).toBeGreaterThan(oldStocks[0]);
    expect(command(w,1,'setProductionMode',{mode:'lines'}).ok).toBe(true);
    const before=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const estimate=forecastProductionLines(w,c);
    production().fn(w);
    const recorded=w.modelProduction.filter(r=>r.country===c);
    expect(recorded.length).toBeGreaterThan(0);
    const models=e.pack.equipmentModels??[];
    const inf=recorded.filter(r=>models.find(m=>m.id===r.modelId)?.category==='infantry')
      .reduce((total,r)=>total+r.produced,0);
    const art=recorded.filter(r=>models.find(m=>m.id===r.modelId)?.category==='artillery')
      .reduce((total,r)=>total+r.produced,0);
    expect(inf).toBeCloseTo(w.countries.infEquipmentStock[c]-before[0]);
    expect(art).toBeCloseTo(w.countries.artEquipmentStock[c]-before[1]);
    expect(inf+art).toBeCloseTo(estimate.reduce((n,l)=>n+l.estimatedDailyOutput,0));
    const snap=e.getUiSnapshot(0).countries[c];
    expect(snap.modelProduction).toEqual(w.modelProduction.filter(r=>r.country===c));
    expect(snap.modelProduction).not.toBe(w.modelProduction);
  });

  it('credits a researched model while keeping old model history and deterministic continuation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    expect(command(w,1,'setProductionMode',{mode:'lines'}).ok).toBe(true);
    production().fn(w);
    const original=w.modelProduction.find(r=>r.country===c&&r.modelId==='infantry-rifle-1990')!;
    expect(original.produced).toBeGreaterThan(0);
    const oldCount=original.produced;
    w.research[c].done.push('small-arms-next');
    const id=w.productionLines.find(l=>l.country===c&&l.modelId==='infantry-rifle-1990')!.id;
    expect(command(w,2,'switchProductionModel',{lineId:id,modelId:'infantry-rifle-2035'}).ok).toBe(true);
    production().fn(w);
    expect(original.produced).toBe(oldCount);
    expect(w.modelProduction.find(r=>r.country===c&&r.modelId==='infantry-rifle-2035')?.produced).toBeGreaterThan(0);
    const saved=e.serialize(),restored=await createTestEngine();
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let i=0;i<15;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });

  it('migrates v15 without rewriting its hash; v16 rejects tampered production history',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,pack=await loadTestPack();
    expect(command(w,1,'setProductionMode',{mode:'lines'}).ok).toBe(true);
    production().fn(w);
    const original=e.serialize();
    const blob=decode(original) as any;
    expect(blob.header.v).toBe(SAVE_SCHEMA_VERSION);
    const v15=decode(original) as any;
    v15.header.v=15;
    // Undo the v21 fields before emulating an actual historical save.
    delete v15.stores.garrisons; delete v15.stores.counters.nextGarrisonId;
    delete v15.stores.modelProduction;delete v15.stores.modelStock;delete v15.stores.issuedEquipment;
    v15.header.integrity=hashWorld(w,false,true,true,true,true,true,true,true,true,true,false);
    v15.payloadChecksum=savePayloadChecksum(v15.header,v15.stores);
    const loaded=deserializeWorld(encode(v15),pack);
    expect(loaded.violations).toEqual([]);
    expect(loaded.world?.modelProduction).toEqual([]);
    expect(loaded.world?.productionMode[c]).toBe('lines');
    const corrupt=decode(original) as any;
    corrupt.stores.modelProduction[0].produced=-1;
    corrupt.payloadChecksum=savePayloadChecksum(corrupt.header,corrupt.stores);
    expect(deserializeWorld(encode(corrupt),pack).violations).toContain('invalid production ledger quantity');
    const duplicate=decode(original) as any;
    duplicate.stores.modelProduction.push({...duplicate.stores.modelProduction[0]});
    duplicate.payloadChecksum=savePayloadChecksum(duplicate.header,duplicate.stores);
    expect(deserializeWorld(encode(duplicate),pack).violations).toContain('duplicate production ledger entry');
    const missing=decode(original) as any;
    delete missing.stores.modelProduction;
    missing.payloadChecksum=savePayloadChecksum(missing.header,missing.stores);
    expect(deserializeWorld(encode(missing),pack).violations).toContain('invalid model production ledger size');
    const unauthorized=decode(original) as any;
    unauthorized.stores.modelProduction[0].modelId='not-in-pack';
    unauthorized.payloadChecksum=savePayloadChecksum(unauthorized.header,unauthorized.stores);
    expect(deserializeWorld(encode(unauthorized),pack).violations).toContain('invalid production ledger model');
  });

  it('validates malformed records and refuses to credit a legacy-mode country',async()=>{
    const pack=await loadTestPack(),models=pack.equipmentModels??[],count=pack.countries.length;
    expect(validateModelProductionLedger([],models,count)).toEqual([]);
    expect(validateModelProductionLedger([{country:0,modelId:models[0].id,produced:NaN}],models,count))
      .toContain('invalid production ledger quantity');
    expect(validateModelProductionLedger([{country:count,modelId:models[0].id,produced:1}],models,count))
      .toContain('invalid production ledger country');
    const e=await createTestEngine();
    expect(()=>recordModelProduction(e.world,e.world.playerCountry,[{modelId:models[0].id,estimatedDailyOutput:1}]))
      .toThrow('ledger requires line mode');
  });
});
