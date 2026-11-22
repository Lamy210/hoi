import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import type {WorldState,Unit} from '../../src/engine/core/state';
import {adjustWarehouse,creditModelWarehouse,validateModelWarehouse} from '../../src/engine/systems/modelWarehouse';
import {attributeEquipment,validateIssuedEquipment} from '../../src/engine/systems/issuedEquipment';
import {applyBatchModelExchange,MAX_BATCH_MODEL_EXCHANGE,planBatchModelExchange} from '../../src/engine/military/modelExchange';
import {unitPowerFactors} from '../../src/engine/systems/combat';

const oldRifle='infantry-rifle-1990',newRifle='infantry-rifle-2035';
const findUnits=(w:WorldState,c:number)=>w.units.filter(u=>u.owner===c&&!u.destroyed&&
  w.prov.controller[u.loc]===c&&!u.path.length&&!u.encircled).slice(0,3);
const grant=(w:WorldState,c:number,id:string,n:number)=>{
  adjustWarehouse(w,c,'infantry',n);
  creditModelWarehouse(w,c,id,n);
};
const cmd=(w:WorldState,seq:number,p:Record<string,unknown>)=>
  applyCommands(w,[{issuer:'player',seq,type:'exchangeUnitsEquipment',p}])[0];
const snapshots=(w:WorldState)=>JSON.stringify({
  typed:w.modelStock,issued:w.issuedEquipment,
  inf:w.countries.infEquipmentStock,art:w.countries.artEquipmentStock,
  units:w.units.map(u=>({id:u.id,inf:u.infEquipment,art:u.artEquipment})),
});
const attack=(w:WorldState,u:Unit)=>unitPowerFactors(w,u,u.loc,'attack')
  .find(x=>x.label==='equipmentModel')?.value??1;

