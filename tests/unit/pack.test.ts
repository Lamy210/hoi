// パック検証（scenario-system仕様のテストケース）
import { describe, it, expect } from 'vitest';
import { loadTestPack, nodeFetch } from '../helpers';
import { createHash } from 'node:crypto';
import { loadPack, packFingerprint, cryptoAvailable, type FetchImpl } from '../../src/engine/scenario/loader';

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

describe('検証済みシナリオパックの整合性', () => {
  const base = 'file:///packs/modern-eastasia/';
  const asResponse = (text: string, ok = true) => ({
    ok, status: ok ? 200 : 404, text: async () => text, json: async () => JSON.parse(text),
  });
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
  async function checksums(): Promise<Record<string, string>> {
    return (await (await nodeFetch(base + 'checksums.json')).json()) as Record<string, string>;
  }

  it('検証モードで必須チェックサムの欠落を拒否する', async () => {
    expect(cryptoAvailable).toBe(true);
    const sums = await checksums();
    delete sums['geometry-lod2.json'];
    const fetchImpl: FetchImpl = async (url) => url.endsWith('checksums.json')
      ? asResponse(JSON.stringify(sums)) : nodeFetch(url);
    await expect(loadPack(base, { fetchImpl })).rejects.toMatchObject({
      violations: expect.arrayContaining(['missing checksum: geometry-lod2.json']),
    });
  });

  it('HTTPエラーとチェックサム不一致を拒否する', async () => {
    const fetchImpl: FetchImpl = async (url) => {
      if (url.endsWith('countries.json')) return asResponse('[]', false);
      if (url.endsWith('provinces.json')) return asResponse('[]');
      return nodeFetch(url);
    };
    await expect(loadPack(base, { fetchImpl })).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.stringContaining('checksum verification failed: countries.json'),
        'checksum mismatch: provinces.json',
      ]),
    });
  });

  it('検証済みの本体を再取得せずに初期化する', async () => {
    const calls = new Map<string, number>();
    const fetchImpl: FetchImpl = async (url) => {
      const n = (calls.get(url) ?? 0) + 1;
      calls.set(url, n);
      if (n > 1) return asResponse('[]');
      return nodeFetch(url);
    };
    const pack = await loadPack(base, { fetchImpl });
    expect(pack.provinces).toHaveLength(110);
    expect([...calls.values()].every(n => n === 1)).toBe(true);
  });

  it('ハッシュが正しくてもLODの州順序が異なる場合は拒否する', async () => {
    const sums = await checksums();
    const geometry = await (await nodeFetch(base + 'geometry-lod2.json')).json() as { features: unknown[] };
    [geometry.features[0], geometry.features[1]] = [geometry.features[1], geometry.features[0]];
    const changed = JSON.stringify(geometry);
    sums['geometry-lod2.json'] = sha256(changed);
    const fetchImpl: FetchImpl = async (url) => {
      if (url.endsWith('checksums.json')) return asResponse(JSON.stringify(sums));
      if (url.endsWith('geometry-lod2.json')) return asResponse(changed);
      return nodeFetch(url);
    };
    await expect(loadPack(base, { fetchImpl })).rejects.toMatchObject({
      violations: expect.arrayContaining(['geometry province order or type mismatch: geometry-lod2.json']),
    });
  });

  it('現行パックは各国の州人口合計と国人口が一致する', async () => {
    const pack = await loadTestPack(true);
    for (const country of pack.countries) {
      const sum = pack.provinces.filter(p => p.owner === country.id).reduce((n, p) => n + p.population, 0);
      expect(sum, country.id).toBe(country.population);
    }
  });
});
