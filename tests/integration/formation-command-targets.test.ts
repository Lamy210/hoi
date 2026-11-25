import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {formationUnits,scopedFormationUnits,formationOperationPreview,canDeployFormation,toggleFormationArmySelection} from '../../src/engine/military/formationOverview';

describe('formation command target selection and change preview',()=>{
  it('toggles multiple army memberships deterministically without leaking foreign selections',async()=>{
    const e=await createTestEngine();
    const snap=e.getUiSnapshot(0),country=snap.playerCountry;
    const units=snap.units.filter(u=>u.owner===country).slice(0,3);
    expect(units.length).toBe(3);
    const [a,b,c]=units;
    const inGroup=[
      {...a,armyId:1},
      {...b,armyId:1},
      {...c,armyId:2},
    ];
    const first=toggleFormationArmySelection(inGroup,1,[999999]);
    expect(first).toEqual([a.id,b.id].sort((x,y)=>x-y));
    const both=toggleFormationArmySelection(inGroup,2,first!);
    expect(both).toEqual([a.id,b.id,c.id].sort((x,y)=>x-y));
    expect(toggleFormationArmySelection(inGroup,1,both!)).toEqual([c.id]);
    expect(toggleFormationArmySelection([...inGroup].reverse(),2,first!)).toEqual(both);
    expect(toggleFormationArmySelection(inGroup,3,both!)).toBeNull();
    expect(toggleFormationArmySelection(inGroup,2,first!,2)).toBeNull();
    expect(toggleFormationArmySelection(inGroup,1,[a.id])).toEqual([]);
  });

  it('prevents deployment of garrison divisions and busy units before issuing commands',async()=>{
    const e=await createTestEngine(),w=e.world,country=w.playerCountry;
    const snap=e.getUiSnapshot(0);
    const unit=snap.units.find(u=>u.owner===country)!;
    const front={id:777,owner:country,provinces:[unit.loc],revision:1};
    const eligible={...snap,fronts:[...snap.fronts,front as typeof snap.fronts[number]]};
    expect(canDeployFormation(eligible,[unit],front.id)).toBe(true);
    const guarded={...eligible,garrisons:[...eligible.garrisons,{
      id:1,owner:country,provinces:[unit.loc],unitIds:[unit.id],paused:true,revision:1,
    }]};
    expect(canDeployFormation(guarded,[unit],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[{...unit,manualHold:true}],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[{...unit,moving:true}],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[{...unit,inBattle:true}],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[{...unit,encircled:true}],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[unit],999999)).toBe(false);
    expect(canDeployFormation({...eligible,controller:eligible.controller.map(()=>-1)},[unit],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[],front.id)).toBe(false);
    expect(canDeployFormation(eligible,[{...unit,owner:country+1}],front.id)).toBe(false);
    void w;
  });

  it('scopes only owned formation divisions and produces deterministic non-mutating command sets',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const own=w.units.filter(u=>u.owner===c).slice(0,2);
    expect(own.length).toBe(2);
    expect(applyCommands(w,[{issuer:'player',seq:1,type:'createArmy',
      p:{name:'First',color:'#4479b6'}}])[0].ok).toBe(true);
    expect(applyCommands(w,[{issuer:'player',seq:2,type:'assignArmy',
      p:{armyId:1,unitIds:own.map(u=>u.id)}}])[0].ok).toBe(true);
    const before=hashWorld(w);
    const members=formationUnits(e.getUiSnapshot(0),{kind:'army',id:1});
    expect(members).toHaveLength(2);
    const [first,second]=members;
    // UI projections deliberately override status without writing to WorldState.
    const scoped=[
      {...first,frontId:5,manualHold:true,supply:0.25,inBattle:false,encircled:false},
      {...second,frontId:-1,manualHold:false,supply:1,inBattle:false,encircled:false,
        manpower:second.maxManpower,infEquipment:second.maxInfEquipment,
        artEquipment:second.maxArtEquipment},
    ];
    expect(scopedFormationUnits(scoped,'all').map(u=>u.id)).toEqual(members.map(u=>u.id));
    expect(scopedFormationUnits(scoped,'attention').map(u=>u.id)).toEqual([first.id]);
    expect(scopedFormationUnits(scoped,'lowSupply').map(u=>u.id)).toEqual([first.id]);
    expect(scopedFormationUnits(scoped,'understrength').map(u=>u.id)).toEqual(
      scoped.filter(u=>u.manpower<u.maxManpower||u.infEquipment<u.maxInfEquipment||u.artEquipment<u.maxArtEquipment).map(u=>u.id));
    expect(scopedFormationUnits([
      {...first,supply:1,manpower:first.maxManpower,infEquipment:first.maxInfEquipment,artEquipment:first.maxArtEquipment},
      {...second,supply:0.49},
    ],'lowSupply').map(u=>u.id)).toEqual([second.id]);
    expect(scopedFormationUnits([
      {...first,manpower:first.maxManpower,infEquipment:first.maxInfEquipment,artEquipment:first.maxArtEquipment},
      {...second,manpower:second.maxManpower-1},
    ],'understrength').map(u=>u.id)).toEqual([second.id]);
    expect(scopedFormationUnits(scoped,'withoutFront').map(u=>u.id)).toEqual([second.id]);
    expect(scopedFormationUnits(scoped,'manualHold').map(u=>u.id)).toEqual([first.id]);
    expect(scopedFormationUnits(scoped,'idle').map(u=>u.id)).toEqual([second.id]);
    expect(scopedFormationUnits([
      {...first,manualHold:false,moving:true},
      {...second,inBattle:true},
    ],'idle')).toEqual([]);
    expect(scopedFormationUnits([
      {...first,manualHold:false,encircled:true},
      {...second,manualHold:true},
    ],'idle')).toEqual([]);
    expect(scopedFormationUnits(scoped,'selected',[second.id,999999,second.id]).map(u=>u.id))
      .toEqual([second.id]);
    expect(scopedFormationUnits(scoped,'selected',[999999])).toEqual([]);
    expect(formationOperationPreview(scoped,'hold')).toEqual({
      ids:[second.id],unchanged:1,releasesManualHold:0,
    });
    expect(formationOperationPreview(scoped,'resume')).toEqual({
      ids:[first.id],unchanged:1,releasesManualHold:0,
    });
    expect(formationOperationPreview(scoped,'unassignFront')).toEqual({
      ids:[first.id],unchanged:1,releasesManualHold:0,
    });
    expect(formationOperationPreview(scoped,'assignFront')).toEqual({
      ids:[],unchanged:2,releasesManualHold:0,
    });
    expect(formationOperationPreview(scoped,'assignFront',5)).toEqual({
      ids:[first.id,second.id],unchanged:0,releasesManualHold:1,
    });
    expect(formationOperationPreview(scoped,'assignFront',5).ids)
      .toEqual(formationOperationPreview([...scoped].reverse(),'assignFront',5).ids);
    expect(formationOperationPreview([{...first,frontId:5,manualHold:false}],'assignFront',5))
      .toEqual({ids:[],unchanged:1,releasesManualHold:0});
    expect(hashWorld(w)).toBe(before);
  });
});
