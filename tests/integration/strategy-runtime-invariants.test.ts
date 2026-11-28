import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {assertStrategyState,populationSize} from '../../src/engine/strategy/model';
import {runStrategyTick} from '../../src/engine/strategy/tick';
import {settleTrade} from '../../src/engine/strategy/rules';
import {strategyHash} from '../../src/engine/strategy/save';

describe('統合ランタイム移行前の不変条件',()=>{
  it('残高未満の注文を丸めで成立させない',()=>{
    const r=settleTrade(1,1,1-1e-10,0,0,1);
    expect(r.quantity).toBe(0);
    expect(r.buyerCash).toBe(1-1e-10);
    expect(r.sellerStock).toBe(1);
  });
  it('占領の非有限入力を原子的に拒否する',()=>{
    for(const key of ['share','resistance','compliance','garrisonSupply'] as const){
      const w=strategyFixture();
      w.occupations[0][key]=NaN;
      expect(()=>runStrategyTick(w)).toThrow('occupation ratio');
      expect(w.tick).toBe(0);
    }
  });
  it('人口と兵員は整数のみを許す',()=>{
    const w=strategyFixture();
    w.divisions[0].soldiers=19.5;
    expect(()=>assertStrategyState(w)).toThrow('division soldiers integer');
    w.divisions[0].soldiers=20;
    w.regions[0].population=119.5;
    expect(()=>assertStrategyState(w)).toThrow('regional population integer');
  });
  it('365日間の有限資源枯渇ストレスで保存則を維持し再現できる',()=>{
    const simulate=()=>{
      let w=strategyFixture();
      const cash=w.nations.reduce((s,n)=>s+n.cash+n.householdCash,0);
      const pop=w.nations.reduce((s,n)=>s+populationSize(n.population),0);
      for(let i=0;i<365;i++){
        w=runStrategyTick(w).next;
        assertStrategyState(w);
        expect(w.nations.reduce((s,n)=>s+n.cash+n.householdCash,0)).toBeCloseTo(cash);
        expect(w.nations.reduce((s,n)=>s+populationSize(n.population),0)).toBe(pop);
        expect(w.quotes.every(q=>Number.isFinite(q.price)&&q.price>=q.basePrice*0.25&&q.price<=q.basePrice*4)).toBe(true);
        expect(w.regions.every(r=>Object.values(r.resources).every(v=>Number.isFinite(v)&&v>=0))).toBe(true);
      }
      expect(w.regions[0].resources.steel).toBe(0);
      return strategyHash(w);
    };
    expect(simulate()).toBe(simulate());
  });
});
