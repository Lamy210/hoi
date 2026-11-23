// 戦線システム（phase2-fronts-logistics）— Frontストア操作と割当ヘルパ。
// 命令発行はsystems/fronts.ts（週次AI）。明示命令（移動中）の師団には触れない。
import { atWar, type Front, type WorldState } from '../core/state';

/** Front automation never orders depleted divisions back into combat immediately.
 * Manual attackUnits orders remain independent of these thresholds.
 */
export const AUTO_ATTACK_MIN_ORG = 60;
export const COUNTERATTACK_MIN_ORG = 75;
export const FRONT_RESERVE_MIN_ORG = 45;

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

/** Active operational boundary for a front. The drawn home border remains unchanged;
 * captured enemy provinces containing assigned divisions can extend the live line.
 * A different war or unrelated distant border never becomes part of this front.
 */
export function operationalFrontProvinces(w:WorldState,front:Front):number[] {
  const active=new Set(front.provinces.filter(p=>w.prov.controller[p]===front.owner));
  for(const u of w.units){
    if(u.destroyed||u.owner!==front.owner||u.frontId!==front.id||u.path.length||
      w.prov.controller[u.loc]!==front.owner)continue;
    // The line may also fall back one tile behind a captured part of its
    // original drawn border. The unit must be adjacent to THAT lost border:
    // unrelated theaters remain outside this front.
    let adjacentEnemy=false,adjacentLostDrawn=false;
    for(let i=w.adj.offsets[u.loc];i<w.adj.offsets[u.loc+1];i++){
      if(w.adj.strait[i])continue;
      const p=w.adj.targets[i];
      if(w.prov.controller[p]===front.enemy){
        adjacentEnemy=true;
        if(front.provinces.includes(p))adjacentLostDrawn=true;
      }
    }
    if(adjacentEnemy&&(w.prov.owner[u.loc]===front.enemy||adjacentLostDrawn)){
      active.add(u.loc);
    }
  }
  return [...active].sort((a,b)=>a-b);
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
