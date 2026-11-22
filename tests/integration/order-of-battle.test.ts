import {describe, expect, it} from 'vitest';
import {createTestEngine} from '../helpers';
import {buildOrderOfBattle,unitRequiresAttention} from '../../src/ui/OrderOfBattle';

describe('order of battle grouping',()=>{
  it('groups by country/group/army with every division appearing exactly once in stable order',async()=>{
    const e=await createTestEngine(),snap=e.getUiSnapshot(0),country=snap.playerCountry;
    const units=snap.units.filter(u=>u.owner===country).slice(0,4);
    expect(units.length).toBeGreaterThanOrEqual(3);
    snap.armyGroups=[{id:3,owner:country,name:'Southern',color:'#557799'}];
    snap.armies=[
      {id:20,owner:country,name:'Second army',color:'#557799',groupId:3},
      {id:10,owner:country,name:'First army',color:'#557799',groupId:null}
    ];
    units[0].armyId=20;units[1].armyId=20;units[2].armyId=10;
    const result=buildOrderOfBattle(snap.units,snap.armies,snap.armyGroups,country);
    expect(result.groups.map(g=>g.group.id)).toEqual([3]);
    expect(result.groups[0].armies[0].units.map(u=>u.id)).toEqual([units[0].id,units[1].id].sort((a,b)=>a-b));
    expect(result.independent.map(a=>a.army.id)).toEqual([10]);
    const all=[...result.groups.flatMap(g=>g.armies.flatMap(a=>a.units)),
      ...result.independent.flatMap(a=>a.units),...result.unassigned];
    expect(all.length).toBe(snap.units.filter(u=>u.owner===country).length);
    expect(new Set(all.map(u=>u.id)).size).toBe(all.length);
    expect(all.every(u=>u.owner===country)).toBe(true);
  });
  it('reports deficits, supply shortage and combat state as attention needed',async()=>{
    const e=await createTestEngine(),u=e.getUiSnapshot(0).units.find(u=>u.owner===e.world.playerCountry)!;
    const fresh={...u,supply:1,manpower:u.maxManpower,infEquipment:u.maxInfEquipment,
      artEquipment:u.maxArtEquipment,encircled:false,inBattle:false};
    expect(unitRequiresAttention(fresh)).toBe(false);
    expect(unitRequiresAttention({...fresh,supply:0.49})).toBe(true);
    expect(unitRequiresAttention({...fresh,infEquipment:fresh.maxInfEquipment-1})).toBe(true);
    expect(unitRequiresAttention({...fresh,inBattle:true})).toBe(true);
  });
});
