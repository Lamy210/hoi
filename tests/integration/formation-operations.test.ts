import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {formationUnits,formationOperationalSummary} from '../../src/engine/military/formationOverview';
import {validateHierarchy} from '../../src/engine/military/armies';

describe('army / army group operational projection and bulk commands',()=>{
  it('resolves actual group membership, reports shortages, and does not mutate the simulation',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const own=w.units.filter(u=>u.owner===c).slice(0,2);
    expect(own.length).toBeGreaterThanOrEqual(2);
    let seq=0;
    const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    expect(cmd('createArmy',{name:'Alpha',color:'#4479b6'}).ok).toBe(true);
    expect(cmd('createArmy',{name:'Bravo',color:'#638b64'}).ok).toBe(true);
    expect(cmd('createArmyGroup',{name:'Northern Group',color:'#638b64'}).ok).toBe(true);
    expect(cmd('assignArmy',{armyId:1,unitIds:[own[0].id]}).ok).toBe(true);
    expect(cmd('assignArmy',{armyId:2,unitIds:[own[1].id]}).ok).toBe(true);
    expect(cmd('assignArmyGroup',{groupId:1,armyIds:[1,2]}).ok).toBe(true);
    expect(validateHierarchy(w)).toEqual([]);
    own[0].manpower-=120;
    own[1].infEquipment-=20;
    const snap=e.getUiSnapshot(0), before=hashWorld(w);
    const fromGroup=formationUnits(snap,{kind:'group',id:1});
    expect(fromGroup.map(u=>u.id)).toEqual(own.map(u=>u.id).sort((a,b)=>a-b));
    const group=formationOperationalSummary(fromGroup);
    expect(group.count).toBe(2);
    expect(group.maxManpower-group.manpower).toBe(120);
    expect(group.maxInfantry-group.infantry).toBe(20);
    expect(group.needsAttention).toBeGreaterThanOrEqual(2);
    expect(group.frontAssigned).toBe(0);
    const army=formationUnits(snap,{kind:'army',id:1});
    expect(army.map(u=>u.id)).toEqual([own[0].id]);
    expect(formationUnits(snap,{kind:'group',id:99999})).toEqual([]);
    expect(formationUnits(snap,{kind:'army',id:99999})).toEqual([]);
    expect(formationOperationalSummary([]).supply).toBeNull();
    expect(hashWorld(w)).toBe(before);
  });

  it('bulk holds/resumes all group divisions and respects group reassignment and save/load',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const own=w.units.filter(u=>u.owner===c).slice(0,2);
    expect(own.length).toBeGreaterThanOrEqual(2);
    let seq=0;
    const cmd=(type:string,p:Record<string,unknown>)=>
      applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    cmd('createArmy',{name:'First',color:'#4479b6'});
    cmd('createArmy',{name:'Second',color:'#638b64'});
    cmd('createArmyGroup',{name:'Group',color:'#638b64'});
    cmd('assignArmy',{armyId:1,unitIds:[own[0].id]});
    cmd('assignArmy',{armyId:2,unitIds:[own[1].id]});
    cmd('assignArmyGroup',{groupId:1,armyIds:[1,2]});
    const ids=formationUnits(e.getUiSnapshot(0),{kind:'group',id:1}).map(u=>u.id);
    expect(cmd('setManualHold',{units:ids,hold:true}).ok).toBe(true);
    const held=formationOperationalSummary(formationUnits(e.getUiSnapshot(0),{kind:'group',id:1}));
    expect(held.manualHold).toBe(2);
    expect(cmd('assignArmyGroup',{groupId:null,armyIds:[2]}).ok).toBe(true);
    const after=formationUnits(e.getUiSnapshot(0),{kind:'group',id:1});
    expect(after.map(u=>u.id)).toEqual(ids.filter(id=>id!==own[1].id));
    expect(cmd('setManualHold',{units:after.map(u=>u.id),hold:false}).ok).toBe(true);
    const current=formationOperationalSummary(formationUnits(e.getUiSnapshot(0),{kind:'group',id:1}));
    expect(current.manualHold).toBe(0);
    expect(own[1].manualHold).toBe(true);
    const before=hashWorld(w),restored=await createTestEngine();
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(before);
    expect(formationUnits(restored.getUiSnapshot(0),{kind:'group',id:1}).map(u=>u.id)).toEqual(after.map(u=>u.id));
    for(let day=0;day<12;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });

  it('rejects non-player-owned division IDs without partial hold mutations',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const mine=w.units.find(u=>u.owner===c)!,foreign=w.units.find(u=>u.owner!==c)!;
    const initial=!!mine.manualHold;
    const result=applyCommands(w,[{issuer:'player',seq:1,type:'setManualHold',
      p:{units:[mine.id,foreign.id],hold:true}}])[0];
    expect(result.ok).toBe(false);
    expect(!!mine.manualHold).toBe(initial);
  });
});
