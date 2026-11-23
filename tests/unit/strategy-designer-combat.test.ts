import {describe,it,expect} from 'vitest';
import {
  TANK_CHASSIS,TANK_GUNS,TANK_TURRETS,TANK_ENGINES,TANK_ARMORS,TANK_SPECIALS,
  AIR_FRAMES,AIR_ENGINES,AIR_WEAPONS,AIR_SPECIALS,
} from '../../src/engine/strategy/designer/catalog';
import {previewTank,type TankBlueprint} from '../../src/engine/strategy/designer/tank';
import {previewAircraft,type AircraftBlueprint} from '../../src/engine/strategy/designer/aircraft';
import {attritionChance,previewNonCombatAttrition,type AttritionOperation} from '../../src/engine/strategy/combat/attrition';
import {allocateFrontline,computeComposition,resolveLandExchange} from '../../src/engine/strategy/combat/land';

const TANK:TankBlueprint={
  chassis:'medium',gun:'multipurpose',turret:'three',engine:'diesel',armor:'sloped',specials:['radio'],
};
const TANK_TECHS=[
  TANK_CHASSIS.medium.tech,TANK_GUNS.multipurpose.tech,TANK_TURRETS.three.tech,
  TANK_ENGINES.diesel.tech,TANK_ARMORS.sloped.tech,TANK_SPECIALS.radio.tech,
  TANK_SPECIALS.appliqueArmor.tech,TANK_SPECIALS.fuelTank.tech,TANK_CHASSIS.light.tech,
  TANK_ENGINES.turbine.tech,
];
const AIR:AircraftBlueprint={frame:'small',engine:'piston',engineCount:1,
  weapons:['cannon'],specials:['radar','dropTank']};
const AIR_TECHS=[
  AIR_FRAMES.small.tech,AIR_ENGINES.piston.tech,AIR_WEAPONS.cannon.tech,
  AIR_SPECIALS.radar.tech,AIR_SPECIALS.dropTank.tech,AIR_WEAPONS.bombBay.tech,
  AIR_FRAMES.large.tech,
];

describe('strategy tank/aircraft designer reference contracts',()=>{
  it('中戦車の重さ・火力・装甲・速度・信頼性・ICを再現する',()=>{
    const result=previewTank(TANK,TANK_TECHS);
    expect(result.massT).toBe(26.7);
    expect(result.speedKmh).toBe(31.8);
    expect(result.armor).toBe(67.1);
    expect(result.softAttack).toBe(20);
    expect(result.hardAttack).toBe(20);
    expect(result.piercing).toBe(50);
    expect(result.breakthrough).toBe(24.71);
    expect(result.reliability).toBe(.82);
    expect(result.ic).toBe(29.46);
    expect(result.overflow).toBe(1);
    expect(result.materials.steel).toBeGreaterThan(0);
  });
  it('未研究・重量限度・特殊部品重複・不正カタログを拒否する',()=>{
    expect(()=>previewTank(TANK,[])).toThrow(/technology/);
    expect(()=>previewTank({...TANK,specials:['radio','radio']},TANK_TECHS)).toThrow(/duplicate/);
    const overweight:TankBlueprint={chassis:'light',gun:'multipurpose',turret:'three',
      engine:'turbine',armor:'sloped',specials:['appliqueArmor','fuelTank']};
    expect(()=>previewTank(overweight,TANK_TECHS)).toThrow(/load limit/);
    expect(()=>previewTank({...TANK,gun:'not-a-gun' as TankBlueprint['gun']},TANK_TECHS)).toThrow(/unknown/);
  });
  it('追加装甲はArmor/ICを増加、Speed/Rを低下させる',()=>{
    const base=previewTank(TANK,TANK_TECHS);
    const armored=previewTank({...TANK,specials:['radio','appliqueArmor']},TANK_TECHS);
    expect(armored.armor).toBeGreaterThan(base.armor);
    expect(armored.ic).toBeGreaterThan(base.ic);
    expect(armored.speedKmh).toBeLessThan(base.speedKmh);
    expect(armored.reliability).toBeLessThan(base.reliability);
  });
  it('小型レシプロ機の重量・出力・速力・航続・信頼性・ICを再現する',()=>{
    const result=previewAircraft(AIR,AIR_TECHS);
    expect(result.massT).toBe(4.4);
    expect(result.thrustRatio).toBe(1.14);
    expect(result.speedKmh).toBe(461.23);
    expect(result.rangeKm).toBe(893.91);
    expect(result.missionRadiusKm).toBe(402.26);
    expect(result.airAttack).toBe(18);
    expect(result.reliability).toBe(.88);
    expect(result.ic).toBe(18);
    expect(result.missions).toEqual(['air-superiority','interception']);
  });
  it('追加燃料タンクは航続を拡張する一方、速度・機動・信頼性を低下させる',()=>{
    const long=previewAircraft(AIR,AIR_TECHS);
    const short=previewAircraft({...AIR,specials:['radar']},AIR_TECHS);
    expect(long.rangeKm).toBeGreaterThan(short.rangeKm);
    expect(long.speedKmh).toBeLessThan(short.speedKmh);
    expect(long.agility).toBeLessThan(short.agility);
    expect(long.reliability).toBeLessThan(short.reliability);
  });
  it('未研究、無武装、出力不足、装備搭載上限を拒否し国家在庫を変更しない',()=>{
    expect(()=>previewAircraft(AIR,[])).toThrow(/technology/);
    expect(()=>previewAircraft({...AIR,weapons:[]},AIR_TECHS)).toThrow(/weapon/);
    expect(()=>previewAircraft({...AIR,engineCount:0},AIR_TECHS)).toThrow(/engine count/);
    expect(()=>previewAircraft({...AIR,weapons:['bombBay','bombBay'],specials:[]},AIR_TECHS))
      .toThrow(/payload/);
    const underpowered:AircraftBlueprint={frame:'large',engine:'piston',engineCount:2,
      weapons:['bombBay'],specials:[]};
    expect(()=>previewAircraft(underpowered,AIR_TECHS)).toThrow(/thrust/);
    expect(()=>previewAircraft({...AIR,specials:['radar','radar']},AIR_TECHS))
      .toThrow(/duplicate/);
  });
  it('合法性を満たす候補は有限・材料非負・信頼性35〜98%で再現可能',()=>{
    const first=previewTank(TANK,TANK_TECHS),second=previewTank(TANK,TANK_TECHS);
    expect(first).toEqual(second);
    for(const x of [first.ic,first.speedKmh,first.massT,first.reliability,
      ...Object.values(first.materials)])expect(Number.isFinite(x)).toBe(true);
    for(const frame of ['small','medium','large'] as const){
      const techs=[...AIR_TECHS,AIR_FRAMES[frame].tech];
      const design:AircraftBlueprint={frame,engine:'piston',
        engineCount:frame==='small'?1:frame==='medium'?2:4,
        weapons:['cannon'],specials:[]};
      const r=previewAircraft(design,techs);
      expect(r.reliability).toBeGreaterThanOrEqual(.35);
      expect(r.reliability).toBeLessThanOrEqual(.98);
      expect(r.ic).toBeGreaterThan(0);
      expect(Object.values(r.materials).every(x=>x>=0)).toBe(true);
    }
  });
});

