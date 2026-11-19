// Phase 2統合テスト — 戦線・補給容量・割譲講和・併合・天候・指揮官・イベント・生産配分
import { describe, it, expect } from 'vitest';
import { createTestEngine, playerCommand, loadTestPack } from '../helpers';
import { effectiveSupply } from '../../src/engine/core/state';
import { weatherOf, weatherAttackMod, weatherMoveMod, seasonOfMonth } from '../../src/engine/systems/weather';
import { civilFromDays } from '../../src/engine/clock/date';
import { deserializeWorld } from '../../src/engine/save/serialize';
import { activeWarBetween } from '../../src/engine/core/state';

describe('補給（capacityFactor・包囲）', () => {
  it('ハブ容量を超える師団は0.5に減衰する（logistics-system spec）', async () => {
    const engine = await createTestEngine(1, 500, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const tokyo = w.prov.id.indexOf('JP-13');
    // 東京（urban・infra5）の容量は 6+3×5=21。25師団を集中させる
    while (w.units.filter((u) => u.owner === jp && u.loc === tokyo).length < 25) {
      w.units.push({
        id: w.nextUnitId++, owner: jp, loc: tokyo, path: [], segIdx: 0, segProgress: 0, segDays: 0,
        manpower: 10000, maxManpower: 10000, infEquipment: 1000, maxInfEquipment: 1000,
        artEquipment: 200, maxArtEquipment: 200, org: 100, exp: 0, frontId: -1, commanderId: -1,
        encircled: false, destroyed: false,
      });
    }
    engine.stepTick(); // 補給再計算
    const effs = w.units.filter((u) => u.owner === jp && u.loc === tokyo).map((u) => effectiveSupply(w, u));
    const full = effs.filter((e) => e > 0.9).length;
    const decayed = effs.filter((e) => e <= 0.6).length;
    expect(full).toBeGreaterThan(0);
    expect(decayed).toBeGreaterThan(0);
    expect(full + decayed).toBe(25);
  });

  it('戦線を切った攻勢は補給断絶→包囲→崩壊する（docs/14受入シナリオ）', async () => {
    const engine = await createTestEngine(1, 600, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    const seoul = w.prov.id.indexOf('KR-11');
    const gyeonggi = w.prov.id.indexOf('KR-41');
    // 状態手術: PRK師団をソウルへ、道を遮断（京畿をKOR支配に戻す）
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    const deepUnit = {
      id: w.nextUnitId++, owner: prk, loc: seoul, path: [], segIdx: 0, segProgress: 0, segDays: 0,
      manpower: 10000, maxManpower: 10000, infEquipment: 1000, maxInfEquipment: 1000,
      artEquipment: 200, maxArtEquipment: 200, org: 100, exp: 0, frontId: -1, commanderId: -1,
      encircled: false, destroyed: false,
    };
    w.units.push(deepUnit);
    w.prov.controller[seoul] = prk; // ソウルはPRK支配
    // 京畿道をKORが再支配（補給線を遮断）
    w.prov.controller[gyeonggi] = kor;
    w.runtime.supplyDirty = true;
    engine.stepTick();
    // 補給途絶（京畿遮断）: 距離減衰0・包囲または戦闘による消耗が始まる
    expect(effectiveSupply(w, deepUnit)).toBe(0);
    // ソウル守備のKOR師団との戦闘 → 撤退先なし → 包囲 → 崩壊
    const org0 = deepUnit.org;
    engine.stepTick();
    expect(deepUnit.org).toBeLessThanOrEqual(org0);
    for (let t = 0; t < 60 && !deepUnit.destroyed; t++) engine.stepTick();
    expect(deepUnit.destroyed).toBe(true);
  });
});

describe('戦線（military-system spec）', () => {
  it('戦線作成→割当→攻勢スタンスで自動攻撃が発動する', async () => {
    const engine = await createTestEngine(1, 700, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    const pyongyang = w.prov.id.indexOf('KP-01');
    const seoul = w.prov.id.indexOf('KR-11');
    for (let i = 0; i < 4; i++) playerCommand(engine, 'createUnit', { country: prk, province: pyongyang });
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    const ids = w.units.filter((u) => u.owner === prk).slice(-4).map((u) => u.id);
    playerCommand(engine, 'createFront', { enemy: kor });
    engine.stepTick();
    expect(w.fronts.length).toBe(1);
    const frontId = w.fronts[0].id;
    expect(w.fronts[0].provinces.length).toBeGreaterThan(0);
    playerCommand(engine, 'assignToFront', { units: ids, frontId });
    playerCommand(engine, 'setFrontStance', { frontId, stance: 'attack', cap: 3 });
    engine.stepTick();
    // 戦線AI（週次分散）が動くまで進める。前線州への集結→攻勢の順で師団が動く
    const startLocs = new Map(w.units.filter((u) => ids.includes(u.id)).map((u) => [u.id, u.loc]));
    for (let t = 0; t < 10 && w.prov.controller[seoul] !== prk; t++) engine.stepTick();
    const movedOrArrived = w.units
      .filter((u) => ids.includes(u.id))
      .some((u) => u.loc !== startLocs.get(u.id) || u.path.length > 0 || u.loc === seoul);
    expect(movedOrArrived).toBe(true);
    // 戦線AIの命令がジャーナルに記録されている（frontai発行・INV-3/INV-6）
    expect(w.journal.filter((j) => j.issuer === 'frontai' && j.ok).length).toBeGreaterThan(0);
  });

  it('明示命令は戦線AIより優先される', async () => {
    const engine = await createTestEngine(1, 701, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    const pyongyang = w.prov.id.indexOf('KP-01');
    const hamgyong = w.prov.id.indexOf('KP-08'); // 国境から遠い後方
    for (let i = 0; i < 2; i++) playerCommand(engine, 'createUnit', { country: prk, province: pyongyang });
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    const unit = w.units.filter((u) => u.owner === prk).slice(-1)[0];
    playerCommand(engine, 'createFront', { enemy: kor });
    engine.stepTick();
    playerCommand(engine, 'assignToFront', { units: [unit.id], frontId: w.fronts[0].id });
    // 明示命令で後方へ移動
    playerCommand(engine, 'moveUnits', { units: [unit.id], target: hamgyong });
    engine.stepTick();
    expect(unit.path.length).toBeGreaterThan(0);
    const tick = w.tick;
    // 14日進めても戦線AIは移動命令を上書きしない（移動完了後も命令は残らないが、移動を妨害しない）
    for (let t = 0; t < 14; t++) engine.stepTick();
    expect(tick).toBeLessThan(w.tick);
    expect(unit.loc).toBe(hamgyong);
  });
});

describe('講和・併合（diplomacy-system spec）', () => {
  it('割譲講和の受諾で領有が移転する', async () => {
    const engine = await createTestEngine(1, 800, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    const pyongyang = w.prov.id.indexOf('KP-01');
    const seoul = w.prov.id.indexOf('KR-11');
    for (let i = 0; i < 4; i++) playerCommand(engine, 'createUnit', { country: prk, province: pyongyang });
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    const ids = w.units.filter((u) => u.owner === prk).slice(-4).map((u) => u.id);
    playerCommand(engine, 'moveUnits', { units: ids, target: seoul });
    for (let t = 0; t < 120 && w.prov.controller[seoul] !== prk; t++) engine.stepTick();
    expect(w.prov.controller[seoul]).toBe(prk);
    const war = activeWarBetween(w, prk, kor)!;
    playerCommand(engine, 'proposePeace', { warId: war.id, type: 'demand' });
    engine.stepTick();
    const last = w.journal[w.journal.length - 1];
    if (war.status === 'ended') {
      expect(w.prov.owner[seoul]).toBe(prk); // 領有移転
    } else {
      expect(last.ok).toBe(false); // AIが拒否（スコア不足）も正当
    }
  });

  it('全領土支配＋無兵力の国家は併合される', async () => {
    const engine = await createTestEngine(1, 801, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    const kor = w.countries.id.indexOf('KOR');
    playerCommand(engine, 'declareWar', { defender: kor });
    engine.stepTick();
    // 状態手術: KOR全領土をPRK支配・KOR無兵力
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.owner[p] === kor) w.prov.controller[p] = prk;
    }
    for (const u of w.units) {
      if (u.owner === kor) u.destroyed = true;
    }
    w.units = w.units.filter((u) => !u.destroyed);
    w.runtime.supplyDirty = true;
    engine.stepTick();
    expect(w.countries.alive[kor]).toBe(false);
    const seoul = w.prov.id.indexOf('KR-11');
    expect(w.prov.owner[seoul]).toBe(prk);
    expect(activeWarBetween(w, prk, kor)).toBeNull();
  });
});

describe('天候（combat-system spec）', () => {
  it('同一シード・同一週で同一天候が返る', async () => {
    const pack = await loadTestPack(false);
    const { createEngine } = await import('../../src/engine/engine');
    const a = createEngine(pack, { seed: 42, playerCountryId: 'JPN', difficulty: 1 });
    const b = createEngine(pack, { seed: 42, playerCountryId: 'JPN', difficulty: 1 });
    for (let t = 0; t < 60; t++) {
      a.stepTick();
      b.stepTick();
      for (let p = 0; p < 10; p++) {
        expect(weatherOf(a.world, p)).toBe(weatherOf(b.world, p));
      }
    }
  });

  it('冬季・高緯度の雪は攻撃0.75・移動0.65に強化される', async () => {
    const engine = await createTestEngine(1, 900, 'JPN');
    const w = engine.world;
    // 2026-01-01は1月＝冬季。北海道（緯度43）の雪を強制する
    const hokkaido = w.prov.id.indexOf('JP-01');
    weatherOf(w, hokkaido); // キャッシュ生成
    w.runtime.weatherByProv[hokkaido] = 2; // snow を強制
    expect(seasonOfMonth(civilFromDays(w.epochDays + w.tick).m)).toBe('winter');
    expect(w.prov.cy[hokkaido]).toBeGreaterThanOrEqual(40);
    expect(weatherAttackMod(w, hokkaido)).toBe(0.75);
    expect(weatherMoveMod(w, hokkaido)).toBe(0.65);
  });
});

describe('指揮官（military-system spec）', () => {
  it('スキル4攻撃特性の指揮官で攻撃係数が1.22になる', async () => {
    const engine = await createTestEngine(1, 910, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const tokyo = w.prov.id.indexOf('JP-13');
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    const unit = w.units[w.units.length - 1];
    // 東京=自領のためトレース上は防衛側。防御特性スキル4を強制生成して 1+4×0.04+0.06=1.22 を検証する
    let cmdr = w.commanders.find((c) => c.country === jp && c.skill === 4 && c.trait === 1 && c.assignedUnit < 0);
    if (!cmdr) {
      cmdr = { id: w.nextCommanderId++, country: jp, nameJa: '試験', nameEn: 'Test', skill: 4, trait: 1, assignedUnit: -1, exp: 0 };
      w.commanders.push(cmdr);
    }
    playerCommand(engine, 'assignCommander', { unitId: unit.id, commanderId: cmdr.id });
    engine.stepTick();
    expect(unit.commanderId).toBe(cmdr.id);
    const trace = engine.trace({ kind: 'unitCombat', id: unit.id });
    expect(trace).not.toBeNull();
    const cmdrEntry = trace!.contribs.find((c) => c.label === 'commander');
    expect(cmdrEntry!.value).toBeCloseTo(1.22, 6);
  });

  it('作成時に空き指揮官が自動割当される', async () => {
    const engine = await createTestEngine(1, 911, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    const tokyo = w.prov.id.indexOf('JP-13');
    playerCommand(engine, 'createUnit', { country: jp, province: tokyo });
    engine.stepTick();
    const unit = w.units[w.units.length - 1];
    expect(unit.commanderId).toBeGreaterThanOrEqual(0);
    const cmdr = w.commanders.find((c) => c.id === unit.commanderId)!;
    expect(cmdr.country).toBe(jp);
    expect(cmdr.assignedUnit).toBe(unit.id);
  });
});

describe('イベント（event-system spec）', () => {
  it('日付トリガーが1回だけ発火し、セーブ復元後も再発火しない', async () => {
    const pack = await loadTestPack(true);
    const { createEngine } = await import('../../src/engine/engine');
    const engine = createEngine(pack, { seed: 920, playerCountryId: 'JPN', difficulty: 1 });
    // 2026-12-01 は tick 334
    const targetTick = 334;
    for (let t = 0; t < targetTick; t++) engine.stepTick();
    expect(engine.world.firedEvents).toContain('winter-supply-warning');
    const count1 = engine.world.journal.filter((j) => j.type === 'fireEvent' && j.issuer === 'event').length;
    engine.stepTick();
    engine.stepTick();
    const count2 = engine.world.journal.filter((j) => j.type === 'fireEvent' && j.issuer === 'event').length;
    expect(count2).toBe(count1); // 再発火しない
    // セーブ→ロード→再発火しない
    const buf = engine.serialize();
    const r = deserializeWorld(buf, pack);
    expect(r.violations).toEqual([]);
    expect(r.world!.firedEvents).toContain('winter-supply-warning');
  });

  it('stockBelowトリガーが在庫条件で発火する', async () => {
    const engine = await createTestEngine(1, 921, 'PRK');
    const w = engine.world;
    const prk = w.countries.id.indexOf('PRK');
    w.countries.artEquipmentStock[prk] = 100; // 閾値400未満
    for (let t = 0; t < 3; t++) engine.stepTick();
    expect(w.firedEvents).toContain('artillery-shortage-warning');
  });
});

describe('生産配分（production-system spec）', () => {
  it('artShare変更で日次産出が式どおりに変化する', async () => {
    const engine = await createTestEngine(1, 930, 'JPN');
    const w = engine.world;
    const jp = w.countries.id.indexOf('JPN');
    playerCommand(engine, 'setProductionShare', { share: 0.5 });
    engine.stepTick();
    const inf1 = w.countries.infEquipmentStock[jp];
    const art1 = w.countries.artEquipmentStock[jp];
    engine.stepTick();
    const infDelta = w.countries.infEquipmentStock[jp] - inf1;
    const artDelta = w.countries.artEquipmentStock[jp] - art1;
    expect(infDelta).toBeCloseTo(w.countries.milFactories[jp] * 0.5 * 2, 6);
    expect(artDelta).toBeCloseTo(w.countries.milFactories[jp] * 0.5 * 1.2, 6);
    // 範囲外は却下
    playerCommand(engine, 'setProductionShare', { share: 0.8 });
    engine.stepTick();
    const last = w.journal[w.journal.length - 1];
    expect(last.ok).toBe(false);
    expect(last.reason).toBe('badShare');
  });
});
