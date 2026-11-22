import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {formationUnits,scopedFormationUnits,formationOperationPreview} from '../../src/engine/military/formationOverview';

describe('formation command target selection and change preview',()=>{
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
    expect(scopedFormationUnits(scoped,'withoutFront').map(u=>u.id)).toEqual([second.id]);
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
