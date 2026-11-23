import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {assertStrategyState, type StrategyState} from '../../src/engine/strategy/model';
import {createEquipmentDesign,switchEquipmentProduction} from '../../src/engine/strategy/designer/revisions';
import {saveStrategy,loadStrategy,strategyHash} from '../../src/engine/strategy/save';
import {runStrategyTick} from '../../src/engine/strategy/tick';
import {
  TANK_CHASSIS,TANK_GUNS,TANK_TURRETS,TANK_ENGINES,TANK_ARMORS,TANK_SPECIALS,
  AIR_FRAMES,AIR_ENGINES,AIR_WEAPONS,AIR_SPECIALS,
} from '../../src/engine/strategy/designer/catalog';
import type {TankBlueprint} from '../../src/engine/strategy/designer/tank';
import type {AircraftBlueprint} from '../../src/engine/strategy/designer/aircraft';

const TANK:TankBlueprint={chassis:'medium',gun:'multipurpose',turret:'three',
  engine:'diesel',armor:'sloped',specials:['radio']};
const AIR:AircraftBlueprint={frame:'small',engine:'piston',engineCount:1,
  weapons:['cannon'],specials:['radar','dropTank']};

function configured():StrategyState {
  const w=strategyFixture();
  w.nations[0].techDone=[
    TANK_CHASSIS.medium.tech,TANK_GUNS.multipurpose.tech,TANK_TURRETS.three.tech,
    TANK_ENGINES.diesel.tech,TANK_ARMORS.sloped.tech,TANK_SPECIALS.radio.tech,
    TANK_SPECIALS.fuelTank.tech,
    AIR_FRAMES.small.tech,AIR_ENGINES.piston.tech,AIR_WEAPONS.cannon.tech,
    AIR_SPECIALS.radar.tech,AIR_SPECIALS.dropTank.tech,
  ];
  // Resources are required per model, never created by registration.
  Object.assign(w.regions[0].resources,{rubber:100,tungsten:100,aluminium:100});
  assertStrategyState(w);
  return w;
}

