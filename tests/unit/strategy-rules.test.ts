import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {assertStrategyState,populationSize} from '../../src/engine/strategy/model';
import {transferPop,conscript,studySlots,researchPerDay,researchAhead,allocatedResearch,
  nextPrice,settleTrade,construct,availableIC,modelOutput,wearExpected,combatHits,
  canAutoAttack,resistanceAfterDay,occupationExtractableIC,validFocusTree,applyFocus} from '../../src/engine/strategy/rules';

describe('integrated strategy rules invariants',()=>{
  it('POP動員は排他的な転籍で総人口不変、負値/不足拒否',()=>{
    const p=strategyFixture().nations[0].population,old=populationSize(p);
    const m=conscript(p,40);
    expect(m.unemployed).toBe(0);
    expect(m.reserves).toBe(0);
    expect(m.workers).toBe(30);
    expect(m.soldiers).toBe(60);
    expect(populationSize(m)).toBe(old);
    expect(populationSize(p)).toBe(old);
    expect(()=>conscript(p,1000)).toThrow();
    expect(()=>transferPop(p,'workers','researchers',-1)).toThrow();
    expect(()=>transferPop(p,'workers','researchers',41)).toThrow();
  });
  it('研究枠増加はRPを増殖させず優先度重みで分配、先行2年は3.1倍',()=>{
    const n=strategyFixture().nations[0],rp=researchPerDay(n,0.8);
    expect(studySlots(20,0.7,0.7,1)).toBe(studySlots(20,0.7,0.7)+1);
    expect(allocatedResearch(rp,[2,1,1],2)).toEqual([rp*2/3,rp/3,0]);
    expect(allocatedResearch(rp,[2,1,1],3).reduce((a,b)=>a+b,0)).toBeCloseTo(rp);
    expect(researchAhead(2026,2028)).toBeCloseTo(3.1);
  });
  it('需給ゼロで価格は有限・有界。取引は実支払数量に制限',()=>{
    const q=strategyFixture().quotes[0];
    expect(nextPrice(q)).toBeGreaterThan(q.price);
    expect(nextPrice({...q,supply:1e20,demand:0})).toBeGreaterThanOrEqual(0.5);
    const t=settleTrade(20,3,11,30,0,50);
    expect(t.quantity).toBe(3);
    expect(t.buyerCash+t.sellerCash).toBe(41);
    expect(t.buyerStock+t.sellerStock).toBe(50);
    expect(()=>settleTrade(5,0,5,5,0,10)).toThrow();
  });
  it('建設はIC/国庫/物資/工員の最小値、破壊×資源で二重割引なし',()=>{
    const f=strategyFixture().factories[0];
    expect(construct(f,50,100,100,10,2,1).progressIC).toBe(10);
    expect(construct(f,50,3,100,10,2,1).progressIC).toBe(1.5);
    expect(construct(f,50,100,0,10,2,1).progressIC).toBe(0);
    expect(construct(f,50,100,100,0,2,1).progressIC).toBe(0);
    expect(availableIC({...f,damage:0.5},10,0.5,1,1)).toBeCloseTo(2.5);
  });
  it('型番別生産は資源を消費した実数だけ製造。信頼性低下は損耗増',()=>{
    const d=strategyFixture().designs[0];
    expect(modelOutput(10,0,d,{steel:3})).toEqual({count:3,spent:{steel:3},carry:0});
    expect(modelOutput(10,0,d,{steel:10})).toEqual({count:5,spent:{steel:5},carry:0});
    expect(wearExpected(1000,0.6,2)).toBeGreaterThan(wearExpected(1000,0.95,2));
  });
  it('対人/対装甲攻撃は硬度で合成、防御超過で命中が増える',()=>{
    const base={softAttack:100,hardAttack:40,hardness:0.5,defense:70,breakthrough:30,
      terrain:1,weather:1,supply:1,commander:1,doctrine:1,planning:0};
    expect(combatHits(base,{...base,defense:200})).toBeCloseTo(0.012*0.15*70);
    expect(combatHits(base,{...base,defense:30})).toBeGreaterThan(combatHits(base,{...base,defense:200}));
  });
  it('平時・未承認・手動固定中は完全委任でも攻撃しない',()=>{
    const w=strategyFixture(),p=w.plans[0],u=w.divisions[0];
    expect(canAutoAttack(w,p,u)).toBe(false);
    p.authorized=true;p.paused=false;
    expect(canAutoAttack(w,p,u)).toBe(false);
    w.wars.push({a:0,b:1});
    expect(canAutoAttack(w,p,u)).toBe(true);
    u.manualHold=true;
    expect(canAutoAttack(w,p,u)).toBe(false);
  });
  it('占領率と抵抗値をクランプし物理工場能力の二重計上を禁止',()=>{
    const o=strategyFixture().occupations[0];
    const r=resistanceAfterDay({...o,resistance:100,compliance:100,policy:'exploit'},true,1000);
    expect(r.resistance).toBeLessThanOrEqual(100);
    expect(r.compliance).toBeGreaterThanOrEqual(0);
    const allocations=occupationExtractableIC(10,[o,{...o,occupier:1,share:0.7}]);
    expect(Object.values(allocations).reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(10);
  });
  it('フォーカスDAG循環・未知参照を拒否し、国家方針の重複効果を禁止',()=>{
    const w=strategyFixture(),f=w.focuses[0],n=w.nations[0];
    expect(validFocusTree(w.focuses)).toEqual([]);
    expect(validFocusTree([{...f,requires:[f.id]}])).toContain('focus cycle:'+f.id);
    expect(validFocusTree([{...f,requires:['unknown']}])).toContain('unknown focus:unknown');
    const r=applyFocus(n,f,w.focuses,[]);
    expect(r.nation.researchSlotBonus).toBe(1);
    expect(()=>applyFocus(r.nation,f,w.focuses,r.spirits)).toThrow();
    expect(()=>assertStrategyState({...w,lines:[...w.lines,w.lines[0]]})).toThrow();
    expect(()=>assertStrategyState({...w,occupations:[...w.occupations,{...w.occupations[0],share:0.7}]})).toThrow();
  });
});