describe('strategy land combat and noncombat attrition prototypes',()=>{
  const base:AttritionOperation={kind:'tank',activeUnits:1000,reliability:.8,
    weather:'adverse',terrain:'mud',distanceKm:175,maintenance:'normal',
    worldSeed:100,tick:10,subphase:2,entityId:55};
  it('悪路・低信頼性で故障期待値が増え、損失は整数で保有数以下',()=>{
    const chance=attritionChance(base);
    expect(chance).toBeCloseTo(.0052948155775);
    expect(attritionChance({...base,reliability:.95})).toBeLessThan(chance);
    const a=previewNonCombatAttrition(base),b=previewNonCombatAttrition(base);
    expect(a).toEqual(b);
    expect(Number.isSafeInteger(a.destroyed)).toBe(true);
    expect(a.destroyed).toBeGreaterThanOrEqual(0);
    expect(a.destroyed).toBeLessThanOrEqual(1000);
    expect(a.destroyed+a.survivors).toBe(1000);
    expect(previewNonCombatAttrition({...base,activeUnits:0}).destroyed).toBe(0);
  });
  it('航空機は作戦半径外での出撃不可、地上地形の二重故障を拒否',()=>{
    const op:AttritionOperation={...base,kind:'aircraft',terrain:'normal',
      missionRadiusKm:400,distanceKm:200};
    expect(attritionChance(op)).toBeGreaterThan(0);
    expect(()=>attritionChance({...op,distanceKm:401})).toThrow(/radius/);
    expect(()=>attritionChance({...op,terrain:'mud'})).toThrow(/terrain/);
    expect(()=>attritionChance({...op,reliability:1.1})).toThrow();
  });
  it('編成幅と装甲・貫通は大隊の実装備充足を加重し、装備0の装甲は0',()=>{
    const infantry={kind:'infantry' as const,count:9,softAttack:10,hardAttack:2,
      defense:12,breakthrough:3,armor:0,piercing:5,hardness:0,
      manpowerFill:1,equipmentFill:1};
    const tank={...infantry,kind:'tank' as const,count:1,armor:80,piercing:90,hardness:.9};
    const got=computeComposition([infantry,tank]);
    expect(got.width).toBe(22);
    expect(got.armor).toBeCloseTo(80*4/22);
    expect(got.hardness).toBeCloseTo(.9*4/22);
    expect(got.piercing).toBeCloseTo(.7*90+.3*((90*4+5*18)/22));
    expect(computeComposition([infantry,{...tank,equipmentFill:0}]).armor).toBe(0);
    expect(()=>computeComposition([])).toThrow();
  });
  it('山岳の幅50では幅30が1師団、超大幅師団は一部投入',()=>{
    const result=allocateFrontline([{id:2,priority:1,width:30},
      {id:1,priority:1,width:30}],'mountains');
    expect(result.engaged).toEqual([{id:1,widthPenalty:1}]);
    expect(result.reserveIds).toEqual([2]);
    const big=allocateFrontline([{id:3,priority:1,width:75}],'mountains');
    expect(big.engaged[0].widthPenalty).toBeCloseTo(50/75);
  });
  it('貫通がArmor未満なら被害半減し、装甲優位側のORGダメージは20%増',()=>{
    const baseLand={softAttack:100,hardAttack:40,hardness:.5,defense:70,breakthrough:30,
      terrain:1,weather:1,supply:1,commander:1,doctrine:1,planning:0};
    const attacker={...baseLand,armor:30,piercing:40};
    const defender={...baseLand,armor:70,piercing:40};
    const protectedResult=resolveLandExchange(attacker,defender);
    const unprotected=resolveLandExchange(attacker,{...defender,armor:40});
    expect(protectedResult.defenderArmored).toBe(true);
    expect(protectedResult.defenderHpLoss).toBeCloseTo(unprotected.defenderHpLoss*.5);
    expect(protectedResult.defenderOrgLoss).toBeCloseTo(unprotected.defenderOrgLoss*.5);
    expect(protectedResult.attackerOrgLoss).toBeCloseTo(unprotected.attackerOrgLoss*1.2);
    expect(resolveLandExchange({...attacker,piercing:70},defender).defenderArmored).toBe(false);
  });
});
