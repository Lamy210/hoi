// Phase 2ゲート: 50年×20シードの長期安定性（docs/13 G4）＋1シードの完全リプレイ二重実行
import { describe, it, expect } from 'vitest';
import { loadTestPack } from '../helpers';
import { createEngine, type Engine } from '../../src/engine/engine';
import { hashWorld } from '../../src/engine/core/hash';

const YEARS = 50;
const TICKS = YEARS * 360; // 50年×360日
const SEEDS = 20;

function sanity(engine: Engine, seed: number): void {
  const w = engine.world;
  // phase3: 経済安定性（docs/14 Phase 3受入）— 資金保存則・価格clamp・国庫非負
  const money = w.treasury.reduce((a, b) => a + b, 0) + w.householdPool;
  expect(Number.isFinite(money), `seed ${seed} money finite`).toBe(true);
  expect(money).toBeGreaterThan(0);
  for (const t of w.treasury) {
    expect(t, `seed ${seed} treasury`).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(t)).toBe(true);
  }
  const BASE = [1.0, 5.0, 0.5, 1.0];
  for (let g = 0; g < 4; g++) {
    for (let c = 0; c < w.countries.count; c++) {
      expect(w.prices[g][c]).toBeGreaterThanOrEqual(BASE[g] * 0.25 - 1e-9);
      expect(w.prices[g][c]).toBeLessThanOrEqual(BASE[g] * 4 + 1e-9);
    }
  }
  for (let c = 0; c < w.countries.count; c++) {
    expect(Number.isFinite(w.gdp[c]), `seed ${seed} gdp`).toBe(true);
    expect(Number.isFinite(w.livingStandard[c]), `seed ${seed} living`).toBe(true);
    expect(Number.isFinite(w.supportRate[c])).toBe(true);
    expect(Number.isFinite(w.stability[c])).toBe(true);
    expect(Number.isFinite(w.pp[c])).toBe(true);
  }
  for (const u of w.units) {
    expect(Number.isFinite(u.org), `seed ${seed} unit ${u.id} org`).toBe(true);
    expect(Number.isFinite(u.manpower), `seed ${seed} unit ${u.id} manpower`).toBe(true);
    expect(u.manpower).toBeGreaterThanOrEqual(0);
    expect(u.infEquipment).toBeGreaterThanOrEqual(0);
    expect(u.artEquipment).toBeGreaterThanOrEqual(0);
    expect(u.org).toBeLessThanOrEqual(100);
  }
  for (let c = 0; c < w.countries.count; c++) {
    expect(Number.isFinite(w.countries.manpowerPool[c]), `seed ${seed} mp ${c}`).toBe(true);
    expect(w.countries.manpowerPool[c]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(w.countries.infEquipmentStock[c]), `seed ${seed} inf ${c}`).toBe(true);
    expect(Number.isFinite(w.countries.artEquipmentStock[c]), `seed ${seed} art ${c}`).toBe(true);
  }
  for (let p = 0; p < w.prov.count; p++) {
    const e = w.runtime.supplyEff[p];
    expect(Number.isFinite(e), `seed ${seed} supply ${p}`).toBe(true);
    expect(e).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThanOrEqual(1);
  }
  // アンカーの単調性（tick増加・ハッシュ有限）
  for (let i = 1; i < w.anchors.length; i++) {
    expect(w.anchors[i].tick).toBeGreaterThan(w.anchors[i - 1].tick);
    expect(Number.isFinite(w.anchors[i].hash)).toBe(true);
  }
}

describe('長期安定性（Phase 2/3ゲート G4・経済安定性）', () => {
  it('50年×20シードで発散なし（NaN・負値・アンカー異常ゼロ）', async () => {
    const pack = await loadTestPack(false);
    for (let s = 0; s < SEEDS; s++) {
      const seed = 1000 + s * 17;
      const engine = createEngine(pack, { seed, playerCountryId: 'JPN', difficulty: s % 3 === 0 ? 2 : 1 });
      for (let t = 0; t < TICKS; t++) engine.stepTick();
      sanity(engine, seed);
    }
  }, 900000);

  it('50年で資金保存則（Σ国庫+家計は初期値と一致）', async () => {
    const pack = await loadTestPack(false);
    for (const seed of [1111, 2222]) {
      const engine = createEngine(pack, { seed, playerCountryId: 'JPN', difficulty: 1 });
      const money0 = engine.world.treasury.reduce((a, b) => a + b, 0) + engine.world.householdPool;
      for (let t = 0; t < 18000; t++) engine.stepTick();
      const money = engine.world.treasury.reduce((a, b) => a + b, 0) + engine.world.householdPool;
      expect(money).toBeCloseTo(money0, -4); // 全収支は資金移転（INV-2）
    }
  }, 600000);

  it('50年の完全リプレイ二重実行で全アンカー一致', async () => {
    const pack = await loadTestPack(false);
    const seed = 7777;
    const a = createEngine(pack, { seed, playerCountryId: 'PRK', difficulty: 1 });
    const b = createEngine(pack, { seed, playerCountryId: 'PRK', difficulty: 1 });
    for (let t = 0; t < TICKS; t++) {
      a.stepTick();
      b.stepTick();
    }
    expect(a.world.anchors.length).toBeGreaterThan(YEARS * 12 - 5);
    for (let i = 0; i < a.world.anchors.length; i++) {
      expect(a.world.anchors[i].hash, 'anchor ' + i).toBe(b.world.anchors[i].hash);
    }
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  }, 900000);
});
