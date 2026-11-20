import { describe, expect, it } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { hashWorld } from '../../src/engine/core/hash';
import { savePayloadChecksum } from '../../src/engine/save/serialize';
import { effectiveSupply } from '../../src/engine/core/state';
import { validateHierarchy } from '../../src/engine/military/armies';
import { summarizeDivisions } from '../../src/engine/military/armySummary';

async function fixture() {
  const e=await createTestEngine(), w=e.world, own=w.units.filter(u=>u.owner===w.playerCountry);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>,issuer='player')=>applyCommands(w,[{issuer,seq:++seq,type,p}])[0];
  const name=(name:string)=>({name,color:'#4479b6'});
  return {e,w,own,issue,name};
}

describe('army hierarchy and military overview',()=>{
  it('creates groups, assigns and reassigns units without duplicating them',async()=>{
    const {w,own,issue,name}=await fixture();
    expect(issue('createArmy',name('First')).ok).toBe(true);
    expect(issue('createArmy',name('Second')).ok).toBe(true);
    expect(issue('createArmyGroup',name('Group')).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:own.slice(0,2).map(u=>u.id),armyId:1}).ok).toBe(true);
    expect(issue('assignArmyGroup',{armyIds:[1,2],groupId:1}).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:[own[0].id],armyId:2}).ok).toBe(true);
    expect(own[0].armyId).toBe(2); expect(own[1].armyId).toBe(1);
    expect(issue('deleteArmy',{id:1}).reason).toBe('armyNotEmpty');
    expect(issue('deleteArmyGroup',{id:1}).reason).toBe('armyNotEmpty');
    expect(issue('assignArmy',{unitIds:[own[1].id],armyId:null}).ok).toBe(true);
    expect(issue('deleteArmy',{id:1}).ok).toBe(true);
    expect(issue('createArmy',name('Third')).ok).toBe(true);
    expect(w.armies.map(a=>a.id)).toEqual([2,3]);
    expect(validateHierarchy(w)).toEqual([]);
  });
  it('rejects foreign, duplicate and capacity-overflow membership atomically',async()=>{
    const {w,own,issue,name}=await fixture();
    const foreign=w.units.find(u=>u.owner!==w.playerCountry)!;
    expect(issue('createArmy',name('First')).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:[own[0].id,foreign.id],armyId:1}).reason).toBe('notYourUnit');
    expect(issue('assignArmy',{unitIds:[own[0].id,own[0].id],armyId:1}).reason).toBe('badParams');
    expect(own[0].armyId??null).toBeNull();
    const synthetic=Array.from({length:25},()=>({...own[0],id:w.nextUnitId++}));
    w.units.push(...synthetic);
    expect(issue('assignArmy',{unitIds:synthetic.slice(0,24).map(u=>u.id),armyId:1}).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:[synthetic[24].id],armyId:1}).reason).toBe('limitExceeded');
    expect(synthetic[24].armyId??null).toBeNull();
    expect(issue('createArmyGroup',name('Group')).ok).toBe(true);
    for(let i=0;i<5;i++) expect(issue('createArmy',name('Army '+i)).ok).toBe(true);
    expect(issue('assignArmyGroup',{armyIds:[1,2,3,4,5],groupId:1}).ok).toBe(true);
    expect(issue('assignArmyGroup',{armyIds:[6],groupId:1}).reason).toBe('limitExceeded');
    expect(w.armies.find(a=>a.id===6)?.groupId).toBeNull();
    expect(validateHierarchy(w)).toEqual([]);
  });
  it('exposes exact current resources, aggregated deficits and distinct supply components',async()=>{
    const {e,w,own,issue,name}=await fixture();
    expect(issue('createArmy',name('First')).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:[own[0].id,own[1].id],armyId:1}).ok).toBe(true);
    own[0].manpower=own[0].maxManpower-120;
    own[0].infEquipment=own[0].maxInfEquipment-15.5;
    own[0].artEquipment=own[0].maxArtEquipment-3;
    const snap=e.getUiSnapshot(0);
    const units=snap.units.filter(u=>u.armyId===1);
    expect(units).toHaveLength(2);
    const a=summarizeDivisions(units);
    expect(a.maxManpower-a.manpower).toBe(120);
    expect(a.maxInfantry-a.infantry).toBe(15.5);
    expect(a.maxArtillery-a.artillery).toBe(3);
    const x=units.find(u=>u.id===own[0].id)!;
    expect(x.loc).toBe(own[0].loc);
    expect(x.supply).toBeCloseTo(effectiveSupply(w,own[0]),3);
    expect(x.supply).toBeCloseTo(x.supplyBase*x.supplyCapacityFactor,3);
    expect(summarizeDivisions([]).org).toBeNull();
  });
  it('v7 round trip and structurally invalid group reference rejection',async()=>{
    const {e,w,own,issue,name}=await fixture();
    issue('createArmy',name('First'));issue('createArmyGroup',name('Group'));
    issue('assignArmy',{unitIds:[own[0].id],armyId:1});issue('assignArmyGroup',{armyIds:[1],groupId:1});
    const bytes=e.serialize(), before=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    expect(e.world.armies[0].groupId).toBe(1);
    expect(e.world.units.find(u=>u.id===own[0].id)?.armyId).toBe(1);
    const bad=decode(bytes) as any;
    bad.stores.armies[0].groupId=99999;
    bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
    expect(e.loadFrom(encode(bad)).ok).toBe(false);
    expect(hashWorld(e.world)).toBe(before);
  });
  it('v6-shaped save validates with original hash and migrates unassigned',async()=>{
    const {e,w}=await fixture();
    const old=decode(e.serialize()) as any;
    delete old.stores.customTemplates; delete old.stores.counters.nextCustomTemplateId;
    old.header.v=6;old.header.integrity=hashWorld(w,false,false);
    delete old.stores.armies;delete old.stores.armyGroups;
    delete old.stores.counters.nextArmyId;delete old.stores.counters.nextArmyGroupId;
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.armies).toEqual([]);expect(e.world.armyGroups).toEqual([]);
    expect(e.world.units.every(u=>u.armyId==null)).toBe(true);
  });
});
