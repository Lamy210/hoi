import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {validateHierarchy} from '../../src/engine/military/armies';
import {previewDivisionAssignment,previewArmyGroupAssignment} from '../../src/engine/military/formationAssignment';
import type {UiUnit} from '../../src/engine/ui';

describe('multi-army and multi-division formation assignment preview',()=>{
  it('previews and atomically assigns multiple armies into one group, then saves deterministic hierarchy',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    let seq=0;const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    for(const name of ['Alpha','Bravo','Charlie'])
      expect(cmd('createArmy',{name,color:'#4479b6'}).ok).toBe(true);
    expect(cmd('createArmyGroup',{name:'North',color:'#4479b6'}).ok).toBe(true);
    const before=previewArmyGroupAssignment(w.armies,w.armyGroups,c,[3,1,2],1);
    expect(before).toMatchObject({reason:null,selected:3,current:0,projected:3,moved:3,capacity:5});
    expect(cmd('assignArmyGroup',{armyIds:[3,1,2],groupId:1}).ok).toBe(true);
    expect(w.armies.filter(a=>a.groupId===1).map(a=>a.id)).toEqual([1,2,3]);
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[1,2],1).reason).toBe('unchanged');
    expect(cmd('assignArmyGroup',{armyIds:[2,3],groupId:null}).ok).toBe(true);
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[1,2,3],1))
      .toMatchObject({reason:null,projected:3,moved:2});
    expect(validateHierarchy(w)).toEqual([]);
    const h=hashWorld(w),restored=await createTestEngine();
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(h);
    for(let i=0;i<12;i++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+w.tick).toBe(hashWorld(w));
    }
  });

  it('previews multi-division transfers including already assigned units without falsely exceeding capacity',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    let seq=0;const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    expect(cmd('createArmy',{name:'Alpha',color:'#4479b6'}).ok).toBe(true);
    const owned=w.units.filter(u=>u.owner===c).slice(0,2);
    expect(owned).toHaveLength(2);
    expect(cmd('assignArmy',{unitIds:[owned[0].id],armyId:1}).ok).toBe(true);
    const before=previewDivisionAssignment(w.units,w.armies,c,owned.map(u=>u.id),1);
    expect(before).toMatchObject({reason:null,current:1,projected:2,moved:1});
    expect(cmd('assignArmy',{unitIds:owned.map(u=>u.id),armyId:1}).ok).toBe(true);
    expect(previewDivisionAssignment(w.units,w.armies,c,owned.map(u=>u.id),1).reason).toBe('unchanged');
    expect(previewDivisionAssignment(w.units,w.armies,c,owned.map(u=>u.id),null))
      .toMatchObject({reason:null,moved:2});
    expect(cmd('assignArmy',{unitIds:owned.map(u=>u.id),armyId:null}).ok).toBe(true);
    expect(owned.every(u=>u.armyId===null)).toBe(true);
    expect(validateHierarchy(w)).toEqual([]);
  });

  it('shows over-capacity, duplicate, nonexistent and foreign ID failures before dispatch',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    let seq=0;const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    for(let i=0;i<6;i++)expect(cmd('createArmy',{name:'Army'+i,color:'#4479b6'}).ok).toBe(true);
    expect(cmd('createArmyGroup',{name:'Group',color:'#4479b6'}).ok).toBe(true);
    expect(cmd('assignArmyGroup',{armyIds:[1,2,3,4],groupId:1}).ok).toBe(true);
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[5,6],1))
      .toMatchObject({reason:'limitExceeded',current:4,projected:6});
    expect(cmd('assignArmyGroup',{armyIds:[5,6],groupId:1}).reason).toBe('limitExceeded');
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[4,5],1))
      .toMatchObject({reason:null,projected:5,moved:1});
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[5,5],1).reason).toBe('badSelection');
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[999],1).reason).toBe('badSelection');
    expect(previewArmyGroupAssignment(w.armies,w.armyGroups,c,[5],999).reason).toBe('noTarget');
    const owned=w.units.filter(u=>u.owner===c);
    const enemy=w.units.find(u=>u.owner!==c)!;
    expect(previewDivisionAssignment(w.units,w.armies,c,[owned[0].id,enemy.id],1).reason).toBe('badSelection');
    expect(previewDivisionAssignment(w.units,w.armies,c,[owned[0].id,owned[0].id],1).reason).toBe('badSelection');
    expect(previewDivisionAssignment(w.units,w.armies,c,[],1).reason).toBe('empty');
    const synthetic:UiUnit[]=Array.from({length:23},(_,i)=>({
      ...e.getUiSnapshot(0).units.find(u=>u.id===owned[0].id)!,id:100000+i,armyId:1,
    }));
    const projected=previewDivisionAssignment([
      ...w.units.map(u=>({id:u.id,owner:u.owner,armyId:u.armyId??null})),
      ...synthetic,
    ],w.armies,c,owned.map(u=>u.id),1);
    expect(projected).toMatchObject({reason:'limitExceeded',current:23,projected:25});
    expect(validateHierarchy(w)).toEqual([]);
  });
});
