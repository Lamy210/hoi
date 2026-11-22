import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {getSystems} from '../../src/engine/core/scheduler';
import {deserializeWorld,savePayloadChecksum} from '../../src/engine/save/serialize';
import {adjustWarehouse,creditModelWarehouse,typedWarehouseTotal,
  unclassifiedWarehouse,transferWarehouse,validateModelWarehouse} from '../../src/engine/systems/modelWarehouse';

const command=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],
 type:string,p:Record<string,unknown>,seq:number)=>
 applyCommands(w,[{issuer:'player',seq,type,p}])[0];
const rifle='infantry-rifle-1990',art='artillery-towed-2000';

describe('v17 model warehouse is a subset of the aggregate two-goods stock',()=>{
  it('initial and legacy inventory is unclassified, live line production credits both exactly once',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    expect(w.modelStock).toEqual([]);
    expect(unclassifiedWarehouse(w,c,'infantry')).toBe(w.countries.infEquipmentStock[c]);
    expect(command(w,'setProductionMode',{mode:'lines'},1).ok).toBe(true);
    const priorInf=w.countries.infEquipmentStock[c],priorArt=w.countries.artEquipmentStock[c];
    getSystems().find(s=>s.name==='production')!.fn(w);
    const newInf=w.countries.infEquipmentStock[c]-priorInf;
    const newArt=w.countries.artEquipmentStock[c]-priorArt;
    expect(newInf).toBeGreaterThan(0);
    expect(newArt).toBeGreaterThan(0);
    expect(typedWarehouseTotal(w,c,'infantry')).toBeCloseTo(newInf);
    expect(typedWarehouseTotal(w,c,'artillery')).toBeCloseTo(newArt);
    expect(unclassifiedWarehouse(w,c,'infantry')).toBeCloseTo(priorInf);
    expect(e.getUiSnapshot(0).countries[c].modelStock).toEqual(w.modelStock.filter(x=>x.country===c));
    expect(w.modelProduction.some(x=>x.country===c&&x.modelId===rifle)).toBe(true);
  });

  it('consumes unclassified goods first, preserves model provenance on trade and makes refunds unclassified',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,b=(c+1)%w.countries.count;
    w.countries.infEquipmentStock[c]=0;
    adjustWarehouse(w,c,'infantry',50);
    creditModelWarehouse(w,c,rifle,50);
    expect(unclassifiedWarehouse(w,c,'infantry')).toBe(0);
    const recipientBefore=w.countries.infEquipmentStock[b];
    transferWarehouse(w,c,b,'infantry',15);
    expect(w.countries.infEquipmentStock[c]).toBe(35);
    expect(w.countries.infEquipmentStock[b]).toBe(recipientBefore+15);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===rifle)?.quantity).toBe(35);
    expect(w.modelStock.find(r=>r.country===b&&r.modelId===rifle)?.quantity).toBe(15);
    adjustWarehouse(w,c,'infantry',4); // equipment returned from an untyped unit
    expect(unclassifiedWarehouse(w,c,'infantry')).toBeCloseTo(4);
    adjustWarehouse(w,c,'infantry',-2); // consumes unclassified first
    expect(unclassifiedWarehouse(w,c,'infantry')).toBeCloseTo(2);
    expect(typedWarehouseTotal(w,c,'infantry')).toBe(35);
    adjustWarehouse(w,c,'infantry',-7);
    expect(typedWarehouseTotal(w,c,'infantry')).toBe(30);
    expect(w.countries.infEquipmentStock[c]).toBe(30);
  });

  it('deploy and cancel training consume typed warehouse goods but refunds return unclassified',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,p=w.countries.capital[c];
    w.countries.manpowerPool[c]=100_000;
    w.countries.infEquipmentStock[c]=1_000;
    w.countries.artEquipmentStock[c]=200;
    creditModelWarehouse(w,c,rifle,1_000);
    creditModelWarehouse(w,c,art,200);
    expect(command(w,'startTraining',{templateId:'standard-v1',province:p},1).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(0);
    expect(w.countries.artEquipmentStock[c]).toBe(0);
    expect(w.modelStock.filter(r=>r.country===c)).toEqual([]);
    const orderId=w.trainingQueue[0].id;
    expect(command(w,'cancelTraining',{id:orderId},2).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(1_000);
    expect(w.countries.artEquipmentStock[c]).toBe(200);
    expect(w.modelStock.filter(r=>r.country===c)).toEqual([]);
    expect(unclassifiedWarehouse(w,c,'infantry')).toBe(1_000);
    expect(command(w,'createUnit',{country:c,province:p},3).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(0);
    expect(w.countries.artEquipmentStock[c]).toBe(0);
  });

  it('loads old v16 as wholly unclassified and round-trips v17 with stable continuation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,pack=await loadTestPack();
    expect(command(w,'setProductionMode',{mode:'lines'},1).ok).toBe(true);
    for(let i=0;i<4;i++)e.stepTick();
    const stateHash=hashWorld(w),encoded=e.serialize();
    const restored=await createTestEngine();
    expect(restored.loadFrom(encoded).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(stateHash);
    expect(restored.world.modelStock).toEqual(w.modelStock);
    for(let i=0;i<25;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
    const v16=decode(encoded) as any;
    v16.header.v=16;delete v16.stores.modelStock;
    const old=await createTestEngine();
    expect(old.loadFrom(encoded).ok).toBe(true);
    // Historical hash excludes the v17 warehouse (all other v16 fields included).
    v16.header.integrity=hashWorld(old.world,false,true,true,true,true,true,true,true,true,true,true,false);
    v16.payloadChecksum=savePayloadChecksum(v16.header,v16.stores);
    const migrated=deserializeWorld(encode(v16),pack);
    expect(migrated.violations).toEqual([]);
    expect(migrated.world?.modelStock).toEqual([]);
    expect(migrated.world?.productionMode[c]).toBe('lines');
  });

  it('rejects duplicated, unknown, negative and aggregate-exceeding stocks on load',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,pack=await loadTestPack();
    w.countries.infEquipmentStock[c]=1;
    creditModelWarehouse(w,c,rifle,1);
    const good=decode(e.serialize()) as any;
    const tamper=(modify:(blob:any)=>void)=>{
      const blob=decode(e.serialize()) as any;
      modify(blob);
      blob.payloadChecksum=savePayloadChecksum(blob.header,blob.stores);
      return deserializeWorld(encode(blob),pack).violations;
    };
    expect(good.header.v).toBe(17);
    expect(tamper(b=>{b.stores.modelStock[0].quantity=-1})).toContain('invalid v17 warehouse quantity');
    expect(tamper(b=>{b.stores.modelStock[0].modelId='invalid'})).toContain('invalid v17 warehouse model');
    expect(tamper(b=>{b.stores.modelStock.push({...b.stores.modelStock[0]})}))
      .toContain('duplicate v17 warehouse entry');
    expect(tamper(b=>{b.stores.modelStock[0].quantity=50}))
      .toContain('v17 warehouse exceeds aggregate stock');
    expect(tamper(b=>{delete b.stores.modelStock})).toContain('invalid v17 warehouse size');
    expect(validateModelWarehouse([],pack.equipmentModels??[],w.countries.count,
      w.countries.infEquipmentStock,w.countries.artEquipmentStock)).toEqual([]);
  });
});
