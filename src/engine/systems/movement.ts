// 移動システム — 合法性検証（A*）＋日次進行（military-system仕様）。
// 移動速度: speedKm = 60 + 28×infra、供給修正 ×(0.5+0.5×supplyEff)。
// 通行権（phase4-diplomacy-treaties）: access条約または同盟の相手領は通過可。
import { bakedDistanceKm } from '../core/num';
import { atWar, type Unit, type WorldState } from '../core/state';
import { getEdge } from '../map/adjacency';
import { weatherMoveMod } from './weather';
import { activeTreatyBetween, isAllied } from '../diplomacy/treaties';

const KM_PER_DEG_LAT = 111.19;

export function speedKmDay(infra: number): number {
  return 60 + 28 * infra;
}

export function supplySpeedMod(eff: number): number {
  return 0.5 + 0.5 * eff;
}

/** セグメント（from→to）の所要日数 */
export function segmentDays(w: WorldState, from: number, to: number): number {
  const e = getEdge(w, from, to);
  if (!e) return Infinity;
  const speed = speedKmDay(w.prov.infra[from]) * supplySpeedMod(w.runtime.supplyEff[from]) * weatherMoveMod(w, from);
  return e.km / speed;
}

/**
 * A*経路探索。敵国支配プロヴィンスは「目的地」以外通過不可（未開戦国は通過可）。
 * 戻り値: プロヴィンス列（from含む）またはnull（到達不可）。
 */
export function findPath(
  w: WorldState,
  from: number,
  to: number,
  country: number,
  allowHostile = true,
): number[] | null {
  if (from === to) return [from];
  const n = w.prov.count;
  const g = new Array<number>(n).fill(Infinity);
  const f = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const open: number[] = [from];
  const inOpen = new Array<boolean>(n).fill(false);
  const closed = new Array<boolean>(n).fill(false);
  const passable = (p: number): boolean => {
    const ctrl = w.prov.controller[p];
    if (ctrl === country) return true;
    // 交戦国の領土は進攻により通過可。未開戦の他国領は通過不可（military-system仕様）
    if (atWar(w, country, ctrl)) return allowHostile;
    // 通行権（access条約・同盟）があれば他国領を通過可（D-044）
    if (activeTreatyBetween(w, country, ctrl, 'access')) return true;
    if (isAllied(w, country, ctrl)) return true;
    return false;
  };
  const h = (p: number): number => {
    return bakedDistanceKm(
      w.prov.cx[p], w.prov.cy[p], w.prov.cosLat[p],
      w.prov.cx[to], w.prov.cy[to], w.prov.cosLat[to],
      KM_PER_DEG_LAT,
    ) / (60 + 28 * 5);
  };
  g[from] = 0;
  f[from] = h(from);
  inOpen[from] = true;
  while (open.length > 0) {
    // 最小f探索（n小のため線形）
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (f[open[i]] < f[open[bi]]) bi = i;
    }
    const u = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    inOpen[u] = false;
    if (u === to) {
      const path: number[] = [];
      let cur = to;
      while (cur !== -1) {
        path.push(cur);
        cur = prev[cur];
      }
      path.reverse();
      return path;
    }
    closed[u] = true;
    for (let i = w.adj.offsets[u]; i < w.adj.offsets[u + 1]; i++) {
      const v = w.adj.targets[i];
      if (closed[v]) continue;
      if (!passable(v)) continue;
      const seg = segmentDays(w, u, v);
      if (!Number.isFinite(seg)) continue;
      const ng = g[u] + seg;
      if (ng < g[v]) {
        g[v] = ng;
        f[v] = ng + h(v);
        prev[v] = u;
        if (!inOpen[v]) {
          open.push(v);
          inOpen[v] = true;
        }
      }
    }
  }
  return null;
}

export function registerMovementSystem(): void {
  // 戦闘システムがtickMovementを呼び出す（移動→戦闘→占領の順序保証）。
  // 単独登録は不要のため空実装（systems/index.tsでは呼ばない）。
}

/** 日次移動進行。到着時の戦闘判定はcombatシステムが行う。 */
export function tickMovement(w: WorldState): void {
  for (const u of w.units) {
    if (u.destroyed || u.encircled) continue;
    if (u.path.length === 0 || u.segIdx >= u.path.length - 1) continue;
    // Re-check today's access before an edge can be traversed (e.g. peace or access revoked).
    const next = u.path[u.segIdx + 1], ctrl = w.prov.controller[next];
    if (ctrl !== u.owner && !atWar(w, u.owner, ctrl) &&
        !activeTreatyBetween(w, u.owner, ctrl, 'access') && !isAllied(w, u.owner, ctrl)) {
      u.path = []; u.segIdx = 0; u.segProgress = 0; u.segDays = 0;
      continue;
    }
    u.segProgress += 1;
    if (u.segProgress >= u.segDays) {
      // セグメント完了 → 次州へ到着
      u.loc = u.path[u.segIdx + 1];
      u.segIdx++;
      u.segProgress = 0;
      if (u.segIdx >= u.path.length - 1) {
        u.path = [];
        u.segDays = 0;
      } else {
        u.segDays = segmentDays(w, u.path[u.segIdx], u.path[u.segIdx + 1]);
      }
    }
  }
}


/** A route edit preserves an already-started segment. No new persistent state is needed. */
export interface MovementEdit {
  path: number[];
  segIdx: number;
  segProgress: number;
  segDays: number;
}
export function planMovementEdit(w: WorldState,u: Unit,target: number|null): MovementEdit|null {
  const started=u.path.length>0&&u.segProgress>0&&u.segIdx<u.path.length-1;
  const from=started?u.path[u.segIdx+1]:u.loc;
  if (target===null) {
    return started?{path:[u.loc,from],segIdx:0,segProgress:u.segProgress,segDays:u.segDays}:{path:[],segIdx:0,segProgress:0,segDays:0};
  }
  // Redirect is peaceful travel only. A started hostile approach must first finish or be blocked by access rules.
  if (atWar(w,u.owner,w.prov.controller[from])||atWar(w,u.owner,w.prov.controller[target])) return null;
  const suffix=findPath(w,from,target,u.owner,false);
  if(!suffix)return null;
  if(started)return {path:[u.loc,...suffix],segIdx:0,segProgress:u.segProgress,segDays:u.segDays};
  if(suffix.length===1)return {path:[],segIdx:0,segProgress:0,segDays:0};
  return {path:suffix,segIdx:0,segProgress:0,segDays:segmentDays(w,suffix[0],suffix[1])};
}