describe('batch division equipment exchange',()=>{
  it('preflights aggregated target stock and rejects insufficient batches without partial mutations',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const units=findUnits(w,c).slice(0,2);expect(units).toHaveLength(2);
    grant(w,c,newRifle,190);
    const request={unitIds:units.map(u=>u.id),fromModelId:'unclassified',
      toModelId:newRifle,quantity:100};
    expect(planBatchModelExchange(w,c,request)).toEqual({
      reason:'insufficientModelStock',plan:null,
    });
    const before=snapshots(w);
    expect(cmd(w,1,request)).toMatchObject({ok:false,reason:'insufficientModelStock'});
    expect(snapshots(w)).toBe(before);
    grant(w,c,newRifle,10);
    const initStock=w.countries.infEquipmentStock[c];
    const beforeHeld=units.map(u=>u.infEquipment);
    const beforeAttack=units.map(u=>attack(w,u));
    expect(cmd(w,2,request).ok).toBe(true);
    expect(units.map(u=>u.infEquipment)).toEqual(beforeHeld);
    expect(units.every(u=>attack(w,u)>beforeAttack[0])).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(initStock);
    expect(w.modelStock.some(r=>r.country===c&&r.modelId===newRifle)).toBe(false);
    for(const u of units){
      expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&
        r.modelId===newRifle)?.quantity).toBe(100);
    }
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
    expect(validateModelWarehouse(w.modelStock,e.pack.equipmentModels??[],w.countries.count,
      w.countries.infEquipmentStock,w.countries.artEquipmentStock)).toEqual([]);
  });

  it('returns old classified rifles from every selected unit while supplying new model stock',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const units=findUnits(w,c).slice(0,2);expect(units).toHaveLength(2);
    grant(w,c,newRifle,250);
    for(const u of units)attributeEquipment(w,'unit',u.id,[{
      country:c,modelId:oldRifle,quantity:110,
    }]);
    const aggregate=w.countries.infEquipmentStock[c];
    const request={unitIds:units.map(u=>u.id).reverse(),fromModelId:oldRifle,
      toModelId:newRifle,quantity:100};
    expect(cmd(w,1,request).ok).toBe(true);
    expect(w.countries.infEquipmentStock[c]).toBe(aggregate);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===oldRifle)?.quantity).toBe(200);
    expect(w.modelStock.find(r=>r.country===c&&r.modelId===newRifle)?.quantity).toBe(50);
    for(const u of units){
      expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&
        r.modelId===oldRifle)?.quantity).toBe(10);
      expect(w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===u.id&&
        r.modelId===newRifle)?.quantity).toBe(100);
    }
    expect(validateIssuedEquipment(w,e.pack.equipmentModels??[])).toEqual([]);
  });

  it('rejects duplicate IDs, bad sizes, other owners, unavailable source, and one busy division',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const units=findUnits(w,c).slice(0,2);expect(units).toHaveLength(2);
    grant(w,c,newRifle,300);
    const p={unitIds:units.map(u=>u.id),fromModelId:'unclassified',
      toModelId:newRifle,quantity:100};
    const enemy=w.units.find(u=>u.owner!==c&&!u.destroyed)!;
    const inputs=[
      {...p,unitIds:[units[0].id,units[0].id]},
      {...p,unitIds:[units[0].id]},
      {...p,unitIds:[]},
      {...p,unitIds:[units[0].id,enemy.id]},
      {...p,unitIds:[units[0].id,999999]},
      {...p,unitIds:['bad',units[1].id]},
      {...p,quantity:0},{...p,quantity:1.5},
      {...p,quantity:100001},
      {...p,fromModelId:newRifle},
      {...p,fromModelId:oldRifle},
    ];
    let seq=0;
    const before=snapshots(w);
    for(const item of inputs){
      expect(cmd(w,++seq,item).ok,JSON.stringify(item)).toBe(false);
      expect(snapshots(w)).toBe(before);
    }
    const longIds=Array.from({length:MAX_BATCH_MODEL_EXCHANGE+1},(_,i)=>i+1);
    expect(cmd(w,++seq,{...p,unitIds:longIds}).ok).toBe(false);
    expect(snapshots(w)).toBe(before);
    units[1].encircled=true;
    expect(cmd(w,++seq,p)).toMatchObject({ok:false,reason:'unitBusy'});
    units[1].encircled=false;
    units[1].path=[units[1].loc,units[1].loc+1];
    expect(cmd(w,++seq,p)).toMatchObject({ok:false,reason:'unitBusy'});
    units[1].path=[];
    w.runtime.activeBattles.add(units[1].loc);
    expect(cmd(w,++seq,p)).toMatchObject({ok:false,reason:'unitBusy'});
    w.runtime.activeBattles.delete(units[1].loc);
    expect(snapshots(w)).toBe(before);
  });

  it('sorts unit IDs for deterministic hashes and preserves model attribution through save and load',async()=>{
    const one=await createTestEngine(),two=await createTestEngine();
    const w=one.world,v=two.world,c=w.playerCountry;
    const units=findUnits(w,c).slice(0,2);expect(units).toHaveLength(2);
    grant(w,c,newRifle,400);
    grant(v,c,newRifle,400);
    const request={unitIds:units.map(u=>u.id),fromModelId:'unclassified',
      toModelId:newRifle,quantity:150};
    expect(planBatchModelExchange(w,c,{...request,unitIds:request.unitIds.slice().reverse()})
      .plan?.unitIds).toEqual(request.unitIds.slice().sort((a,b)=>a-b));
    expect(cmd(w,1,request).ok).toBe(true);
    expect(cmd(v,1,{...request,unitIds:request.unitIds.slice().reverse()}).ok).toBe(true);
    expect(hashWorld(w)).toBe(hashWorld(v));
    const restored=await createTestEngine();
    expect(restored.loadFrom(one.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let i=0;i<20;i++){
      one.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });

  it('rolls back all model and aggregate ledger changes if a later step fails unexpectedly',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const units=findUnits(w,c).slice(0,2);expect(units).toHaveLength(2);
    grant(w,c,newRifle,250);
    // Deliberately inject an extreme legacy ledger that passes command
    // preflight but overflows the safe model quantity on the SECOND refund.
    // The first successful candidate update must not leak into live state.
    w.modelStock.push({country:c,modelId:oldRifle,quantity:Number.MAX_SAFE_INTEGER-150});
    w.modelStock.sort((a,b)=>a.country-b.country||a.modelId.localeCompare(b.modelId));
    w.countries.infEquipmentStock[c]=Number.MAX_SAFE_INTEGER+10000;
    attributeEquipment(w,'unit',units[0].id,[{country:c,modelId:oldRifle,quantity:100}]);
    attributeEquipment(w,'unit',units[1].id,[{country:c,modelId:oldRifle,quantity:100}]);
    const p={unitIds:units.map(u=>u.id),fromModelId:oldRifle,
      toModelId:newRifle,quantity:100};
    const snap=snapshots(w);
    expect(planBatchModelExchange(w,c,p).reason).toBeNull();
    expect(()=>applyBatchModelExchange(w,c,p)).toThrow('model warehouse overflow');
    expect(snapshots(w)).toBe(snap);
  });
});
