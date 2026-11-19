// 隣接グラフ（CSR）の構築と参照ヘルパ（province-system仕様）
import type { Pack } from '../scenario/types';
import type { WorldState } from '../core/state';

export function buildAdjacency(pack: Pack, provIdx: Map<string, number>) {
  const n = pack.provinces.length;
  const pairKm = new Map<string, { km: number; strait: boolean }>();
  for (const e of pack.edges) {
    const key = edgeKey(e.a, e.b);
    pairKm.set(key, { km: e.km, strait: e.strait });
  }
  // 有向エッジ列（両方向）を構築し、ターゲット順にソート（決定論）
  const directed: { from: number; to: number; km: number; strait: boolean }[] = [];
  for (const [key, v] of pairKm) {
    const [as, bs] = key.split('|');
    const a = provIdx.get(as);
    const b = provIdx.get(bs);
    if (a === undefined || b === undefined) continue;
    directed.push({ from: a, to: b, km: v.km, strait: v.strait });
    directed.push({ from: b, to: a, km: v.km, strait: v.strait });
  }
  directed.sort((x, y) => x.from - y.from || x.to - y.to);
  const offsets = new Array<number>(n + 1).fill(0);
  for (const d of directed) offsets[d.from + 1]++;
  for (let i = 0; i < n; i++) offsets[i + 1] += offsets[i];
  const targets = new Array<number>(directed.length);
  const km = new Array<number>(directed.length);
  const strait = new Array<boolean>(directed.length);
  const cursor = offsets.slice(0, n);
  for (const d of directed) {
    const pos = cursor[d.from]++;
    targets[pos] = d.to;
    km[pos] = d.km;
    strait[pos] = d.strait;
  }
  return { offsets, targets, km, strait };
}

export function edgeKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

/** a→bのエッジ情報（なければnull） */
export function getEdge(w: WorldState, a: number, b: number): { km: number; strait: boolean } | null {
  for (let i = w.adj.offsets[a]; i < w.adj.offsets[a + 1]; i++) {
    if (w.adj.targets[i] === b) return { km: w.adj.km[i], strait: w.adj.strait[i] };
  }
  return null;
}

export function neighborCount(w: WorldState, prov: number): number {
  return w.adj.offsets[prov + 1] - w.adj.offsets[prov];
}
