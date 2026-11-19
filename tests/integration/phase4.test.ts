// Phase 4統合テスト — 条約・多要素関係値・講和会議（phase4-diplomacy-treaties / phase4-peace-conference）
import { describe, it, expect } from 'vitest';
import type { Engine } from '../../src/engine/engine';
import { createTestEngine, playerCommand } from '../helpers';
import { activeTreatyBetween, relationContributors, isActivePair } from '../../src/engine/diplomacy/treaties';
import { validateDemands, demandValue, aiEvaluatePeace, DEMAND_VALUE_PER_PROV } from '../../src/engine/diplomacy/peace';
import { getRelation } from '../../src/engine/core/state';

const JPN = 0;
const KOR = 1;
const PRK = 2;

async function readyEngine(seed = 20261114, player: string = 'JPN'): Promise<Engine> {
  const engine = await createTestEngine(1, seed, player);
  engine.stepTick(); // 初期tickを1つ進める
  return engine;
}

function provIdx(engine: Engine, id: string): number {
  const i = engine.pack.provinces.findIndex((p) => p.id === id);
  if (i < 0) throw new Error('province not found: ' + id);
  return i;
}

function journalReason(engine: Engine, type: string): string | undefined {
  return engine.world.journal.filter((j) => j.type === type).slice(-1)[0]?.reason;
}

function pushActiveTreaty(engine: Engine, type: 'nonaggression' | 'alliance' | 'trade' | 'access', a: number, b: number): void {
  engine.world.treaties.push({
    id: engine.world.nextTreatyId++, type, a: Math.min(a, b), b: Math.max(a, b),
    startTick: 0, expiryTick: -1, status: 'active', proposer: a,
  });
}

