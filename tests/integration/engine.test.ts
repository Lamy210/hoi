// エンジン統合テスト — 決定論・戦争フロー・占領・不変条件
import { describe, it, expect } from 'vitest';
import { createTestEngine, playerCommand, loadTestPack } from '../helpers';
import { hashWorld } from '../../src/engine/core/hash';
import { createEngine } from '../../src/engine/engine';
import { activeWarBetween, atWar } from '../../src/engine/core/state';
import { ART_PER_FACTORY_DAY, EQUIPMENT_PER_FACTORY_DAY, MANPOWER_RATE_MONTHLY } from '../../src/engine/systems/production';

async function makeTwoWorlds(seed = 777) {
  const pack = await loadTestPack();
  const a = createEngine(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
  const b = createEngine(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
  return { a, b, pack };
}

describe('決定論', () => {
  it('同一シード＋同一コマンド列で月末アンカーが一致（リプレイ二重実行）', async () => {
    const { a, b } = await makeTwoWorlds();
    // 同一の操作列: 師団作成→移動
    const jp = a.world.countries.id.indexOf('JPN');
    const tokyo = a.world.prov.id.indexOf('JP-13');
    const ibaraki = a.world.prov.id.indexOf('JP-08');
    for (const w of [a, b]) {
      w.world.runtime.commandsSinceLastTick.push({ issuer: 'player', seq: 1, type: 'createUnit', p: { country: jp, province: tokyo } });
    }
    for (let t = 0; t < 5; t++) {
      a.stepTick();
      b.stepTick();
    }
    for (const w of [a, b]) {
      w.world.runtime.commandsSinceLastTick.push({ issuer: 'player', seq: 2, type: 'moveUnits', p: { units: [w.world.units[w.world.units.length - 1].id], target: ibaraki } });
    }
    for (let t = 0; t < 400; t++) {
      a.stepTick();
      b.stepTick();
    }
    expect(a.world.anchors.length).toBeGreaterThan(5);
    expect(b.world.anchors.length).toBe(a.world.anchors.length);
    for (let i = 0; i < a.world.anchors.length; i++) {
      expect(a.world.anchors[i].hash, 'anchor ' + i + ' tick ' + a.world.anchors[i].tick).toBe(b.world.anchors[i].hash);
    }
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });

  it('AI国家は週次で判断ログを残し、暴走しない（R-15）', async () => {
    const engine = await createTestEngine(1, 42, 'JPN');
    for (let t = 0; t < 400; t++) engine.stepTick();
    // AI国家（プレイヤー以外）の判断ログが蓄積している
    for (let c = 0; c < engine.world.countries.count; c++) {
      if (c === engine.world.playerCountry) continue;
      const logs = engine.world.runtime.decisionLog[String(c)] ?? [];
      expect(logs.length, 'country ' + c).toBeGreaterThan(20);
    }
    // 不変条件: orgの範囲・負の在庫なし・NaNなし
    for (const u of engine.world.units) {
      expect(u.org).toBeGreaterThanOrEqual(0);
      expect(u.org).toBeLessThanOrEqual(100);
      expect(Number.isFinite(u.manpower)).toBe(true);
    }
    for (let c = 0; c < engine.world.countries.count; c++) {
      expect(engine.world.countries.manpowerPool[c]).toBeGreaterThanOrEqual(0);
      expect(engine.world.countries.infEquipmentStock[c]).toBeGreaterThanOrEqual(0);
      expect(engine.world.countries.artEquipmentStock[c]).toBeGreaterThanOrEqual(0);
    }
    for (let p = 0; p < engine.world.prov.count; p++) {
      expect(Number.isFinite(engine.world.runtime.supplyEff[p])).toBe(true);
      expect(engine.world.runtime.supplyEff[p]).toBeGreaterThanOrEqual(0);
      expect(engine.world.runtime.supplyEff[p]).toBeLessThanOrEqual(1);
    }
  });

  it('ジャーナルに同一uidの二重適用がない（INV-6）', async () => {
    const engine = await createTestEngine(1, 99, 'JPN');
    for (let t = 0; t < 200; t++) engine.stepTick();
    const seen = new Set<string>();
    for (const j of engine.world.journal) {
      const key = j.issuer + ':' + j.seq;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('戦争フロー（docs/16シナリオ相当）', () => {
  it('師団作成は人力・装備の実消費を要し、不足時は却下される', async () => {
    const engine = await createTestEngine(1, 1, 'JPN');
    const jp = engine.world.countries.id.indexOf('JPN');
    const tokyo = engine.world.prov.id.indexOf('JP-13');
    const beforeMp = engine.world.countries.manpowerPool[jp];
    const beforeInf = engine.world.countries.infEquipmentStock[jp];
    const beforeArt = engine.world.countries.artEquipmentStock[jp];
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    // 生産式（日次）を加味した期待値（share=0.2: 歩兵装備×0.8・火砲×0.2）
    const expectMp = beforeMp - 10000 + (engine.world.countries.population[jp] * MANPOWER_RATE_MONTHLY) / engine.world.daysPerMonth;
    const expectInf = beforeInf - 1000 + engine.world.countries.milFactories[jp] * (1 - 0.2) * EQUIPMENT_PER_FACTORY_DAY;
    const expectArt = beforeArt - 200 + engine.world.countries.milFactories[jp] * 0.2 * ART_PER_FACTORY_DAY;
    expect(engine.world.countries.manpowerPool[jp]).toBeCloseTo(expectMp, 6);
    expect(engine.world.countries.infEquipmentStock[jp]).toBeCloseTo(expectInf, 6);
    expect(engine.world.countries.artEquipmentStock[jp]).toBeCloseTo(expectArt, 6);
    expect(engine.world.units.filter((u) => u.owner === jp).length).toBe(7);

    // 火砲不足の強制 → 却下
    engine.world.countries.artEquipmentStock[jp] = 0;
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    expect(engine.world.units.filter((u) => u.owner === jp).length).toBe(7);
    const playerEntries = engine.world.journal.filter((j) => j.issuer === 'player');
    const last = playerEntries[playerEntries.length - 1];
    expect(last.ok).toBe(false);
    expect(last.reason).toBe('insufficientArtillery');
  });

  it('海越え・敵地直進の移動は却下される（移動の合法性）', async () => {
    const engine = await createTestEngine(1, 2, 'JPN');
    const jp = engine.world.countries.id.indexOf('JPN');
    const tokyo = engine.world.prov.id.indexOf('JP-13');
    const seoul = engine.world.prov.id.indexOf('KR-11');
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    const unit = engine.world.units[engine.world.units.length - 1];
    playerCommand(engine, 'moveUnits', { units: [unit.id], target: seoul });
    engine.stepTick();
    const playerEntries = engine.world.journal.filter((j) => j.issuer === 'player');
    const last = playerEntries[playerEntries.length - 1];
    expect(last.ok).toBe(false);
    expect(last.reason).toBe('noPath'); // 未開戦の韓国領へは到達不可
  });

  it('宣戦→移動→戦闘→占領の一連フローが動く', async () => {
    const engine = await createTestEngine(1, 3, 'PRK');
    const prk = engine.world.countries.id.indexOf('PRK');
    const kor = engine.world.countries.id.indexOf('KOR');
    const pyongyang = engine.world.prov.id.indexOf('KP-01');
    const seoul = engine.world.prov.id.indexOf('KR-11');
    // 師団3個を平壌へ
    for (let i = 0; i < 3; i++) {
      playerCommand(engine, 'createUnit', { country: prk, province: pyongyang });
    }
    engine.stepTick();
    const ids = engine.world.units.filter((u) => u.owner === prk).slice(-3).map((u) => u.id);
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    expect(atWar(engine.world, prk, kor)).toBe(true);
    playerCommand(engine, 'moveUnits', { units: ids, target: seoul });
    engine.stepTick();
    // 移動・戦闘・占領が完了するまで進める（包囲/撤退込みで120日）
    const war = activeWarBetween(engine.world, prk, kor);
    expect(war).not.toBeNull();
    let occupied = false;
    let battleHappened = false;
    for (let t = 0; t < 120; t++) {
      engine.stepTick();
      if ([...engine.world.runtime.activeBattles].length > 0) battleHappened = true;
      if (engine.world.prov.controller[seoul] === prk) {
        occupied = true;
        break;
      }
    }
    if (!occupied) {
      const seoulUnits = engine.world.units.filter((u) => u.loc === seoul);
      console.error('DEBUG occupied=false; battles=', [...engine.world.runtime.activeBattles],
        'seoul controller=', engine.world.prov.controller[seoul], 'units in seoul:', seoulUnits.map((u) => u.owner + ':' + Math.round(u.org)),
        'pathCheck=', engine.world.units.filter((u) => u.owner === prk).map((u) => u.loc + ':' + u.path.join('>')),
        'alerts=', engine.world.runtime.alerts.slice(-8).map((a) => a.msgKey));
    }
    expect(battleHappened).toBe(true);
    expect(occupied).toBe(true);
    // 占領後: controller≠owner（INV-1の分離）
    expect(engine.world.prov.owner[seoul]).toBe(kor);
    expect(engine.world.prov.controller[seoul]).toBe(prk);
    // 戦争スコア: 攻撃側が優位
    const { warScoreFor } = await import('../../src/engine/military/war');
    expect(warScoreFor(engine.world, war!, prk)).toBeGreaterThan(0);
    // 講和 → 占領地の解放（現状講和）
    playerCommand(engine, 'proposePeace', { warId: war!.id });
    engine.stepTick();
    expect(war!.status === 'ended' || war!.status === 'peaceOffered').toBe(true);
    if (war!.status === 'ended') {
      expect(engine.world.prov.controller[seoul]).toBe(kor);
    }
  });
});
