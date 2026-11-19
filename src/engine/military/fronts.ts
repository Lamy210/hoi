// 戦線システム（phase2-fronts-logistics）— Frontストア操作と割当ヘルパ。
// 命令発行はsystems/fronts.ts（週次AI）。明示命令（移動中）の師団には触れない。
import { atWar, type Front, type WorldState } from '../core/state';

export function autoFrontProvinces(w: WorldState, owner: number, enemy: number): number[] {
  const out: number[] = [];
  for (let p = 0; p < w.prov.count; p++) {
    if (w.prov.controller[p] !== owner) continue;
    for (let i = w.adj.offsets[p]; i < w.adj.offsets[p + 1]; i++) {
      const v = w.adj.targets[i];
      if (w.prov.controller[v] === enemy && atWar(w, owner, enemy)) {
        out.push(p);
        break;
      }
    }
  }
  return out.sort((a, b) => a - b);
}

export function createFront(w: WorldState, owner: number, enemy: number, provinces: number[], targets: number[], cap: number): Front {
  const front: Front = {
    id: w.nextFrontId++,
    owner,
    enemy,
    stance: 'hold',
    provinces,
    targets,
    cap,
  };
  w.fronts.push(front);
  return front;
}

export function frontOf(w: WorldState, frontId: number): Front | null {
  return w.fronts.find((f) => f.id === frontId) ?? null;
}

export function assignedUnits(w: WorldState, frontId: number): number[] {
  return w.units.filter((u) => !u.destroyed && u.frontId === frontId).map((u) => u.id);
}