describe('phase4-diplomacy-treaties: 条約', () => {
  it('プレイヤーがAIに貿易協定を提案 → AIが即時判断して締結される', async () => {
    const engine = await readyEngine(301);
    playerCommand(engine, 'proposeTreaty', { target: KOR, type: 'trade' });
    engine.stepTick();
    const treaty = activeTreatyBetween(engine.world, JPN, KOR, 'trade');
    expect(treaty).toBeDefined();
    expect(treaty!.status).toBe('active');
    // AIの判断ログ（KOR側）が残る
    const logs = engine.world.runtime.decisionLog[String(KOR)] ?? [];
    expect(logs.some((l) => l.module === 'treaty')).toBe(true);
  });

  it('同一ペア×同一種の条約は重複提案できない', async () => {
    const engine = await readyEngine(302);
    playerCommand(engine, 'proposeTreaty', { target: KOR, type: 'trade' });
    engine.stepTick();
    playerCommand(engine, 'proposeTreaty', { target: KOR, type: 'trade' });
    engine.stepTick();
    expect(journalReason(engine, 'proposeTreaty')).toBe('alreadyActive');
    expect(engine.world.treaties.filter((t) => t.status !== 'annulled' && t.type === 'trade').length).toBe(1);
  });

  it('AIからプレイヤーへの提案はproposedで受諾待ちになり、受諾でactiveになる', async () => {
    const engine = await readyEngine(303);
    engine.world.runtime.commandsSinceLastTick.push({
      issuer: 'ai:' + PRK, seq: 1, type: 'proposeTreaty', p: { target: JPN, type: 'nonaggression' },
    });
    engine.stepTick();
    const proposed = engine.world.treaties.find((t) => t.status === 'proposed');
    expect(proposed).toBeDefined();
    expect(proposed!.a).toBe(Math.min(JPN, PRK));
    playerCommand(engine, 'acceptTreaty', { treatyId: proposed!.id });
    engine.stepTick();
    expect(proposed!.status).toBe('active');
  });

  it('同盟国への宣戦は却下される', async () => {
    const engine = await readyEngine(304);
    pushActiveTreaty(engine, 'alliance', JPN, KOR);
    playerCommand(engine, 'declareWar', { defender: KOR });
    engine.stepTick();
    expect(journalReason(engine, 'declareWar')).toBe('allied');
    expect(engine.world.wars.length).toBe(0);
    expect(activeTreatyBetween(engine.world, JPN, KOR, 'alliance')).toBeDefined();
  });

  it('不可侵条約相手への宣戦は条約を自動解除して開戦する', async () => {
    const engine = await readyEngine(305);
    pushActiveTreaty(engine, 'nonaggression', JPN, KOR);
    playerCommand(engine, 'declareWar', { defender: KOR });
    engine.stepTick();
    expect(engine.world.wars.length).toBe(1);
    expect(activeTreatyBetween(engine.world, JPN, KOR, 'nonaggression')).toBeUndefined();
    // 解除済み条約はstatus=annulledとして履歴が残る
    expect(engine.world.treaties[0].status).toBe('annulled');
  });

  it('条約は週次ドリフトで関係値を目標へ漸近させる', async () => {
    const engine = await readyEngine(306);
    const before = getRelation(engine.world, JPN, KOR); // 初期30
    pushActiveTreaty(engine, 'nonaggression', JPN, KOR);
    const { target } = relationContributors(engine.world, JPN, KOR);
    for (let t = 0; t < 35; t++) engine.stepTick(); // 5週
    const after = getRelation(engine.world, JPN, KOR);
    // ドリフト上限（±2/週）で目標へ漸近する
    expect(Math.abs(after - target)).toBeLessThan(Math.abs(before - target));
  });

  it('多要素トレースはcontributorsを返す', async () => {
    const engine = await readyEngine(307);
    const r = engine.trace({ kind: 'relationTrace', id: KOR });
    expect(r).not.toBeNull();
    const labels = r!.contribs.map((c) => c.label);
    expect(labels).toContain('イデオロギー距離');
    expect(labels).toContain('脅威認知');
    expect(labels).toContain('目標値');
  });

  it('隣接・条約・戦争・主張・関係値のないペアは週次更新の対象外', async () => {
    const engine = await readyEngine(308);
    // JPN-KORは隣接なし（海）。関係値を取り除けばactiveペアではなくなる
    engine.world.relations = engine.world.relations.filter((r) => !(r.a === JPN && r.b === KOR));
    expect(isActivePair(engine.world, JPN, KOR)).toBe(false);
    // 関係値があればactiveペア
    engine.world.relations.push({ a: JPN, b: KOR, v: 10 });
    expect(isActivePair(engine.world, JPN, KOR)).toBe(true);
  });
});

