// 補給システム — MVP: ソース（首都）からの到達性＋距離減衰（logistics-system仕様）。
// Phase 3で容量つきフローへ置換するが、消費側API（supplyEff）契約は不変。
import { clamp } from '../core/num';
import { addAlert, atWar, type WorldState } from '../core/state';
import { registerSystem, weeklyOffset } from '../core/scheduler';
import { techMods } from './research';

export const SUPPLY_RADIUS_KM = 2200;

export interface SupplyResult {
  effByCountry: Map<number, number[]>;
}

/** ソースから各プロヴィンスへの最短距離（Dijkstra・km累積）。敵支配プロヴィンスは通過不可。 */
export function dijkstraFrom(w: WorldState, country: number, source: number): number[] {
  const n = w.prov.count;
  const dist = new Array<number>(n).fill(Infinity);
  // バイナリヒープ（phase3: ティアMの週次スパイク解消・docs/13 §5）。距離値は緩和の順序に依存しない。
  const heap: number[] = []; // ノード番号、並行配列に距離
  const heapDist: number[] = [];
  const push = (node: number, d: number): void => {
    heap.push(node);
    heapDist.push(d);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapDist[parent] <= heapDist[i]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      [heapDist[parent], heapDist[i]] = [heapDist[i], heapDist[parent]];
      i = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const lastNode = heap.pop()!;
    const lastDist = heapDist.pop()!;
    if (heap.length > 0) {
      heap[0] = lastNode;
      heapDist[0] = lastDist;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heapDist[l] < heapDist[m]) m = l;
        if (r < heap.length && heapDist[r] < heapDist[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [heapDist[m], heapDist[i]] = [heapDist[i], heapDist[m]];
        i = m;
      }
    }
    return top;
  };
  dist[source] = 0;
  push(source, 0);
  while (heap.length > 0) {
    const u = pop();
    const du = heapDist.length; // ダミー（pop内で距離は別管理）
    void du;
    // 古いエントリ（より長い距離で積まれたもの）はスキップ: dist[u]より大きい距離でpopされたものは無視
    for (let i = w.adj.offsets[u]; i < w.adj.offsets[u + 1]; i++) {
      const v = w.adj.targets[i];
      const ctrl = w.prov.controller[v];
      if (ctrl !== country && atWar(w, country, ctrl)) continue; // 敵地は通過不可
      const nd = dist[u] + w.adj.km[i];
      if (nd < dist[v]) {
        dist[v] = nd;
        push(v, nd);
      }
    }
  }
  return dist;
}

/** 距離減衰の再計算（週次+dirty駆動。ティアMでの日次Dijkstra回避・docs/13 §5） */
export function recomputeGraphs(w: WorldState): void {
  for (let c = 0; c < w.countries.count; c++) {
    if (!w.countries.alive[c]) {
      w.runtime.graphEff.delete(c);
      continue;
    }
    const cap = w.countries.capital[c];
    const eff = new Array<number>(w.prov.count).fill(0);
    if (w.prov.controller[cap] !== c) {
      // 首都喪失: 全国土で供給0.3（MVP簡易処理。回復は講和による首都奪還時）
      for (let p = 0; p < w.prov.count; p++) eff[p] = w.prov.owner[p] === c ? 0.3 : 0;
    } else {
      const dist = dijkstraFrom(w, c, cap);
      const radius = SUPPLY_RADIUS_KM * (1 + techMods(w, c, 'supplyRadius'));
      for (let p = 0; p < w.prov.count; p++) {
        eff[p] = dist[p] === Infinity ? 0 : clamp(1 - dist[p] / radius, 0, 1);
      }
    }
    w.runtime.graphEff.set(c, eff);
  }
}

/** 州の実効支配国の距離eff → supplyEff へ反映（日次・低コスト） */
function applyGraphsToProvinces(w: WorldState): void {
  for (let p = 0; p < w.prov.count; p++) {
    const ctrl = w.prov.controller[p];
    const ge = ctrl >= 0 ? w.runtime.graphEff.get(ctrl) : undefined;
    const e = ge ? ge[p] : 0;
    // 補給遮断アラート（0.3超 → 0.1未満への悪化時、1回のみ）
    const prev = w.runtime.supplyEff[p];
    if (prev > 0.3 && e < 0.1) {
      addAlert(w, {
        kind: 'supplyCut',
        priority: 6,
        msgKey: 'alert.supplyCut',
        params: { province: w.prov.nameJa[p] || w.prov.nameEn[p] },
        province: p,
        actor: ctrl,
      });
    }
    w.runtime.supplyEff[p] = e;
  }
}

/** 容量係数（D-023）の再計算（日次・師団数依存のため毎tick） */
function applyCapacityFactors(w: WorldState): void {
  w.runtime.unitSupplyFactor.clear();
  for (let c = 0; c < w.countries.count; c++) {
    if (!w.countries.alive[c]) continue;
    const hubs: number[] = [];
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.controller[p] !== c) continue;
      if (p === w.countries.capital[c] || w.prov.terrain[p] === 3) hubs.push(p);
    }
    const capLeft = hubs.map((p) => 6 + 3 * w.prov.infra[p]);
    const units = w.units.filter((u) => !u.destroyed && u.owner === c);
    for (const u of units) {
      let bestHub = -1;
      let bestD = Infinity;
      for (let hi = 0; hi < hubs.length; hi++) {
        const p = hubs[hi];
        const dx = w.prov.cx[p] - w.prov.cx[u.loc];
        const dy = w.prov.cy[p] - w.prov.cy[u.loc];
        const d = dx * dx + dy * dy;
        if (d < bestD - 1e-12) {
          bestD = d;
          bestHub = hi;
        }
      }
      if (bestHub >= 0 && capLeft[bestHub] >= 1) {
        capLeft[bestHub] -= 1;
        w.runtime.unitSupplyFactor.set(u.id, 1);
      } else {
        w.runtime.unitSupplyFactor.set(u.id, 0.5); // 容量超過またはハブなし
      }
    }
  }
}

export function recomputeSupply(w: WorldState): void {
  recomputeGraphs(w);
  applyGraphsToProvinces(w);
  applyCapacityFactors(w);
}

export function registerLogisticsSystems(): void {
  registerSystem({
    name: 'logistics',
    cadence: 'daily',
    fn: (w) => {
      // 日次: 容量係数（師団数依存・低コスト）＋州反映。
      // 週次/dirty: 距離グラフ再計算（ティアM予算のため分割・docs/13 §5）。
      if (w.runtime.supplyDirty || (w.tick % 7) === weeklyOffset('logistics')) {
        recomputeGraphs(w);
        w.runtime.supplyDirty = false;
      }
      applyGraphsToProvinces(w);
      applyCapacityFactors(w);
    },
  });
}
