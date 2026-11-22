import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {reinforceIdleUnits} from '../../src/engine/systems/reinforcement';
import {hashWorld} from '../../src/engine/core/hash';
import {savePayloadChecksum} from '../../src/engine/save/serialize';

async function setup(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const own=w.units.filter(u=>u.owner===c&&!u.destroyed).slice(0,2).sort((a,b)=>a.id-b.id);
  const [low,high]=own;
  const province=w.countries.capital[c];
  for(const u of own){
    u.loc=province;u.path=[];u.encircled=false;u.destroyed=false;
    u.manpower=u.maxManpower-100;
    u.infEquipment=u.maxInfEquipment-100;
    u.artEquipment=u.maxArtEquipment-20;
    w.runtime.unitSupplyFactor.set(u.id,1);
  }
  w.runtime.supplyEff[province]=1;
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(issue('createArmy',{name:'high',color:'#4479b6'}).ok).toBe(true);
  expect(issue('assignArmy',{unitIds:[high.id],armyId:1}).ok).toBe(true);
  return {e,w,c,low,high,issue};
}

describe('army-scoped reinforcement allocation',()=>{
  it('uses scarce manpower and equipment for higher-priority army first',async()=>{
    const {w,c,low,high,issue}=await setup();
    expect(issue('setArmyReinforcementPriority',{armyId:1,priority:9}).ok).toBe(true);
    const original=[high.manpower,high.infEquipment,high.artEquipment];
    const other=[low.manpower,low.infEquipment,low.artEquipment];
    w.countries.manpowerPool[c]=20;w.countries.infEquipmentStock[c]=10;w.countries.artEquipmentStock[c]=3;
    reinforceIdleUnits(w,new Set());
    expect([high.manpower-original[0],high.infEquipment-original[1],high.artEquipment-original[2]]).toEqual([20,10,3]);
    expect([low.manpower,low.infEquipment,low.artEquipment]).toEqual(other);
    expect([w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual([0,0,0]);
  });
  it('uses stable original order at equal priority and does not refill active battles',async()=>{
    const {w,c,low,high,issue}=await setup();
    expect(issue('setArmyReinforcementPriority',{armyId:1,priority:5}).ok).toBe(true);
    w.countries.manpowerPool[c]=20;
    w.countries.infEquipmentStock[c]=0;
    w.countries.artEquipmentStock[c]=0;
    const oldLow=low.manpower,oldHigh=high.manpower;
    reinforceIdleUnits(w,new Set());
    expect(low.manpower-oldLow).toBe(20);
    expect(high.manpower).toBe(oldHigh);
    w.countries.manpowerPool[c]=50;
    reinforceIdleUnits(w,new Set([low.loc]));
    expect(low.manpower).toBe(oldLow+20);
    expect(high.manpower).toBe(oldHigh);
  });
  it('validates country ownership, integer range, and save v12 integrity',async()=>{
    const {e,w,issue}=await setup();
    expect(issue('setArmyReinforcementPriority',{armyId:1,priority:10}).reason).toBe('badParams');
    expect(issue('setArmyReinforcementPriority',{armyId:999,priority:9}).reason).toBe('notYourArmy');
    expect(issue('setArmyReinforcementPriority',{armyId:1,priority:2.5}).reason).toBe('badParams');
    expect(issue('setArmyReinforcementPriority',{armyId:1,priority:9}).ok).toBe(true);
    const bytes=e.serialize(),before=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(e.world.armies[0].reinforcementPriority).toBe(9);
    expect(hashWorld(e.world)).toBe(before);
    const bad=decode(bytes) as any;
    bad.stores.armies[0].reinforcementPriority=99;
    bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
    expect(e.loadFrom(encode(bad)).violations).toContain('invalid army reinforcement priority');
    expect(hashWorld(e.world)).toBe(before);
  });
  it('loads v11 shaped saves under original hash and defaults to neutral priority',async()=>{
    const {e,w,issue}=await setup();
    issue('setArmyReinforcementPriority',{armyId:1,priority:9});
    const old=decode(e.serialize()) as any;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode; delete old.stores.modelProduction; delete old.stores.modelStock; delete old.stores.issuedEquipment;
    old.header.v=11;old.header.integrity=hashWorld(w,false,true,true,true,true,true,false);
    delete old.stores.armies[0].reinforcementPriority;
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.armies[0].reinforcementPriority).toBeUndefined();
  });
});
