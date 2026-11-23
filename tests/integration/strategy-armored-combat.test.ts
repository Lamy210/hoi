import {describe,expect,it} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {assertStrategyState,type Design,type StrategyState} from '../../src/engine/strategy/model';
import {issuedArmorPiercing} from '../../src/engine/strategy/combat/equippedArmor';
import {resolveLandExchange} from '../../src/engine/strategy/combat/land';
import {runStrategyTick} from '../../src/engine/strategy/tick';
import {saveStrategy,loadStrategy,strategyHash} from '../../src/engine/strategy/save';
import {transferEquipmentLot} from '../../src/engine/strategy/equipment/ledger';

function battle():StrategyState{
  const w=strategyFixture();
  w.wars=[{a:0,b:1}];
  w.divisions[0].province=1;
  w.divisions[0].planId=null;
  w.plans=[];
  assertStrategyState(w);
  return w;
}

function equipment(id:string,armor:number,piercing:number,attack=0):Design{
  return {id,category:'tank',year:2026,softAttack:attack,hardAttack:attack,
    defense:0,breakthrough:0,armor,piercing,reliability:.90,ic:10,materials:{}};
}

describe('land battle uses only issued equipment models',()=>{
  it('倉庫や未配備設計の装甲は戦闘力にならず、実配備装備だけで計算する',()=>{
    const w=battle();
    w.divisions[1].requiredEquipment={tank:2,infantry:8};
    w.designs.push(equipment('tank-armor',80,50));
    w.lots.push({holder:'warehouse',holderId:1,modelId:'tank-armor',quantity:2});
    const empty=issuedArmorPiercing(w,w.divisions[1]);
    expect(empty.armor).toBe(0);
    expect(empty.piercing).toBe(0);
    const unissued=runStrategyTick(w);
    const issued=structuredClone(w);
    issued.lots.find(l=>l.modelId==='tank-armor')!.quantity=1;
    issued.lots.push({holder:'division',holderId:2,modelId:'tank-armor',quantity:1});
    const stats=issuedArmorPiercing(issued,issued.divisions[1]);
    // Two demanded tanks (4-width each) and eight infantry (2-width each).
    expect(stats.totalRequiredWidth).toBe(24);
    expect(stats.armor).toBeCloseTo(80*4/24);
    expect(stats.piercing).toBeCloseTo(.7*50+.3*(50*4/24));
    expect(stats.armor).toBeLessThan(80);
    const defending=runStrategyTick(issued);
    expect(defending.next.divisions[1].hp).toBeGreaterThan(unissued.next.divisions[1].hp);
    expect(issued.lots.find(l=>l.modelId==='tank-armor'&&l.holder==='division')?.quantity).toBe(1);
  });

  it('AP=Armor境界では装甲半減を解除し、下回る時だけ半減する',()=>{
    const base=battle();
    base.divisions[0].requiredEquipment={tank:1};
    base.divisions[1].requiredEquipment={tank:1};
    base.designs.push(equipment('attack-tank',0,69.9,20),equipment('defend-tank',70,0));
    base.lots.push(
      {holder:'division',holderId:1,modelId:'attack-tank',quantity:1},
      {holder:'division',holderId:2,modelId:'defend-tank',quantity:1},
    );
    const below=runStrategyTick(base);
    const exact=structuredClone(base);
    exact.designs.find(d=>d.id==='attack-tank')!.piercing=70;
    const at=runStrategyTick(exact);
    const armoredLoss=100-below.next.divisions[1].hp;
    const normalLoss=100-at.next.divisions[1].hp;
    expect(normalLoss).toBeGreaterThan(0);
    expect(armoredLoss).toBeCloseTo(normalLoss/2,8);
    expect(issuedArmorPiercing(base,base.divisions[0]).piercing).toBeCloseTo(69.9);
    expect(issuedArmorPiercing(exact,exact.divisions[0]).piercing).toBe(70);
  });

  it('山岳戦闘幅50を超過した師団は予備扱いで戦闘せず、兵員も減らさない',()=>{
    const w=battle();
    w.provinces[1].terrain='mountains';
    w.divisions[0].combatWidth=50;
    for(const id of [3,4]){
      w.divisions.push({...w.divisions[0],id,combatWidth:50,
        soldiers:1,organization:100,hp:100,planId:null});
    }
    w.nations[0].population.reserves-=2;
    w.nations[0].population.soldiers+=2;
    assertStrategyState(w);
    const fight=runStrategyTick(w);
    expect(fight.reports.battleOrgLoss).toBeGreaterThan(0);
    expect(fight.next.divisions.find(d=>d.id===3)?.organization).toBe(100);
    expect(fight.next.divisions.find(d=>d.id===4)?.organization).toBe(100);
    expect(fight.next.divisions.find(d=>d.id===3)?.hp).toBe(100);
    expect(fight.next.divisions.find(d=>d.id===4)?.hp).toBe(100);
  });

  it('6時間目の壊滅後に死亡した師団が残り3回のサブフェーズで射撃しない',()=>{
    const w=battle();
    w.divisions[0].softAttack=100000;
    w.divisions[1].hp=1;
    const attacker=w.divisions[0],defender=w.divisions[1];
    const originalOutcome=resolveLandExchange(
      {...attacker,armor:0,piercing:0,terrain:.85,weather:1,commander:1,
        doctrine:1,planning:0},
      {...defender,armor:0,piercing:0,terrain:1,weather:1,commander:1,
        doctrine:1,planning:0},
    );
    const fight=runStrategyTick(w);
    expect(fight.next.divisions[1].hp).toBe(0);
    expect(fight.next.divisions[1].destroyed).toBe(true);
    expect(fight.next.divisions[0].organization).toBeCloseTo(
      100-originalOutcome.attackerOrgLoss,8);
    expect(fight.reports.battleOrgLoss).toBeCloseTo(
      Math.min(100,originalOutcome.defenderOrgLoss)+
      Math.min(100,originalOutcome.attackerOrgLoss),8);
  });

  it('幅超過の境界値・未知装備カテゴリーをStateのコミット前に拒否する',()=>{
    const w=battle();
    w.divisions[0].combatWidth=121;
    expect(()=>assertStrategyState(w)).toThrow(/combat width/);
    w.divisions[0].combatWidth=20;
    w.divisions[0].requiredEquipment={aircraft:1};
    expect(()=>assertStrategyState(w)).toThrow(/equipment requirements/);
  });

  it('4×6時間で小数の装備損耗を累積し、10個ロットの損失が切り捨てで消えない',()=>{
    const w=battle();
    w.divisions[0].softAttack=10000;
    w.divisions[1].requiredEquipment={infantry:10};
    w.lots.push({holder:'division',holderId:2,modelId:'rifle',quantity:10});
    const one=runStrategyTick(w);
    expect(one.reports.equipmentLoss).toBeGreaterThan(0);
    const remaining=one.next.lots.find(l=>l.holder==='division'&&l.holderId===2)!;
    expect(remaining.quantity).toBe(10-one.reports.equipmentLoss);
    expect(remaining.combatLossCarry).toBeGreaterThanOrEqual(0);
    expect(remaining.combatLossCarry).toBeLessThan(1);
    const restored=loadStrategy(saveStrategy(one.next));
    expect(restored.errors).toEqual([]);
    expect(restored.state?.lots.find(l=>l.holder==='division'&&l.holderId===2)?.combatLossCarry)
      .toBe(remaining.combatLossCarry);
    expect(strategyHash(runStrategyTick(restored.state!).next))
      .toBe(strategyHash(runStrategyTick(one.next).next));
  });

  it('損耗キャリーは一部の装備を倉庫へ返却・再配備しても消失せず割合移転する',()=>{
    const w=strategyFixture();
    w.divisions[0].requiredEquipment={infantry:2};
    w.lots.push({holder:'division',holderId:1,modelId:'rifle',quantity:2,
      combatLossCarry:.75});
    assertStrategyState(w);
    const totalCarry=()=>w.lots.reduce((sum,l)=>sum+(l.combatLossCarry??0),0);
    const before=totalCarry();
    transferEquipmentLot(w,'rifle',1,
      {holder:'division',holderId:1},{holder:'warehouse',holderId:0});
    expect(w.lots.find(l=>l.holder==='division')?.combatLossCarry).toBeCloseTo(.375);
    expect(w.lots.find(l=>l.holder==='warehouse')?.combatLossCarry).toBeCloseTo(.375);
    transferEquipmentLot(w,'rifle',1,
      {holder:'warehouse',holderId:0},{holder:'division',holderId:1});
    expect(totalCarry()).toBeCloseTo(before);
    assertStrategyState(w);
    const restored=loadStrategy(saveStrategy(w));
    expect(restored.errors).toEqual([]);
    expect(restored.state?.lots.reduce((s,l)=>s+(l.combatLossCarry??0),0)).toBeCloseTo(before);
  });

  it('複数日の同一seed再計算と保存・復元後の次Tickが一致する',()=>{
    const initial=battle();
    initial.divisions[0].requiredEquipment={tank:1};
    initial.designs.push(equipment('tracked-recon',30,45,8));
    initial.lots.push({holder:'division',holderId:1,modelId:'tracked-recon',quantity:1});
    const startHash=strategyHash(initial);
    const first=runStrategyTick(initial);
    const restored=loadStrategy(saveStrategy(first.next));
    expect(restored.errors).toEqual([]);
    expect(restored.state).not.toBeNull();
    expect(strategyHash(first.next)).toBe(strategyHash(restored.state!));
    expect(strategyHash(runStrategyTick(first.next).next)).toBe(
      strategyHash(runStrategyTick(restored.state!).next));
    expect(strategyHash(initial)).toBe(startHash);
  });
});