describe('phase4-peace-conference: 講和会議', () => {
  it('戦闘と占領で戦争貢献度が記録される', async () => {
    const engine = await readyEngine(401, 'PRK');
    const pyongyang = provIdx(engine, 'KP-01');
    for (let i = 0; i < 3; i++) {
      playerCommand(engine, 'createUnit', { country: PRK, province: pyongyang });
    }
    playerCommand(engine, 'declareWar', { defender: KOR });
    engine.stepTick();
    const seoul = provIdx(engine, 'KR-11');
    const ids = engine.world.units.filter((u) => u.owner === PRK && u.loc === pyongyang).map((u) => u.id);
    playerCommand(engine, 'moveUnits', { units: ids, target: seoul });
    for (let t = 0; t < 90; t++) engine.stepTick();
    const war = engine.world.wars[0];
    expect(war).toBeDefined();
    expect(engine.world.prov.controller[seoul]).toBe(PRK);
    expect(war.contrib[PRK] ?? 0).toBeGreaterThan(0);
  });

  it('占領現状に整合しない州を含む講和要求は却下される', async () => {
    const engine = await readyEngine(402, 'PRK');
    engine.world.wars.push({
      id: engine.world.nextWarId++, aggressor: PRK, defender: KOR, startTick: 0, cb: true,
      status: 'active', offeredBy: -1, offerType: -1, offerDemands: [], endTick: -1, contrib: { [PRK]: 0, [KOR]: 0 },
    });
    const tokyo = provIdx(engine, 'JP-13'); // PRKが占領していない州
    playerCommand(engine, 'proposePeace', { warId: engine.world.wars[0].id, demands: [tokyo] });
    engine.stepTick();
    expect(journalReason(engine, 'proposePeace')?.startsWith('invalidDemand')).toBe(true);
  });

  it('要求価値は州10点・首都+20で計算され、返還は負の価値', async () => {
    const engine = await readyEngine(403, 'PRK');
    engine.world.wars.push({
      id: engine.world.nextWarId++, aggressor: PRK, defender: KOR, startTick: 0, cb: true,
      status: 'active', offeredBy: -1, offerType: -1, offerDemands: [], endTick: -1, contrib: { [PRK]: 0, [KOR]: 0 },
    });
    const war = engine.world.wars[0];
    const seoul = provIdx(engine, 'KR-11');
    // PRK支配・KOR領有の現状を作る（首都=KR-11）
    engine.world.prov.controller[seoul] = PRK;
    const value = demandValue(engine.world, war, PRK, [seoul]);
    expect(value).toBe(DEMAND_VALUE_PER_PROV + 20);
    const { valid, invalid } = validateDemands(engine.world, war, PRK, [seoul]);
    expect(valid).toEqual([seoul]);
    expect(invalid).toEqual([]);
  });

  it('劣勢のAIは占領現状に整合した講和要求を受諾し、要求州のみ領有移転する', async () => {
    const engine = await readyEngine(404, 'PRK');
    const seoul = provIdx(engine, 'KR-11');
    const busan = provIdx(engine, 'KR-41');
    // PRKがSeoulとBusanを占領した現状
    engine.world.prov.controller[seoul] = PRK;
    engine.world.prov.controller[busan] = PRK;
    engine.world.wars.push({
      id: engine.world.nextWarId++, aggressor: PRK, defender: KOR, startTick: 0, cb: true,
      status: 'active', offeredBy: -1, offerType: -1, offerDemands: [], endTick: -1, contrib: { [PRK]: 0, [KOR]: 0 },
    });
    const war = engine.world.wars[0];
    // 受諾判断（決定論）: KORのwarScoreは-50 → 譲歩幅50 ≥ 要求価値30
    const decision = aiEvaluatePeace(engine.world, war, PRK, KOR, [seoul]);
    expect(decision.accept).toBe(true);
    // 要求付き講和（Seoulのみ要求・Busanは現状講和で解放）
    playerCommand(engine, 'proposePeace', { warId: war.id, demands: [seoul] });
    engine.stepTick();
    expect(war.status).toBe('ended');
    expect(engine.world.prov.owner[seoul]).toBe(PRK); // 要求州は領有移転
    expect(engine.world.prov.controller[busan]).toBe(KOR); // 非要求州は解放
  });

  it('セーブv4: 条約と貢献度が往復で保存される', async () => {
    const engine = await readyEngine(405);
    playerCommand(engine, 'proposeTreaty', { target: KOR, type: 'trade' });
    engine.stepTick();
    engine.world.wars.push({
      id: engine.world.nextWarId++, aggressor: PRK, defender: KOR, startTick: 0, cb: true,
      status: 'active', offeredBy: -1, offerType: -1, offerDemands: [], endTick: -1, contrib: { [PRK]: 12.5, [KOR]: 3.25 },
    });
    for (let t = 0; t < 30; t++) engine.stepTick();
    const buf = engine.serialize();
    const restored = engine.loadFrom(buf);
    expect(restored.ok).toBe(true);
    const w = engine.world;
    expect(w.treaties.some((t) => t.status === 'active' && t.type === 'trade')).toBe(true);
    const war = w.wars.find((x) => x.status !== 'ended');
    if (war) {
      expect(war.contrib[PRK]).toBeGreaterThan(0);
    }
    // 復元後もトレースAPIが動く
    expect(engine.trace({ kind: 'relationTrace', id: KOR })).not.toBeNull();
  });
});
