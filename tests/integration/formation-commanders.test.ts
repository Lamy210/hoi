import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {savePayloadChecksum} from '../../src/engine/save/serialize';
import {autoAssignCommander,commanderMod} from '../../src/engine/military/commanders';
import {validateHierarchy} from '../../src/engine/military/armies';

async function fixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const u=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  const cmdr=w.commanders.find(x=>x.country===c)!;
  const foreign=w.commanders.find(x=>x.country!==c)!;
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  for(const [type,name] of [['createArmy','Army'],['createArmyGroup','Group']])expect(issue(type,{name,color:'#4479b6'}).ok).toBe(true);
  const assign=(kind:'army'|'group',id=cmdr.id)=>issue('assignFormationCommander',{kind,formationId:1,commanderId:id});
  return {e,w,c,u,cmdr,foreign,issue,assign};
}

describe('exclusive formation commanders',()=>{
  it('transfers division → army → group → division and supports unassignment',async()=>{
    const {w,u,cmdr,issue,assign}=await fixture();
    expect(issue('assignCommander',{unitId:u.id,commanderId:cmdr.id}).ok).toBe(true);
    expect(cmdr.assignedUnit).toBe(u.id);
    expect(assign('army').ok).toBe(true);
    expect(u.commanderId).toBe(-1);expect(cmdr.assignedUnit).toBe(-1);
    expect(w.armies[0].commanderId).toBe(cmdr.id);
    expect(assign('group').ok).toBe(true);
    expect(w.armies[0].commanderId).toBe(-1);
    expect(w.armyGroups[0].commanderId).toBe(cmdr.id);
    expect(issue('assignCommander',{unitId:u.id,commanderId:cmdr.id}).ok).toBe(true);
    expect(w.armyGroups[0].commanderId).toBe(-1);
    expect(issue('assignCommander',{unitId:u.id,commanderId:-1}).ok).toBe(true);
    expect(u.commanderId).toBe(-1);expect(cmdr.assignedUnit).toBe(-1);
    expect(validateHierarchy(w)).toEqual([]);
  });
  it('rejects foreign commanders and invalid formations without losing existing assignment',async()=>{
    const {w,cmdr,foreign,assign,issue}=await fixture();
    expect(assign('army').ok).toBe(true);
    expect(assign('army',foreign.id).reason).toBe('notYourCommander');
    expect(issue('assignFormationCommander',{kind:'army',formationId:99999,commanderId:cmdr.id}).reason).toBe('notYourArmy');
    expect(w.armies[0].commanderId).toBe(cmdr.id);
    expect(validateHierarchy(w)).toEqual([]);
  });
  it('does not auto-assign a formation commander or add unplanned combat modifiers',async()=>{
    const {w,u,cmdr,assign,issue}=await fixture();
    expect(issue('assignCommander',{unitId:u.id,commanderId:-1}).ok).toBe(true);
    expect(issue('assignArmy',{unitIds:[u.id],armyId:1}).ok).toBe(true);
    const baseline=commanderMod(w,u,'attack');
    expect(assign('army').ok).toBe(true);
    expect(commanderMod(w,u,'attack')).toBe(baseline);
    autoAssignCommander(w,u);
    expect(u.commanderId).not.toBe(cmdr.id);
    expect(w.armies[0].commanderId).toBe(cmdr.id);
    expect(validateHierarchy(w)).toEqual([]);
  });
  it('deleting empty formation releases its commander',async()=>{
    const {w,cmdr,assign,issue,u}=await fixture();
    expect(assign('army').ok).toBe(true);
    expect(issue('deleteArmy',{id:1}).ok).toBe(true);
    expect(w.armies).toEqual([]);
    expect(issue('assignCommander',{unitId:u.id,commanderId:cmdr.id}).ok).toBe(true);
    expect(cmdr.assignedUnit).toBe(u.id);
  });
  it('v9 round trips and rejects duplicate or foreign formation assignments',async()=>{
    const {e,w,cmdr,foreign,assign}=await fixture();
    expect(assign('army').ok).toBe(true);
    const bytes=e.serialize(),before=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    expect(e.world.armies[0].commanderId).toBe(cmdr.id);
    for(const mutate of [(s:any)=>s.armyGroups[0].commanderId=cmdr.id,(s:any)=>s.armies[0].commanderId=foreign.id]){
      const bad=decode(bytes) as any;mutate(bad.stores);
      bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
      expect(e.loadFrom(encode(bad)).ok).toBe(false);
      expect(hashWorld(e.world)).toBe(before);
    }
  });
  it('v8-shaped saves retain pre-existing division commanders and unassigned formations',async()=>{
    const {e,w,u,cmdr,issue}=await fixture();
    expect(issue('assignCommander',{unitId:u.id,commanderId:cmdr.id}).ok).toBe(true);
    const old=decode(e.serialize()) as any;
    delete old.stores.customTemplates; delete old.stores.counters.nextCustomTemplateId;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode;
    old.header.v=8;old.header.integrity=hashWorld(w,false,true,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.units.find(x=>x.id===u.id)?.commanderId).toBe(cmdr.id);
    expect(e.world.armies[0].commanderId??-1).toBe(-1);
  });
});
