// パック検証（scenario-system仕様のテストケース）
import { describe, it, expect } from 'vitest';
import { loadTestPack } from '../helpers';
import { packFingerprint } from '../../src/engine/scenario/loader';

describe('現代東アジアパック', () => {
  it('checksum検証つきでロードできる', async () => {
    const pack = await loadTestPack(true);
    expect(pack.manifest.id).toBe('modern-eastasia');
    expect(pack.provinces.length).toBeGreaterThan(100);
    expect(pack.countries.length).toBe(5);
    expect(pack.edges.length).toBeGreaterThan(200);
  });

  it('隣接グラフは対称（INV-5）', async () => {
    const pack = await loadTestPack(false);
    const ids = new Set(pack.provinces.map((p) => p.id));
    const undirected = new Map<string, { km: number; strait: boolean }>();
    for (const e of pack.edges) {
      expect(ids.has(e.a)).toBe(true);
      expect(ids.has(e.b)).toBe(true);
      expect(e.a).not.toBe(e.b);
      expect(e.km).toBeGreaterThan(0);
      const key = [e.a, e.b].sort().join('|');
      expect(undirected.has(key)).toBe(false); // 重複なし
      undirected.set(key, { km: e.km, strait: e.strait });
    }
  });

  it('首都は自国領・開始師団は自国領・領有主張は実在（INV-1）', async () => {
    const pack = await loadTestPack(false);
    for (const c of pack.countries) {
      const cap = pack.provinces.find((p) => p.id === c.capital);
      expect(cap, c.id + ' capital').toBeDefined();
      expect(cap!.owner).toBe(c.id);
      for (const cl of c.claims) {
        expect(pack.provinces.find((p) => p.id === cl)).toBeDefined();
      }
      for (const sd of c.startDivisions) {
        for (const at of sd.at) {
          expect(pack.provinces.find((p) => p.id === at)!.owner).toBe(c.id);
        }
      }
    }
  });

  it('人口は正（INV-4の入力側）・infra 0-5・地形は既定6種', async () => {
    const pack = await loadTestPack(false);
    const terrains = new Set(['plains', 'hills', 'mountains', 'urban', 'forest', 'desert']);
    for (const p of pack.provinces) {
      expect(p.population).toBeGreaterThan(0);
      expect(p.infra).toBeGreaterThanOrEqual(0);
      expect(p.infra).toBeLessThanOrEqual(5);
      expect(terrains.has(p.terrain)).toBe(true);
    }
  });

  it('日本の国人口は実統計（real）で約1.24億', async () => {
    const pack = await loadTestPack(false);
    const jp = pack.countries.find((c) => c.id === 'JPN')!;
    expect(jp.popQuality).toBe('real');
    expect(jp.population).toBeGreaterThan(120_000_000);
    expect(jp.population).toBeLessThan(128_000_000);
  });

  it('フィンガープリントは決定論的', async () => {
    const a = await loadTestPack(false);
    const b = await loadTestPack(false);
    expect(packFingerprint(a)).toBe(packFingerprint(b));
  });
});
