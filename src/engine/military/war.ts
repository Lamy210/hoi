// 戦争状態の生成・終結と戦争スコア（military/diplomacy仕様）。
// 講和は「現状ライン＋領土要求リスト」（講和会議UIはphase4-peace-conference）。
import type { War, WorldState } from '../core/state';
import { annulTreatiesBetween, annulTreatiesOf } from '../diplomacy/treaties';
import { validateDemands } from '../diplomacy/peace';

export function startWar(w: WorldState, aggressor: number, defender: number, cb: boolean): War {
  // 宣戦による条約自動解除（diplomacy-system仕様: 不可侵条約は宣戦で解除）
  annulTreatiesBetween(w, aggressor, defender, 'breached');
  const war: War = {
    id: w.nextWarId++,
    aggressor,
    defender,
    startTick: w.tick,
    cb,
    status: 'active',
    offeredBy: -1,
    offerType: -1,
    offerDemands: [],
    endTick: -1,
    contrib: { [aggressor]: 0, [defender]: 0 },
  };
  w.wars.push(war);
  // 関係値への影響（CBなしは追加ペナルティ）
  applyRelationDelta(w, aggressor, defender, cb ? -40 : -60);
  w.runtime.supplyDirty = true;
  return war;
}

export function endWar(w: WorldState, war: War, mode: 'white' | 'demand' | 'victory' = 'white', demands: number[] = []): void {
  war.status = 'ended';
  war.endTick = w.tick;
  // Stop queued front automation across peace/redeclaration; explicitly resume a new plan.
  for (const f of w.fronts) if ((f.owner===war.aggressor&&f.enemy===war.defender)||(f.owner===war.defender&&f.enemy===war.aggressor)) { f.paused=true; if ((f.revision??1)<Number.MAX_SAFE_INTEGER) f.revision=(f.revision??1)+1; }
  const pair = [war.aggressor, war.defender];
  const demanded = mode === 'demand' && demands.length > 0
    ? new Set(validateDemands(w, war, war.offeredBy >= 0 ? war.offeredBy : war.aggressor, demands).valid)
    : null;
  for (let p = 0; p < w.prov.count; p++) {
    const owner = w.prov.owner[p];
    const ctrl = w.prov.controller[p];
    if (owner === ctrl) continue;
    if (!pair.includes(owner) || !pair.includes(ctrl)) continue;
    if (mode === 'white') {
      // 現状講和: 占領地を解放（controller → owner へ復帰。INV-1の維持）
      w.prov.controller[p] = owner;
      w.occupancyTimer[p] = 0;
      w.occupierCandidate[p] = -1;
    } else if (demanded !== null) {
      // 部分割譲（demand+demands）: 要求州のみ領有移転、其余は現状講和で解放
      if (demanded.has(p)) {
        w.prov.owner[p] = ctrl;
        w.occupancyTimer[p] = 0;
        w.occupierCandidate[p] = -1;
      } else {
        w.prov.controller[p] = owner;
        w.occupancyTimer[p] = 0;
        w.occupierCandidate[p] = -1;
      }
    } else {
      // 割譲（demand）/勝利的講和（victory）: 領有が支配国へ移転（INV-1の解消）
      w.prov.owner[p] = ctrl;
      w.occupancyTimer[p] = 0;
      w.occupierCandidate[p] = -1;
    }
  }
  w.runtime.supplyDirty = true;
  // 戦争終結で条約は全解除（diplomacy-system仕様）
  annulTreatiesBetween(w, war.aggressor, war.defender, 'annulled');
  applyRelationDelta(w, war.aggressor, war.defender, 10);
}

/** 国家の併合判定（日次）。全領土が戦争相手に支配され無兵力の国は消滅する。 */
export function checkAnnexation(w: WorldState): number[] {
  const annexed: number[] = [];
  for (let c = 0; c < w.countries.count; c++) {
    if (!w.countries.alive[c]) continue;
    let allOccupied = true;
    let occupier = -1;
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.owner[p] !== c) continue;
      if (w.prov.controller[p] === c) {
        allOccupied = false;
        break;
      }
      if (occupier < 0) occupier = w.prov.controller[p];
    }
    if (!allOccupied) continue;
    const hasUnits = w.units.some((u) => !u.destroyed && u.owner === c);
    if (hasUnits) continue;
    // 併合: 領有を支配国へ移転・国家消滅・戦争終結
    for (let p = 0; p < w.prov.count; p++) {
      if (w.prov.owner[p] === c) {
        w.prov.owner[p] = w.prov.controller[p];
        w.occupancyTimer[p] = 0;
        w.occupierCandidate[p] = -1;
      }
    }
    w.countries.alive[c] = false;
    annulTreatiesOf(w, c);
    for (const u of w.units) {
      if (u.owner === c) u.destroyed = true;
    }
    for (const war of w.wars) {
      if (war.status !== 'ended' && (war.aggressor === c || war.defender === c)) {
        endWar(w, war, 'victory');
      }
    }
    for (const f of w.fronts) {
      if (f.owner === c || f.enemy === c) f.stance = 'retreat';
    }
    annexed.push(c);
  }
  return annexed;
}

export function applyRelationDelta(w: WorldState, a: number, b: number, delta: number): void {
  const existing = w.relations.find(
    (r) => (r.a === Math.min(a, b) && r.b === Math.max(a, b)),
  );
  if (existing) {
    existing.v = Math.max(-100, Math.min(100, existing.v + delta));
  } else {
    w.relations.push({ a: Math.min(a, b), b: Math.max(a, b), v: Math.max(-100, Math.min(100, delta)) });
  }
}

export function getRelationValue(w: WorldState, a: number, b: number): number {
  const r = w.relations.find((r) => r.a === Math.min(a, b) && r.b === Math.max(a, b));
  return r ? r.v : 0;
}

/** 戦争スコア（講和AI・UI表示用）。占領州+/-10、首都占領+/-30。 */
export function warScoreFor(w: WorldState, war: War, country: number): number {
  const enemy = war.aggressor === country ? war.defender : war.aggressor;
  let score = 0;
  for (let p = 0; p < w.prov.count; p++) {
    const owner = w.prov.owner[p];
    const ctrl = w.prov.controller[p];
    if (owner === enemy && ctrl === country) score += 10;
    if (owner === country && ctrl === enemy) score -= 10;
    if (owner === enemy && ctrl === country && p === w.countries.capital[enemy]) score += 30;
    if (owner === country && ctrl === enemy && p === w.countries.capital[country]) score -= 30;
  }
  return Math.max(-100, Math.min(100, score));
}

/** 国が関与しているactiveな戦争一覧 */
export function warsOf(w: WorldState, country: number): War[] {
  return w.wars.filter((war) => {
    if (war.status === 'ended') return false;
    return war.aggressor === country || war.defender === country;
  });
}

/** 指定国が参戦中の戦争が1つでもあるか */
export function hasActiveWar(w: WorldState, country: number): boolean {
  return warsOf(w, country).length > 0;
}
