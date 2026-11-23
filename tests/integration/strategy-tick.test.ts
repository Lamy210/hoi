import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {runStrategyTick,STRATEGY_PHASES} from '../../src/engine/strategy/tick';
import {assertStrategyState,populationSize} from '../../src/engine/strategy/model';
import {strategyHash} from '../../src/engine/strategy/save';

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
});