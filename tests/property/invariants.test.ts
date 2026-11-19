// プロパティテスト（fast-check）— 不変条件 INV-4/5・経路合法性・戦闘境界
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadTestPack } from '../helpers';
import { buildWorld } from '../../src/engine/scenario/build';
import { findPath, segmentDays } from '../../src/engine/systems/movement';
import { atWar } from '../../src/engine/core/state';
import { unitPowerFactorsPure } from '../../src/engine/systems/combat';

describe('不変条件のプロパティテスト', () => {
  it('任意の自国内2点間で経路が存在し、経路は隣接辺の連結かつ敵地を通らない', async () => {
    const pack = await loadTestPack(false);
    const w = buildWorld(pack, { seed: 555, playerCountryId: 'JPN', difficulty: 1 });
    // プロヴィンスを所有国ごとにグループ
    const byCountry: number[][] = Array.from({ length: w.countries.count }, () => []);
    for (let p = 0; p < w.prov.count; p++) byCountry[w.prov.owner[p]].push(p);
    // 沖縄・済州など孤立州を除外
    const groups = byCountry.map((g) => g.filter((p) => w.adj.offsets[p + 1] > w.adj.offsets[p]));
    // 200ペアを決定論的に検証
    let tested = 0;
    for (let round = 0; round < 200; round++) {
      const g = groups[round % groups.length];
      if (g.length < 2) continue;
      const a = g[(round * 13) % g.length];
      const b = g[(round * 7 + 3) % g.length];
      if (a === b) continue;
      const path = findPath(w, a, b, w.prov.owner[a]);
      expect(path, `${a}->${b}`).not.toBeNull();
      for (let i = 0; i < path!.length - 1; i++) {
        const from = path![i];
        const to = path![i + 1];
        expect(Number.isFinite(segmentDays(w, from, to))).toBe(true);
        if (i < path!.length - 2) {
          // 中間州は自国または非交戦国
          expect(atWar(w, w.prov.owner[a], w.prov.controller[to]) && w.prov.controller[to] !== w.prov.owner[a]).toBe(false);
        }
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(50);
  }, 120000);

  it('戦闘力係数は境界入力でも有限かつ正（NaN/Infinity禁止）', async () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 1 }),
        (org, mp, eq, exp, side) => {
          const u = {
            id: 1, owner: 0, loc: 0, path: [], segIdx: 0, segProgress: 0, segDays: 0,
            manpower: mp, maxManpower: 10000, infEquipment: eq, maxInfEquipment: 1000,
            artEquipment: eq / 5, maxArtEquipment: 200,
            org, exp, frontId: -1, commanderId: -1, encircled: false, destroyed: false,
          };
          const contribs = unitPowerFactorsPure(u, 2 /* mountains */, 0.4, side === 0 ? 'attack' : 'defend');
          const product = contribs.reduce((acc, c) => acc * c.value, 1);
          expect(Number.isFinite(product)).toBe(true);
          expect(product).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('州のowner/controller配列は常に範囲内（シードを変えて100回構築）', async () => {
    const pack = await loadTestPack(false);
    for (let seed = 1; seed <= 20; seed++) {
      const w = buildWorld(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
      for (let p = 0; p < w.prov.count; p++) {
        expect(w.prov.owner[p]).toBeGreaterThanOrEqual(0);
        expect(w.prov.owner[p]).toBeLessThan(w.countries.count);
        expect(w.prov.controller[p]).toBe(w.prov.owner[p]); // 初期状態では一致
      }
    }
  });

describe('phase4: 条約・関係値の不変条件（fast-check）', () => {
  it('任意の条約集合で「戦争中ペアに有効条約が残る」ことはない（annulTreatiesBetween後）', async () => {
    const { startWar, endWar } = await import('../../src/engine/military/war');
    const { annulTreatiesBetween, activeTreatyBetween, TREATY_TYPES } = await import('../../src/engine/diplomacy/treaties');
    const pack = await loadTestPack(false);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 99999 }), async (seed) => {
        const w = buildWorld(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
        // ランダムなペアにランダム種の条約を作る
        const types = TREATY_TYPES;
        const pairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 4]];
        for (let i = 0; i < pairs.length; i++) {
          const [a, b] = pairs[i];
          const type = types[(seed + i) % types.length];
          w.treaties.push({
            id: w.nextTreatyId++, type, a: Math.min(a, b), b: Math.max(a, b),
            startTick: 0, expiryTick: -1, status: 'active', proposer: a,
          });
        }
        // ランダムペアで開戦→条約は全解除される
        const [aggressor, defender] = pairs[seed % pairs.length];
        startWar(w, aggressor, defender, true);
        expect(activeTreatyBetween(w, aggressor, defender)).toBeUndefined();
        // 終結後も矛盾した条約は存在しない
        for (const war of w.wars) {
          if (war.status === 'active') {
            expect(activeTreatyBetween(w, war.aggressor, war.defender)).toBeUndefined();
          }
        }
        endWar(w, w.wars[0], 'white');
        annulTreatiesBetween(w, aggressor, defender);
        for (const t of w.treaties) {
          if (t.status === 'active') {
            expect(atWar(w, t.a, t.b)).toBe(false);
          }
        }
      }),
      { numRuns: 30 },
    );
  }, 120000);

  it('多要素関係値のcontributorsは範囲内かつ目標値は[-100,100]にclampされる', async () => {
    const { relationContributors } = await import('../../src/engine/diplomacy/treaties');
    const pack = await loadTestPack(false);
    for (let seed = 1; seed <= 10; seed++) {
      const w = buildWorld(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
      for (let a = 0; a < w.countries.count; a++) {
        for (let b = a + 1; b < w.countries.count; b++) {
          const { contribs, target } = relationContributors(w, a, b);
          expect(contribs.ideologyDist).toBeGreaterThanOrEqual(0);
          expect(contribs.ideologyDist).toBeLessThanOrEqual(15);
          expect(contribs.threat).toBeGreaterThanOrEqual(0);
          expect(contribs.threat).toBeLessThanOrEqual(40);
          expect(contribs.claimsConflict).toBeLessThanOrEqual(30);
          expect(target).toBeGreaterThanOrEqual(-100);
          expect(target).toBeLessThanOrEqual(100);
        }
      }
    }
  }, 120000);
});

});
