import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {runStrategyTick,STRATEGY_PHASES} from '../../src/engine/strategy/tick';
import {assertStrategyState,populationSize} from '../../src/engine/strategy/model';
import {strategyHash} from '../../src/engine/strategy/save';
import {daysFromCivil} from '../../src/engine/clock/date';
import {transferFactoryOperation} from '../../src/engine/strategy/rules';

const cash=(w:ReturnType<typeof strategyFixture>)=>w.nations.reduce((s,n)=>s+n.cash+n.householdCash,0);
const pop=(w:ReturnType<typeof strategyFixture>)=>w.nations.reduce((s,n)=>s+populationSize(n.population),0);
const equipment=(w:ReturnType<typeof strategyFixture>)=>w.lots.reduce((s,l)=>s+l.quantity,0);
describe('five-phase deterministic strategy simulation',()=>{
  it('市場→研究生産→補給移動委任→戦闘空襲→占領政治の順に一日実行',()=>{
    const input=strategyFixture(),original=strategyHash(input);
    const result=runStrategyTick(input);
    expect(result.phases).toEqual([...STRATEGY_PHASES]);
    expect(result.next.tick).toBe(1);
    expect(result.next.quotes[0].price).toBeGreaterThan(input.quotes[0].price);
    expect(result.next.construction[0].remainingIC).toBeLessThan(20);
    expect(result.production).toEqual([{country:0,modelId:'rifle',quantity:5}]);
    expect(equipment(result.next)-equipment(input)).toBe(5);
    expect(result.next.research[0].progress).toBeGreaterThan(0);
    expect(result.next.occupations[0].resistance).not.toBe(20);
    expect(result.orders).toHaveLength(0);
    expect(cash(result.next)).toBeCloseTo(cash(input));
    expect(pop(result.next)).toBe(pop(input));
    expect(strategyHash(input)).toBe(original); // transactional, input unchanged
  });
  it('民需工場の建設費は国庫から支払い、完成施設は翌日からのみ稼働',()=>{
    const w=strategyFixture();
    const first=runStrategyTick(w).next;
    expect(first.factories.some(f=>f.id===4)).toBe(false);
    const second=runStrategyTick(first).next;
    expect(second.factories.find(f=>f.id===4)?.kind).toBe('civilian');
    expect(second.construction).toHaveLength(0);
    expect(cash(second)).toBeCloseTo(cash(w));
    expect(w.factories.some(f=>f.id===4)).toBe(false);
  });
  it('戦略爆撃は当日生産に影響しないが翌日から低下する',()=>{
    const input=strategyFixture();
    const day1=runStrategyTick(input,[{factoryId:2,damage:0.5}]);
    const plain=runStrategyTick(input);
    expect(day1.production).toEqual(plain.production);
    expect(day1.next.factories.find(f=>f.id===2)?.damage).toBe(0.5);
    const day2=runStrategyTick(day1.next);
    expect(day2.production[0].quantity).toBeLessThan(day1.production[0].quantity);
  });
  it('占領済み州の工場は旧所有国に丸ごと二重に生産されない',()=>{
    const base=strategyFixture();
    base.lines.push({id:2,country:1,factoryId:3,modelId:'rifle',efficiency:1,carryIC:0,active:true});
    const underOccupation=runStrategyTick(base).production.filter(x=>x.country===1)
      .reduce((s,x)=>s+x.quantity,0);
    const peace=structuredClone(base);peace.occupations=[];
    const fullyControlled=runStrategyTick(peace).production.filter(x=>x.country===1)
      .reduce((s,x)=>s+x.quantity,0);
    expect(underOccupation).toBeLessThan(fullyControlled);
    expect(fullyControlled).toBe(3);
  });
  it('AI攻撃には開戦かつ承認が必須。手動固定を尊重',()=>{
    const w=strategyFixture();
    w.plans[0].paused=false;w.plans[0].authorized=true;
    expect(runStrategyTick(w).orders).toHaveLength(0);
    w.wars=[{a:0,b:1}];
    expect(runStrategyTick(w).orders).toEqual([{planId:1,divisionId:1,targetProvince:1,type:'attack'}]);
    w.divisions[0].manualHold=true;
    expect(runStrategyTick(w).orders).toHaveLength(0);
  });
  it('独立の異なる入力に対して同じ30日結果を再現し資金/人口/物資は全て非負',()=>{
    const original=strategyFixture();
    const run=()=>{
      let w=strategyFixture();
      for(let day=0;day<30;day++){
        w=runStrategyTick(w).next;
        assertStrategyState(w);
        expect(cash(w)).toBeCloseTo(cash(original));
        expect(pop(w)).toBe(pop(original));
        expect(w.regions.every(r=>Object.values(r.resources).every(v=>v>=0))).toBe(true);
      }
      return strategyHash(w);
    };
    expect(run()).toBe(run());
  });
  it('不正な外部入力は全体ロールバックされる（初期State非変更）',()=>{
    const w=strategyFixture(),before=strategyHash(w);
    expect(()=>runStrategyTick(w,[{factoryId:2,damage:-0.01}])).toThrow();
    expect(strategyHash(w)).toBe(before);
    expect(()=>runStrategyTick(w,[{factoryId:999,damage:0.1}])).toThrow();
  });
  it('戦闘相当フェーズの組織率/HP損耗は非負で決定論的',()=>{
    const w=strategyFixture();
    w.wars=[{a:0,b:1}];w.divisions[0].province=1;
    const a=runStrategyTick(w),b=runStrategyTick(w);
    expect(a.reports.battleOrgLoss).toBeGreaterThan(0);
    expect(a.next.divisions[1].organization).toBeLessThan(100);
    expect(a.next.divisions.every(d=>d.organization>=0&&d.hp>=0)).toBe(true);
    expect(strategyHash(a.next)).toBe(strategyHash(b.next));
  });

  it('建設材料0で工場は労働力を占有せず、軍需生産が止まらない',()=>{
    const w=strategyFixture();
    w.regions[0].resources.concrete=0;
    w.nations[0].population.workers=10;
    w.nations[0].population.unemployed+=30;
    const result=runStrategyTick(w);
    expect(result.next.construction[0].remainingIC).toBe(20);
    expect(result.production).toEqual([{modelId:'rifle',country:0,quantity:5}]);
    expect(result.next.nations[0].cash).toBe(100);
  });
  it('昨日の産出・原料在庫を翌日市場へ反映し、固定Quoteに収束しない',()=>{
    const w=strategyFixture();
    const one=runStrategyTick(w).next;
    expect(one.quotes[0].supply).toBeGreaterThan(0);
    expect(one.quotes[0].demand).toBeGreaterThan(0);
    const two=runStrategyTick(one).next;
    expect(one.quotes[0].price).toBeGreaterThan(2);
    expect(two.quotes[0].price).toBeLessThan(one.quotes[0].price);
  });
  it('研究年度はシナリオ開始日から計算し、占領で利用不能工場は枠に寄与しない',()=>{
    const original=strategyFixture();
    const early=structuredClone(original);
    early.epochDays=daysFromCivil(1940,1,1);
    const normal=runStrategyTick(original).next.research[0].progress;
    const penalty=runStrategyTick(early).next.research[0].progress;
    expect(penalty).toBeLessThan(normal);
    const project={...original.research[0],techId:'reserve-technology',priority:1};
    const third={...original.research[0],techId:'third-technology',priority:1};
    original.research.push(project,third);
    const free=runStrategyTick(original).next;
    expect(free.research.filter(r=>r.progress>0)).toHaveLength(3);
    original.occupations.push({regionId:0,occupier:1,share:1,resistance:20,compliance:10,
      policy:'military',garrisonSupply:1});
    const occupied=runStrategyTick(original).next;
    expect(occupied.research.filter(r=>r.progress>0)).toHaveLength(2);
  });
  it('ORGまたはHPが0の師団は戦闘不能で、損害を与えない',()=>{
    const w=strategyFixture();
    w.wars=[{a:0,b:1}];
    w.divisions[0].province=1;
    for(const field of ['organization','hp'] as const){
      const broken=structuredClone(w);
      broken.divisions[0][field]=0;
      const result=runStrategyTick(broken);
      expect(result.reports.battleOrgLoss).toBe(0);
      expect(result.next.divisions[1].organization).toBe(100);
      expect(result.next.divisions[1].hp).toBe(100);
    }
  });
  it('実戦で兵員死亡と師団装備損耗を台帳へ反映し、0HPは壊滅',()=>{
    const w=strategyFixture();
    w.wars=[{a:0,b:1}];w.divisions[0].province=1;
    w.divisions[0].softAttack=10000;
    w.lots.push({holder:'division',holderId:2,modelId:'rifle',quantity:10});
    const result=runStrategyTick(w);
    expect(result.reports.casualties).toBeGreaterThan(0);
    expect(result.reports.equipmentLoss).toBeGreaterThan(0);
    expect(pop(w)-pop(result.next)).toBe(result.reports.casualties);
    expect(equipment(result.next)-equipment(w)).toBe(
      result.production.reduce((s,l)=>s+l.quantity,0)-result.reports.equipmentLoss);
    const routed=strategyFixture();
    routed.wars=[{a:0,b:1}];routed.divisions[0].province=1;
    routed.divisions[0].softAttack=10000;routed.divisions[1].hp=1;
    const fight=runStrategyTick(routed).next;
    expect(fight.divisions[1].destroyed).toBe(true);
    expect(fight.divisions[1].soldiers).toBe(0);
  });
  it('AI命令予算が16件でも師団の評価順を日ごとに循環させる',()=>{
    const w=strategyFixture();
    const firstUnit=w.divisions[0];
    const extra=Array.from({length:20},(_,i)=>({...firstUnit,id:i+3,soldiers:1}));
    w.divisions.push(...extra);
    w.plans[0].divisionIds.push(...extra.map(u=>u.id));
    w.nations[0].population.soldiers+=20;
    w.regions[0].population+=20;
    w.wars=[{a:0,b:1}];
    w.plans[0].paused=false;
    w.plans[0].authorized=true;
    const first=runStrategyTick(w);
    const second=runStrategyTick(first.next);
    expect(first.orders).toHaveLength(16);
    expect(second.orders).toHaveLength(16);
    expect(new Set([...first.orders,...second.orders].map(x=>x.divisionId)).size).toBe(21);
  });
  it('占領した工場の操業国を原子的に移管し、元ライン停止後だけ占領者が稼働させる',()=>{
    const w=strategyFixture();
    w.lines.push({id:2,country:1,factoryId:3,modelId:'rifle',efficiency:1,carryIC:1,active:true});
    const before=runStrategyTick(w);
    expect(before.production.reduce((s,p)=>s+(p.country===0?p.quantity:0),0)).toBe(5);
    const seized=transferFactoryOperation(w,3,0);
    const capturedLine=seized.lines.find(l=>l.id===2)!;
    expect(capturedLine.country).toBe(0);
    expect(capturedLine.active).toBe(false);
    expect(capturedLine.carryIC).toBe(0);
    expect(w.factories.find(f=>f.id===3)!.country).toBe(1);
    capturedLine.active=true;
    const occupied=runStrategyTick(seized);
    expect(occupied.production.reduce((s,p)=>s+(p.country===0?p.quantity:0),0)).toBeGreaterThan(5);
    const without=strategyFixture();
    without.occupations=[];
    expect(()=>transferFactoryOperation(without,3,0)).toThrow();
    const invalid=structuredClone(seized);
    invalid.occupations=[];
    expect(()=>assertStrategyState(invalid)).toThrow();
  });
});