import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {nextFormationName} from '../../src/engine/military/armies';

describe('bottom army command dock: auto names and atomic creation',()=>{
  it('generates deterministic per-country names, skipping occupied names',()=>{
    expect(nextFormationName('army',[])).toBe('軍団1');
    expect(nextFormationName('army',['軍団1','軍団2','Other'])).toBe('軍団3');
    expect(nextFormationName('group',['軍集団1','軍団1'])).toBe('軍集団2');
  });

  it('creates an army with selected divisions and a group with that army atomically',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const units=w.units.filter(u=>u.owner===c&&!u.destroyed).slice(0,2);
    expect(units).toHaveLength(2);
    let seq=0;
    const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    expect(cmd('createArmy',{color:'#4479b6',unitIds:units.map(u=>u.id)}).ok).toBe(true);
    const army=w.armies.find(a=>a.owner===c)!;
    expect(army.name).toBe('軍団1');
    expect(units.every(u=>u.armyId===army.id)).toBe(true);
    expect(cmd('createArmyGroup',{color:'#638b64',armyIds:[army.id]}).ok).toBe(true);
    const group=w.armyGroups.find(g=>g.owner===c)!;
    expect(group.name).toBe('軍集団1');
    expect(army.groupId).toBe(group.id);
    expect(cmd('renameFormation',{kind:'army',id:army.id,name:'北方軍団'}).ok).toBe(true);
    expect(cmd('renameFormation',{kind:'group',id:group.id,name:'東部軍集団'}).ok).toBe(true);
    expect(army.name).toBe('北方軍団');
    expect(group.name).toBe('東部軍集団');
    expect(cmd('createArmy',{color:'#ad8150'}).ok).toBe(true);
    expect(w.armies.find(a=>a.owner===c&&a.id!==army.id)?.name).toBe('軍団1');
    const expected=hashWorld(w);
    const restored=await createTestEngine();
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(expected);
    expect(restored.world.armies.find(a=>a.id===army.id)?.name).toBe('北方軍団');
    expect(restored.world.armyGroups.find(g=>g.id===group.id)?.name).toBe('東部軍集団');
    for(let day=0;day<6;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+day).toBe(hashWorld(w));
    }
  });

  it('rejects mixed/foreign/destroyed/duplicate batches before creating a formation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const own=w.units.find(u=>u.owner===c&&!u.destroyed)!;
    const foreign=w.units.find(u=>u.owner!==c&&!u.destroyed)!;
    let seq=0;
    const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    const beforeArmies=w.armies.length,counter=w.nextArmyId,groupCounter=w.nextArmyGroupId;
    const originalArmyId=own.armyId;
    for(const ids of [[own.id,foreign.id],[own.id,own.id],[],[own.id,999999]]){
      expect(cmd('createArmy',{color:'#4479b6',unitIds:ids}).ok).toBe(false);
      expect(w.armies).toHaveLength(beforeArmies);
      expect(w.nextArmyId).toBe(counter);
      expect(own.armyId).toBe(originalArmyId);
    }
    expect(cmd('createArmy',{color:'#4479b6',name:'a'.repeat(65)}).ok).toBe(false);
    expect(cmd('createArmyGroup',{color:'#638b64',armyIds:[-1]}).ok).toBe(false);
    expect(w.nextArmyGroupId).toBe(groupCounter);
    expect(cmd('createArmy',{color:'#4479b6',unitIds:[own.id]}).ok).toBe(true);
    const army=w.armies.find(a=>a.owner===c)!;
    const groupCount=w.armyGroups.length;
    expect(cmd('createArmyGroup',{color:'#638b64',armyIds:[army.id,army.id]}).ok).toBe(false);
    expect(w.armyGroups).toHaveLength(groupCount);
    expect(cmd('createArmyGroup',{color:'#638b64',armyIds:[army.id,99999]}).ok).toBe(false);
    expect(w.armyGroups).toHaveLength(groupCount);
    expect(cmd('renameFormation',{kind:'army',id:army.id,name:'bad\nname'}).ok).toBe(false);
    expect(cmd('renameFormation',{kind:'group',id:army.id,name:'invalid'}).ok).toBe(false);
    expect(army.name).toBe('軍団1');
  });

  it('does not let a foreign issuer rename or steal player formations',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const foreign=w.units.find(u=>u.owner!==c&&!u.destroyed)!.owner;
    const cmd=(issuer:string,seq:number,type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer,seq,type,p}])[0];
    expect(cmd('player',1,'createArmy',{color:'#4479b6'}).ok).toBe(true);
    const army=w.armies.find(a=>a.owner===c)!;
    expect(cmd('ai:'+foreign,1,'renameFormation',{kind:'army',id:army.id,name:'Hijacked'}).ok).toBe(false);
    expect(cmd('frontai',1,'renameFormation',{kind:'army',id:army.id,name:'Hijacked'}).ok).toBe(false);
    expect(army.name).toBe('軍団1');
  });
});
