import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {savePayloadChecksum,deserializeWorld,SAVE_SCHEMA_VERSION} from '../../src/engine/save/serialize';
import {creditModelWarehouse} from '../../src/engine/systems/modelWarehouse';
import {attributeEquipment,releaseEquipmentAttribution,trimUnitEquipment,
  validateIssuedEquipment} from '../../src/engine/systems/issuedEquipment';
import {reinforceIdleUnits} from '../../src/engine/systems/reinforcement';
import {tickTraining} from '../../src/engine/systems/training';

const rifle='infantry-rifle-1990',art='artillery-towed-2000';
const command=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],
  type:string,p:Record<string,unknown>,seq:number)=>
  applyCommands(w,[{issuer:'player',seq,type,p}])[0];

describe('v18 identifiable equipment across training and deployed units',()=>{
  it('keeps exact models through reserve, cancel, and deploy; no double credit',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,p=w.countries.capital[c];
    w.countries.manpowerPool[c]=100_000;
    w.countries.infEquipmentStock[c]=1_000;
    w.countries.artEquipmentStock[c]=200;
    creditModelWarehouse(w,c,rifle,1_000);
    creditModelWarehouse(w,c,art,200);
    expect(command(w,'startTraining',{templateId:'standard-v1',province:p},1).ok).toBe(true);
    const order=w.trainingQueue[0];
    expect(w.modelStock.filter(r=>r.country===c)).toEqual([]);
    expect(w.issuedEquipment.filter(r=>r.holder==='training'&&r.holderId===order.id))
      .toEqual([{holder:'training',holderId:order.id,modelId:art,quantity:200},
        {holder:'training',holderId:order.id,modelId:rifle,quantity:1_000}]);
    const saved=e.serialize(),r=await createTestEngine();
    expect(r.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(r.world)).toBe(hashWorld(w));
    expect(command(w,'cancelTraining',{id:order.id},2).ok).toBe(true);
    expect(w.issuedEquipment).toEqual([]);
    expect(w.modelStock.find(x=>x.country===c&&x.modelId===rifle)?.quantity).toBe(1_000);
    expect(w.modelStock.find(x=>x.country===c&&x.modelId===art)?.quantity).toBe(200);
    expect(command(w,'startTraining',{templateId:'standard-v1',province:p},3).ok).toBe(true);
    const next=w.trainingQueue[0];
    // Legacy instant reservation order reaches deployment on its ready day.
    w.tick=next.readyTick;
    tickTraining(w);
    expect(w.trainingQueue).toHaveLength(0);
    expect(w.issuedEquipment.filter(x=>x.holder==='training')).toHaveLength(0);
    const unit=w.units.find(u=>u.id===next.id)!;
    expect(unit.infEquipment).toBe(1_000);
    expect(w.issuedEquipment.filter(x=>x.holder==='unit'&&x.holderId===unit.id))
      .toEqual([{holder:'unit',holderId:unit.id,modelId:art,quantity:200},
        {holder:'unit',holderId:unit.id,modelId:rifle,quantity:1_000}]);
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
  });

  it('does not record any typed equipment for queued orders before reservation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,p=w.countries.capital[c];
    expect(command(w,'enqueueTraining',{templateId:'light-v1',province:p,priority:6,autoDeploy:false},1).ok).toBe(true);
    const order=w.trainingQueue[0];
    expect(order.status).toBe('queued');
    expect(w.issuedEquipment).toEqual([]);
    // Force a small, identifiable stockpile to cover this template.
    w.countries.manpowerPool[c]=100_000;
    w.countries.infEquipmentStock[c]=500;
    w.countries.artEquipmentStock[c]=100;
    creditModelWarehouse(w,c,rifle,500);
    creditModelWarehouse(w,c,art,100);
    tickTraining(w);
    expect(order.status).toBe('training');
    expect(w.issuedEquipment.filter(x=>x.holder==='training'&&x.holderId===order.id)).toHaveLength(2);
    expect(command(w,'cancelTraining',{id:order.id},2).ok).toBe(true);
    expect(w.modelStock.find(x=>x.country===c&&x.modelId===rifle)?.quantity).toBe(500);
    expect(w.issuedEquipment).toHaveLength(0);
  });

  it('tracks identifiable reinforcements and reduces typed holdings after casualties',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(x=>x.owner===c)!;
    w.units=[u];
    u.infEquipment=u.maxInfEquipment-100;
    w.countries.infEquipmentStock[c]=100;
    creditModelWarehouse(w,c,rifle,100);
    w.countries.artEquipmentStock[c]=0;
    reinforceIdleUnits(w,new Set());
    const model=w.issuedEquipment.find(x=>x.holder==='unit'&&x.holderId===u.id&&x.modelId===rifle);
    expect(model?.quantity).toBeGreaterThan(0);
    expect(model!.quantity).toBeLessThanOrEqual(25);
    const balance=u.infEquipment;
    u.infEquipment=4;
    trimUnitEquipment(w,u.id,'infantry',u.infEquipment);
    expect(w.issuedEquipment.find(x=>x.holder==='unit'&&x.holderId===u.id&&x.modelId===rifle)?.quantity).toBe(4);
    expect(balance).toBeGreaterThan(u.infEquipment);
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
    expect(releaseEquipmentAttribution(w,'unit',u.id)).toHaveLength(1);
    expect(w.issuedEquipment).toHaveLength(0);
  });

  it('keeps v17 hash compatibility and rejects orphaned, duplicate and over-held records',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry,pack=await loadTestPack();
    const u=w.units.find(x=>x.owner===c)!;
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifle,quantity:5}]);
    const original=e.serialize();
    const v18=decode(original) as any;
    expect(v18.header.v).toBe(SAVE_SCHEMA_VERSION);
    const migrated=decode(original) as any;
    migrated.header.v=17;
    delete migrated.stores.issuedEquipment;
    migrated.header.integrity=hashWorld(w,false,true,true,true,true,true,true,true,true,true,true,true,false);
    migrated.payloadChecksum=savePayloadChecksum(migrated.header,migrated.stores);
    const loaded=deserializeWorld(encode(migrated),pack);
    expect(loaded.violations).toEqual([]);
    expect(loaded.world?.issuedEquipment).toEqual([]);

    const tamper=(fn:(blob:any)=>void)=>{
      const value=decode(original) as any;
      fn(value);
      value.payloadChecksum=savePayloadChecksum(value.header,value.stores);
      return deserializeWorld(encode(value),pack).violations;
    };
    expect(tamper(x=>{delete x.stores.issuedEquipment})).toContain('missing v18 issued equipment ledger');
    expect(tamper(x=>{x.stores.issuedEquipment[0].quantity=-3})).toContain('invalid issued equipment quantity');
    expect(tamper(x=>{x.stores.issuedEquipment[0].modelId='bogus'})).toContain('invalid issued equipment model');
    expect(tamper(x=>{x.stores.issuedEquipment[0].holderId=9_999_999})).toContain('orphan issued equipment holder');
    expect(tamper(x=>{x.stores.issuedEquipment.push({...x.stores.issuedEquipment[0]})}))
      .toContain('duplicate issued equipment record');
    expect(tamper(x=>{x.stores.issuedEquipment[0].quantity=u.infEquipment+1}))
      .toContain('issued unit equipment exceeds held equipment');
  });

  it('preserves deterministic simulation with assigned equipment after save/load',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const unit=w.units.find(u=>u.owner===c)!;
    attributeEquipment(w,'unit',unit.id,[{country:c,modelId:rifle,quantity:5}]);
    const restored=await createTestEngine();
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    for(let i=0;i<20;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });
});
