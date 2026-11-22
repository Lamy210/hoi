import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {attributeEquipment,validateIssuedEquipment} from '../../src/engine/systems/issuedEquipment';
import {adjustWarehouse,creditModelWarehouse,validateModelWarehouse} from '../../src/engine/systems/modelWarehouse';
import {equipmentModels} from '../../src/engine/military/equipmentCatalog';
import {unitPowerFactors} from '../../src/engine/systems/combat';
import {validateModelExchange} from '../../src/engine/military/modelExchange';

const old='infantry-rifle-1990',newRifle='infantry-rifle-2035',art='artillery-towed-2000';
const dispatch=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],seq:number,
  params:Record<string,unknown>)=>applyCommands(w,[{
    issuer:'player',seq,type:'exchangeUnitEquipment',p:params,
  }])[0];
const addWarehouse=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],c:number,
  modelId:string,amount:number)=>{
  const category=equipmentModels().find(m=>m.id===modelId)!.category;
  adjustWarehouse(w,c,category,amount);
  creditModelWarehouse(w,c,modelId,amount);
};
const attackFactor=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],u:
  Awaited<ReturnType<typeof createTestEngine>>['world']['units'][number])=>
  unitPowerFactors(w,u,u.loc,'attack').find(f=>f.label==='equipmentModel')?.value??1;

describe('explicit division model equipment exchange',()=>{
  it('exchanges unclassified division rifles for stocked modern rifles without changing physical totals',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c&&w.prov.controller[u.loc]===c)!;
    addWarehouse(w,c,newRifle,250);
    const origWarehouse=w.countries.infEquipmentStock[c],origUnit=u.infEquipment;
    const before=attackFactor(w,u);
    expect(before).toBe(1);
    const p={unitId:u.id,fromModelId:'unclassified',toModelId:newRifle,quantity:200};
    expect(validateModelExchange(w,c,p)).toBeNull();
    expect(dispatch(w,1,p).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(origWarehouse);
    expect(u.infEquipment).toBe(origUnit);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===newRifle)?.quantity).toBe(50);
    expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&r.modelId===newRifle)?.quantity).toBe(200);
    expect(attackFactor(w,u)).toBeGreaterThan(before);
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
    expect(validateModelWarehouse(w.modelStock,e.pack.equipmentModels??[],w.countries.count,
      w.countries.infEquipmentStock,w.countries.artEquipmentStock)).toEqual([]);
  });

  it('returns the exact former typed model to the warehouse while issuing a different model',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c&&w.prov.controller[u.loc]===c)!;
    addWarehouse(w,c,newRifle,100);
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:old,quantity:150}]);
    const total=w.countries.infEquipmentStock[c],held=u.infEquipment;
    const p={unitId:u.id,fromModelId:old,toModelId:newRifle,quantity:75};
    expect(dispatch(w,1,p).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(total);
    expect(u.infEquipment).toBe(held);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===old)?.quantity).toBe(75);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===newRifle)?.quantity).toBe(25);
    expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&r.modelId===old)?.quantity).toBe(75);
    expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&r.modelId===newRifle)?.quantity).toBe(75);
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
    expect(validateModelWarehouse(w.modelStock,e.pack.equipmentModels??[],w.countries.count,
      w.countries.infEquipmentStock,w.countries.artEquipmentStock)).toEqual([]);
  });

  it('rejects unavailable, incompatible, busy and out-of-control exchanges without changing ledgers',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c&&w.prov.controller[u.loc]===c)!;
    addWarehouse(w,c,newRifle,120);
    const p={unitId:u.id,fromModelId:'unclassified',toModelId:newRifle,quantity:60};
    const initial=JSON.stringify({modelStock:w.modelStock,issued:w.issuedEquipment,
      aggregate:w.countries.infEquipmentStock,unit:u.infEquipment});
    const rejected=[
      {...p,quantity:0},
      {...p,quantity:120000},
      {...p,quantity:1.5},
      {...p,quantity:121},
      {...p,quantity:u.infEquipment+1},
      {...p,toModelId:'unknown-model'},
      {...p,fromModelId:newRifle},
      {...p,fromModelId:art},
      {...p,unitId:-1},
      {...p,unitId:9_999_999},
    ];
    let seq=0;
    for(const command of rejected){
      expect(dispatch(w,++seq,command).ok,JSON.stringify(command)).toBe(false);
    }
    u.encircled=true;
    expect(dispatch(w,++seq,p).ok).toBe(false);
    u.encircled=false;
    w.runtime.activeBattles.add(u.loc);
    expect(dispatch(w,++seq,p).ok).toBe(false);
    w.runtime.activeBattles.delete(u.loc);
    const previous=w.prov.controller[u.loc];w.prov.controller[u.loc]=(c+1)%w.countries.count;
    expect(dispatch(w,++seq,p).ok).toBe(false);
    w.prov.controller[u.loc]=previous;
    expect(JSON.stringify({modelStock:w.modelStock,issued:w.issuedEquipment,
      aggregate:w.countries.infEquipmentStock,unit:u.infEquipment})).toBe(initial);
  });

  it('permits fielding physically held new models without research and persists exchanged combat quality',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c&&w.prov.controller[u.loc]===c)!;
    expect(w.research[c].done.includes('small-arms-next')).toBe(false);
    addWarehouse(w,c,newRifle,250);
    expect(dispatch(w,1,{unitId:u.id,fromModelId:'unclassified',toModelId:newRifle,quantity:200}).ok).toBe(true);
    const value=attackFactor(w,u),saved=e.serialize(),hash=hashWorld(w);
    const restored=await createTestEngine();
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hash);
    const unit=restored.world.units.find(x=>x.id===u.id)!;
    expect(attackFactor(restored.world,unit)).toBe(value);
    for(let tick=0;tick<20;tick++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });
});
