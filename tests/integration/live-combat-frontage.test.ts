import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {startWar} from '../../src/engine/military/war';
import {projectCombatFronts,provinceCombatCapacity} from '../../src/engine/military/combatFrontProjection';
import {selectCombatFront} from '../../src/engine/military/unitComposition';
import {hashWorld} from '../../src/engine/core/hash';

async function battleFixture(){
  const engine=await createTestEngine();
  const w=engine.world,own=w.playerCountry;
  const opponent=w.units.find(u=>u.owner!==own)?.owner??(own===0?1:0);
  const capital=w.countries.capital[own];
  const source=w.units.find(u=>u.owner===own)!;
  const enemies=w.units.find(u=>u.owner===opponent)??source;
  w.prov.terrain[capital]=2; // mountains: 4 legacy battle slots × 20 width
  startWar(w,own,opponent,true);
  w.units=[
    ...Array.from({length:5},(_,i)=>({
      ...source,id:90000+i,owner:own,loc:capital,path:[],destroyed:false,
      org:100,manpower:source.maxManpower,infEquipment:source.maxInfEquipment,
    })),
    {...enemies,id:90100,owner:opponent,loc:capital,path:[],destroyed:false,
      org:100,manpower:enemies.maxManpower,infEquipment:enemies.maxInfEquipment},
  ];
  return {engine,w,capital,own,opponent};
}

describe('real-engine battle frontage projection',()=>{
  it('山岳幅80に5師団100幅ならID順に4師団が参戦・1師団が予備',async()=>{
    const {engine,w,capital}=await battleFixture();
    const before=hashWorld(w),unitCopy=JSON.stringify(w.units);
    const projection=projectCombatFronts(w);
    expect(projection).toHaveLength(1);
    const f=projection[0];
    expect(f.province).toBe(capital);
    expect(f.capacity).toBe(80);
    expect(provinceCombatCapacity(w,capital)).toBe(80);
    expect(f.defenders.engagedIds).toEqual([90000,90001,90002,90003]);
    expect(f.defenders.reserveIds).toEqual([90004]);
    expect(f.defenders.selectedWidth).toBe(80);
    expect(f.defenders.effectiveWidth).toBe(80);
    expect(f.defenders.widthPenalties).toEqual([
      {unitId:90000,factor:1},{unitId:90001,factor:1},
      {unitId:90002,factor:1},{unitId:90003,factor:1},
    ]);
    const selected=selectCombatFront(w,w.units.filter(u=>u.owner===w.playerCountry)
      .sort((a,b)=>a.id-b.id),4);
    expect(f.defenders.engagedIds).toEqual(selected.units.map(u=>u.id));
    const snap=engine.getUiSnapshot(0);
    expect(snap.combatFronts).toEqual(projection);
    expect(snap.units.find(u=>u.id===90000)?.frontageCapacity).toBe(80);
    expect(hashWorld(w)).toBe(before);
    expect(JSON.stringify(w.units)).toBe(unitCopy);
  });

  it('移動中・壊滅・平時の師団は戦場予測へ混入しない',async()=>{
    const {w,capital}=await battleFixture();
    w.units.find(u=>u.id===90000)!.path=[capital,Math.max(0,capital-1)];
    w.units.find(u=>u.id===90001)!.destroyed=true;
    const p=projectCombatFronts(w)[0];
    expect(p.defenders.engagedIds).toEqual([90002,90003,90004]);
    expect(p.defenders.reserveIds).toHaveLength(0);
    w.wars=[];
    expect(projectCombatFronts(w)).toEqual([]);
    startWar(w,w.playerCountry,w.units.find(u=>u.id===90100)!.owner,true);
    expect(projectCombatFronts(w)).toHaveLength(1);
    w.units.find(u=>u.id===90100)!.destroyed=true;
    expect(projectCombatFronts(w)).toEqual([]);
  });

  it('幅が地形上限を超える単独師団は既存のペナルティ付き参加を再現',async()=>{
    const {w,capital}=await battleFixture();
    w.prov.terrain[capital]=2; // width 80
    w.units=w.units.filter(u=>u.id===90000||u.id===90100);
    // Existing legacy units are 20-width, use a frozen custom template revision
    // with 25 battalions (50-width), then a deliberately narrow 0.5-slot test.
    const own=w.units.find(u=>u.id===90000)!;
    const actual=selectCombatFront(w,[own],.5);
    expect(actual.units.map(u=>u.id)).toEqual([own.id]);
    expect(actual.penalties).toEqual([.5]);
    // Real terrain cap is 80 and there is no penalty at 20-width.
    const view=projectCombatFronts(w)[0];
    expect(view.defenders.engagedIds).toEqual([own.id]);
    expect(view.defenders.widthPenalties).toEqual([{unitId:own.id,factor:1}]);
  });

  it('空の州・範囲外の州は安全に扱い、projectionは戦闘状態を更新しない',async()=>{
    const {w}=await battleFixture();
    expect(()=>provinceCombatCapacity(w,-1)).toThrow(/province/);
    expect(()=>provinceCombatCapacity(w,w.prov.count)).toThrow(/province/);
    const orig=hashWorld(w);
    for(let i=0;i<4;i++)projectCombatFronts(w);
    expect(hashWorld(w)).toBe(orig);
    w.units=[];
    expect(projectCombatFronts(w)).toEqual([]);
  });
});