describe('equipment revision -> factory -> canonical lots integration',()=>{
  it('研究済み戦車の不変型番を登録し製造すると倉庫に実装備が増える',()=>{
    const initial=configured();
    const hash=strategyHash(initial);
    const registered=createEquipmentDesign(initial,{actorCountry:0,familyId:'medium-series',
      kind:'tank',blueprint:TANK});
    expect(strategyHash(initial)).toBe(hash);
    expect(initial.designRevisions).toBeUndefined();
    expect(registered.modelId).toBe('custom.0.tank.medium-series.r1');
    expect(registered.revision).toBe(1);
    const model=registered.next.designs.find(d=>d.id===registered.modelId)!;
    expect(model.category).toBe('tank');
    expect(model.ic).toBe(29.46);
    expect(model.reliability).toBe(.82);
    expect(registered.next.lots).toEqual(initial.lots); // design ≠ manufacturing
    const switched=switchEquipmentProduction(registered.next,0,1,registered.modelId);
    expect(switched.lines[0].efficiency).toBe(.1);
    switched.factories.find(f=>f.id===2)!.baseIC=400;
    const running=runStrategyTick(switched);
    expect(running.production).toContainEqual({country:0,modelId:registered.modelId,quantity:1});
    expect(running.next.lots.find(l=>l.modelId===registered.modelId&&
      l.holder==='warehouse'&&l.holderId===0)?.quantity).toBe(1);
    expect(running.next.regions[0].resources.steel).toBeLessThan(initial.regions[0].resources.steel);
    expect(running.next.regions[0].resources.tungsten).toBeLessThan(initial.regions[0].resources.tungsten);
    expect(switched.lots.every(l=>l.modelId!==registered.modelId)).toBe(true);
    const loaded=loadStrategy(saveStrategy(running.next));
    expect(loaded.errors).toEqual([]);
    expect(strategyHash(loaded.state!)).toBe(strategyHash(running.next));
    expect(loaded.state!.designRevisions?.[0].frozenPreview).toEqual(
      running.next.designRevisions?.[0].frozenPreview);
  });

  it('航空機も任務の凍結プレビューを保持し実際のラインで生産できる',()=>{
    const w=configured();
    const result=createEquipmentDesign(w,{actorCountry:0,familyId:'fighter-alpha',
      kind:'aircraft',blueprint:AIR});
    const rev=result.next.designRevisions![0];
    expect(rev.kind).toBe('aircraft');
    if(rev.kind!=='aircraft')throw Error('invalid revision');
    expect(rev.frozenPreview.airAttack).toBe(18);
    expect(rev.frozenPreview.missionRadiusKm).toBe(402.26);
    const switched=switchEquipmentProduction(result.next,0,1,result.modelId);
    switched.factories.find(f=>f.id===2)!.baseIC=400;
    const produced=runStrategyTick(switched);
    expect(produced.production.find(x=>x.modelId===result.modelId)?.quantity).toBe(2);
    const model=produced.next.designs.find(d=>d.id===result.modelId)!;
    expect(model.ownerCountry).toBe(0);
    expect(model.category).toBe('aircraft');
    expect(model.ic).toBe(18);
    expect(model.softAttack).toBe(0); // Only air mission code may apply air attack stats
  });

  it('型番改訂は旧型の在庫・性能を遡及変更せず、設計版番号は連続する',()=>{
    let w=configured();
    const first=createEquipmentDesign(w,{actorCountry:0,familyId:'tank-k',kind:'tank',
      blueprint:TANK});
    w=first.next;
    w.lots.push({holder:'warehouse',holderId:0,modelId:first.modelId,quantity:3});
    const second=createEquipmentDesign(w,{actorCountry:0,familyId:'tank-k',kind:'tank',
      blueprint:{...TANK,specials:['radio','fuelTank']}});
    expect(second.revision).toBe(2);
    expect(second.modelId).not.toBe(first.modelId);
    expect(second.next.lots.find(l=>l.modelId===first.modelId)?.quantity).toBe(3);
    expect(second.next.designs.find(d=>d.id===first.modelId)?.ic).toBe(29.46);
    expect(second.next.designs.find(d=>d.id===second.modelId)?.ic).toBeGreaterThan(29.46);
    expect(second.next.designRevisions?.map(r=>r.revision)).toEqual([1,2]);
    expect(second.next.designs.filter(d=>d.category==='tank')).toHaveLength(2);
  });

  it('技術未研究・偽装国家・悪意ある型番/保存変更を原子的に拒否する',()=>{
    const raw=strategyFixture(),original=strategyHash(raw);
    expect(()=>createEquipmentDesign(raw,{actorCountry:0,familyId:'bad',
      kind:'tank',blueprint:TANK})).toThrow(/technology/);
    expect(()=>createEquipmentDesign(raw,{actorCountry:777,familyId:'bad',
      kind:'tank',blueprint:TANK})).toThrow(/country/);
    expect(()=>createEquipmentDesign(configured(),{actorCountry:0,familyId:'wrong.id',
      kind:'tank',blueprint:TANK})).toThrow(/family/);
    expect(strategyHash(raw)).toBe(original);

    const w=configured();
    const result=createEquipmentDesign(w,{actorCountry:0,familyId:'valid',kind:'tank',
      blueprint:TANK});
    const foreign=structuredClone(result.next);
    foreign.lines.push({id:2,country:1,factoryId:3,modelId:'rifle',
      active:true,efficiency:.8,carryIC:0});
    expect(()=>switchEquipmentProduction(foreign,1,2,result.modelId)).toThrow(/unavailable/);
    expect(()=>switchEquipmentProduction(result.next,0,1,'never-existed')).toThrow(/unavailable/);
    expect(()=>switchEquipmentProduction(result.next,1,1,result.modelId)).toThrow(/unauthorized/);

    const tampered=structuredClone(result.next);
    (tampered.designRevisions![0].frozenPreview as {reliability:number}).reliability=.99;
    expect(()=>assertStrategyState(tampered)).toThrow(/frozen/);
    expect(()=>saveStrategy(tampered)).toThrow();
    const tamperedStats=structuredClone(result.next);
    tamperedStats.designs.find(d=>d.id===result.modelId)!.ic=.01;
    expect(()=>assertStrategyState(tamperedStats)).toThrow(/immutable/);
  });

  it('ライン切替で旧機種の進捗ICを旧型番へ保管し再切替時に復帰する',()=>{
    const w=configured();
    const result=createEquipmentDesign(w,{actorCountry:0,familyId:'panther',kind:'tank',
      blueprint:TANK});
    const switched=switchEquipmentProduction(result.next,0,1,result.modelId);
    switched.lines[0].carryIC=9;
    const back=switchEquipmentProduction(switched,0,1,'rifle');
    expect(back.lines[0].carryByModel?.[result.modelId]).toBe(9);
    expect(back.lines[0].carryIC).toBe(0);
    expect(back.lines[0].efficiency).toBe(.1);
    const restored=switchEquipmentProduction(back,0,1,result.modelId);
    expect(restored.lines[0].carryIC).toBe(9);
    expect(restored.lines[0].carryByModel?.[result.modelId]).toBeUndefined();
    expect(loadStrategy(saveStrategy(restored)).errors).toEqual([]);
    expect(switched.lines[0].modelId).toBe(result.modelId);
  });
});
