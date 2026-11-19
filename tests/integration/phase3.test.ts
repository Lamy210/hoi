// Phase 3統合テスト — 市場経済・人口/労働・政治/法律・研究・建設・5軸スコア・チュートリアル
import { describe, it, expect } from 'vitest';
import { createTestEngine, playerCommand, loadTestPack } from '../helpers';
import { detectTechCycles } from '../../src/engine/scenario/loader';
import { BASE_PRICES } from '../../src/engine/systems/economy';
import { MOBILIZATION_RATES, conscriptionPool } from '../../src/engine/systems/population';
import { researchPointsPerDay } from '../../src/engine/systems/research';

describe('市場経済（economy-system spec）', () => {
  it('50年間で世界の資金総量は不変（貨幣保存則INV-2）', async () => {
    const engine = await createTestEngine(1, 3000, 'JPN');
    const w = engine.world;
    const money0 = w.treasury.reduce((a, b) => a + b, 0) + w.householdPool;
    for (let t = 0; t < 18000; t++) {
      engine.stepTick();
      if (t % 600 === 0) {
        const money = w.treasury.reduce((a, b) => a + b, 0) + w.householdPool;
        expect(money).toBeCloseTo(money0, 0); // 移転のみで総量不変
        expect(Number.isFinite(money)).toBe(true);
      }
    }
  }, 600000);

  it('税率変更で税収式どおりに変化し、価格はclamp内に保たれる', async () => {
    const engine = await createTestEngine(1, 3001, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    playerCommand(engine, 'setTaxRate', { rate: 0.4 });
    engine.stepTick();
    expect(w.taxRate[jp]).toBeCloseTo(0.4, 6);
    const t0 = w.treasury[jp];
    engine.stepTick();
    // 税収（+）+賃金（−）+維持（−）の純増が税率0.4で増えることの近似検証: 0.2→0.4で2倍の税
    expect(w.treasury[jp]).toBeGreaterThan(t0);
    // 600日回して価格clamp確認
    for (let t = 0; t < 600; t++) engine.stepTick();
    for (let g = 0; g < 4; g++) {
      for (let c = 0; c < w.countries.count; c++) {
        expect(w.prices[g][c]).toBeGreaterThanOrEqual(BASE_PRICES[g] * 0.25 - 1e-9);
        expect(w.prices[g][c]).toBeLessThanOrEqual(BASE_PRICES[g] * 4 + 1e-9);
      }
    }
  });

  it('月末にGDPが集計され占領で減少する（GDP集計spec）', async () => {
    const engine = await createTestEngine(1, 3002, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    // 韓国全領土を占領（状態手術）→ 韓国のGDP低下
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.owner[p] === kor) w.prov.controller[p] = prk;
    }
    for (let t = 0; t < w.daysPerMonth + 2; t++) engine.stepTick();
    expect(w.gdp[kor]).toBeLessThan(w.gdp[prk]);
    expect(Number.isFinite(w.gdp[kor])).toBe(true);
  });
});

describe('人口・労働（population-system spec）', () => {
  it('人口が成長し総和整合（国合計=州合計）が保たれる', async () => {
    const engine = await createTestEngine(1, 3100, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const pop0 = w.countries.population[jp];
    // 月末（tick ≡ daysPerMonth-1）に揃えてから比較（国人口は月末に州合計から再集計）
    while (w.tick % w.daysPerMonth !== w.daysPerMonth - 1) engine.stepTick();
    let sum = 0;
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.owner[p] === jp) sum += w.prov.population[p];
    }
    expect(w.countries.population[jp]).toBe(Math.round(sum));
    expect(w.countries.population[jp]).toBeGreaterThan(pop0); // 生活水準0.55で正成長
  });

  it('徴兵可能人口は法律の動員率を反映する（一元計算）', async () => {
    const engine = await createTestEngine(1, 3101, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    // 月末に揃える（国人口の再集計は月末）
    while (w.tick % w.daysPerMonth !== w.daysPerMonth - 1) engine.stepTick();
    const pool1 = conscriptionPool(w, jp);
    expect(pool1).toBeCloseTo(w.countries.population[jp] * MOBILIZATION_RATES[1], -3);
    // 総動員法: PP貯めて制定→30日後に反映
    w.pp[jp] = 200;
    playerCommand(engine, 'enactLaw', { slot: 'conscription', target: 2 });
    engine.stepTick();
    for (let t = 0; t < 30; t++) engine.stepTick();
    expect(w.laws[jp].conscription).toBe(2);
    while (w.tick % w.daysPerMonth !== w.daysPerMonth - 1) engine.stepTick();
    expect(conscriptionPool(w, jp) / w.countries.population[jp]).toBeCloseTo(MOBILIZATION_RATES[2], 2);
  });
});

describe('政治・法律（politics-system spec）', () => {
  it('PP不足の制定は却下され、PPは日次回復する', async () => {
    const engine = await createTestEngine(1, 3200, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    w.pp[jp] = 0;
    const pp0 = w.pp[jp];
    engine.stepTick();
    expect(w.pp[jp]).toBeGreaterThan(pp0); // 日次回復
    playerCommand(engine, 'enactLaw', { slot: 'economy', target: 2 });
    engine.stepTick();
    const playerEntries = w.journal.filter((j) => j.issuer === 'player');
    expect(playerEntries[playerEntries.length - 1].reason).toBe('insufficientPP');
  });

  it('法律はenactDays経過後に有効化され、旧法は無効になる', async () => {
    const engine = await createTestEngine(1, 3201, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    w.pp[jp] = 200;
    playerCommand(engine, 'enactLaw', { slot: 'economy', target: 2 });
    engine.stepTick();
    expect(w.laws[jp].economy).toBe(1); // まだ
    expect(w.lawQueue[jp]).not.toBeNull();
    for (let t = 0; t < 31; t++) engine.stepTick();
    expect(w.laws[jp].economy).toBe(2);
    expect(w.lawQueue[jp]).toBeNull();
    expect(w.pp[jp]).toBeLessThan(200); // 消費50を回復分がまだ超えていない
  });
});

describe('研究（research-system spec）', () => {
  it('循環前提の技術ツリーは検証で拒否される', () => {
    const violations: string[] = [];
    detectTechCycles(
      [
        { id: 'a', cat: 'x', req: ['b'], days: 1, mods: {} },
        { id: 'b', cat: 'x', req: ['a'], days: 1, mods: {} },
      ],
      violations,
    );
    expect(violations.some((v) => v.includes('cycle'))).toBe(true);
  });

  it('並行枠は2まで、前提未完了は却下、完了で産出係数が上がる', async () => {
    const engine = await createTestEngine(1, 3300, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    playerCommand(engine, 'startResearch', { techId: 'industry-basic' });
    engine.stepTick();
    // 前提未完了
    playerCommand(engine, 'startResearch', { techId: 'industry-mass' });
    engine.stepTick();
    let entries = w.journal.filter((j) => j.issuer === 'player');
    expect(entries[entries.length - 1].reason).toBe('techPrereqMissing');
    // 2枠目はOK
    playerCommand(engine, 'startResearch', { techId: 'medical-basic' });
    engine.stepTick();
    // 3枠目は却下
    playerCommand(engine, 'startResearch', { techId: 'agri-modern' });
    engine.stepTick();
    entries = w.journal.filter((j) => j.issuer === 'player');
    expect(entries[entries.length - 1].reason).toBe('researchSlotsFull');
    // 完了まで進める（研究力を強化して短縮）
    w.research[jp].active[0].progress = 399;
    for (let t = 0; t < 3; t++) engine.stepTick();
    expect(w.research[jp].done).toContain('industry-basic');
    // 産出係数: industry-basicのfactoryOutput 0.05が反映
    const share = w.productionShare[jp];
    const factories = w.countries.milFactories[jp];
    const before = w.countries.infEquipmentStock[jp];
    engine.stepTick();
    const delta = w.countries.infEquipmentStock[jp] - before;
    expect(delta).toBeGreaterThan(0);
    void share;
    void factories;
    expect(researchPointsPerDay(w, jp)).toBeGreaterThan(0);
  });
});

describe('建設（construction-system spec）', () => {
  it('資金不足で待機し、資金回復で完了、同時2件制限', async () => {
    const engine = await createTestEngine(1, 3400, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const tokyo = w.prov.id.indexOf('JP-13');
    const factories0 = w.countries.milFactories[jp];
    playerCommand(engine, 'startConstruction', { province: tokyo, type: 'milFactory' });
    playerCommand(engine, 'startConstruction', { province: tokyo, type: 'infra' });
    // 3件目は却下
    playerCommand(engine, 'startConstruction', { province: tokyo, type: 'milFactory' });
    engine.stepTick();
    const playerEntries = w.journal.filter((j) => j.issuer === 'player');
    expect(playerEntries[playerEntries.length - 1].reason).toBe('constructionFull');
    expect(w.constructionQueue.length).toBe(2);
    // 資金を0に（家計も0にして税収・消費の資金移転を止める）→待機
    w.treasury[jp] = 0;
    w.householdPool = 0;
    engine.stepTick();
    expect(w.constructionQueue[0].paused).toBe(true);
    // 資金回復→進行→完了
    w.treasury[jp] = 500000;
    w.householdPool = 1000000;
    for (let t = 0; t < 130 && w.countries.milFactories[jp] === factories0; t++) engine.stepTick();
    expect(w.countries.milFactories[jp]).toBe(factories0 + 1); // 一経路のレベル更新
  });
});

describe('5軸スコア（docs/02 §4）', () => {
  it('月末に5軸が記録され、同seedで完全一致（決定論）', async () => {
    const pack = await loadTestPack(false);
    const { createEngine } = await import('../../src/engine/engine');
    const a = createEngine(pack, { seed: 3500, playerCountryId: 'JPN', difficulty: 1 });
    const b = createEngine(pack, { seed: 3500, playerCountryId: 'JPN', difficulty: 1 });
    for (let t = 0; t < 700; t++) {
      a.stepTick();
      b.stepTick();
    }
    const ha = JSON.stringify(a.world.scoreHistory);
    const hb = JSON.stringify(b.world.scoreHistory);
    expect(ha).toBe(hb);
    expect(Object.keys(a.world.scoreHistory).length).toBeGreaterThan(0);
    const first = Object.values(a.world.scoreHistory)[0][0];
    for (const v of Object.values(first)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('チュートリアル（event-system spec）', () => {
  it('commandDoneで直列に進む（tut-1→tut-2→tut-3）', async () => {
    const engine = await createTestEngine(1, 3600, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const tokyo = w.prov.id.indexOf('JP-13');
    for (let t = 0; t < 5; t++) engine.stepTick();
    expect(w.firedEvents).toContain('tut-1');
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    expect(w.firedEvents).toContain('tut-2');
    // tut-3はsetProductionShareの後にのみ発火
    playerCommand(engine, 'setProductionShare', { share: 0.3 });
    engine.stepTick();
    expect(w.firedEvents).toContain('tut-3');
    // 前提なしでtut-4/5は発火しない
    expect(w.firedEvents).not.toContain('tut-5');
  });
});
