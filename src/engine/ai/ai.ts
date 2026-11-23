// AIシステム — 週次思考（国家分散）・Utility評価・判断ログ（ai-system仕様）。
// 全行動はコマンド経由（INV-3）。難易度は評価頻度・誤差注入・閾値で表現し、
// 資源ボーナスはHardのみ+10%（production.ts、UI設定で透明化）。
import { deriveStream } from '../core/rng';
import { type Unit, type WorldState } from '../core/state';
import { getRelationValue } from '../military/war';
import { weeklyOffset, registerSystem } from '../core/scheduler';
import { findPath } from '../systems/movement';
import { unitPowerFactorsPure } from '../systems/combat';
import { techDefs } from '../systems/research';
import type { TechDef } from '../scenario/types';
import { hasActiveWar, warsOf, warScoreFor } from '../military/war';
import { aiCmd } from '../commands';
import { activeTreatyBetween, isAllied } from '../diplomacy/treaties';
import type { TreatyType } from '../core/state';

function log(
  w: WorldState,
  country: number,
  module: string,
  options: string[],
  scores: number[],
  chosen: string,
  reason: string,
): void {
  const key = String(country);
  const arr = (w.runtime.decisionLog[key] ||= []);
  arr.push({ tick: w.tick, module, options, scores: scores.map((s) => Math.round(s * 1000) / 1000), chosen, reason });
  if (arr.length > 100) arr.shift();
}

function unitsOf(w: WorldState, country: number): Unit[] {
  return w.units.filter((u) => u.owner === country && !u.destroyed);
}

function unitsIn(w: WorldState, prov: number, country: number): Unit[] {
  return w.units.filter((u) => u.owner === country && !u.destroyed && u.loc === prov && u.path.length === 0);
}

function atWarFast(w: WorldState, a: number, b: number): boolean {
  for (const war of w.wars) {
    if (war.status === 'ended') continue;
    if ((war.aggressor === a && war.defender === b) || (war.aggressor === b && war.defender === a)) return true;
  }
  return false;
}

function aggregateFrontRatio(w: WorldState, front: { owner: number; enemy: number }): number {
  let localPower = 0;
  let defPower = 0;
  for (const u of w.units) {
    if (u.destroyed) continue;
    const eff = w.runtime.supplyEff[u.loc];
    const factors = unitPowerFactorsPure(u, w.prov.terrain[u.loc], eff, u.owner === front.owner ? 'attack' : 'defend');
    const p = factors.reduce((acc, x) => acc * x.value, 1);
    if (u.owner === front.owner && w.prov.controller[u.loc] === front.owner) localPower += p;
    if (u.owner === front.enemy && w.prov.controller[u.loc] === front.enemy) defPower += p;
  }
  return localPower / Math.max(1, defPower);
}

/** AI思考本体（週次・国家単位）。すべての行動はコマンド発行のみ。 */
export function aiThink(w: WorldState, c: number): void {
  const rng = deriveStream(w.seed, 'ai', c + ':' + String(w.tick));
  const noise = [1.0, 0.5, 0.15][w.difficulty];
  const nameOf = (x: number) => w.countries.nameJa[x] || w.countries.nameEn[x];
  const provName = (p: number) => w.prov.nameJa[p] || w.prov.nameEn[p];

  // ── 講和判断 ──
  for (const war of warsOf(w, c)) {
    if (war.status !== 'active') continue;
    const score = warScoreFor(w, war, c);
    const options = ['continue', 'proposePeace'];
    const scores = [0, score < -15 && w.tick - war.startTick > 60 ? 1 : -1];
    if (scores[1] > 0) {
      log(w, c, 'peace', options, scores, 'proposePeace', 'warScore=' + score);
      aiCmd(w, 'ai:' + c, 'proposePeace', { warId: war.id });
    } else {
      log(w, c, 'peace', options, scores, 'continue', 'warScore=' + score);
    }
  }

  // ── 宣戦判断（CB＝領有主張が対象国領土にある場合のみ候補）──
  if (!hasActiveWar(w, c)) {
    const myDivs = unitsOf(w, c).length;
    const candidates: { target: number; score: number }[] = [];
    const seen = new Set<number>();
    for (const cl of w.claims) {
      if (cl.country !== c) continue;
      const owner = w.prov.owner[cl.province];
      if (owner === c || owner < 0 || seen.has(owner)) continue;
      if (!w.countries.alive[owner]) continue;
      // 不可侵条約・同盟国はAI宣戦候補から除外（phase4-diplomacy-treaties）
      if (activeTreatyBetween(w, c, owner, 'nonaggression')) continue;
      if (isAllied(w, c, owner)) continue;
      seen.add(owner);
      const theirDivs = unitsOf(w, owner).length;
      const rel = getRelationValue(w, c, owner);
      let score = (myDivs - 1.3 * theirDivs) / Math.max(1, theirDivs);
      if (rel < -30) score += 0.5;
      score += (rng.nextFloat() - 0.5) * noise;
      candidates.push({ target: owner, score });
    }
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    const options = candidates.map((x) => 'declareWar:' + nameOf(x.target)).concat(['peace']);
    const scores = candidates.map((x) => x.score).concat([0]);
    if (best && best.score > 0.8 && rng.nextFloat() < 0.3) {
      log(w, c, 'war', options, scores, 'declareWar:' + nameOf(best.target), 'utility=' + best.score.toFixed(2));
      aiCmd(w, 'ai:' + c, 'declareWar', { defender: best.target });
    } else {
      log(w, c, 'war', options, scores, 'peace', 'utility不足');
    }
  }

  // ── 軍事AI（phase2-fronts-logistics: 戦線経由へ移行）──
  const myUnits = unitsOf(w, c);
  const enemies: number[] = [];
  for (let e = 0; e < w.countries.count; e++) {
    if (e !== c && w.countries.alive[e] && atWarFast(w, c, e)) enemies.push(e);
  }
  if (enemies.length > 0) {
    // 敵ごとに戦線を1本作成（未作成時）
    for (const enemy of enemies) {
      const existing = w.fronts.find((f) => f.owner === c && f.enemy === enemy);
      if (!existing) {
        aiCmd(w, 'ai:' + c, 'createFront', { enemy });
        log(w, c, 'front-create', ['createFront', 'none'], [1, 0], 'createFront', '交戦国 ' + nameOf(enemy));
      }
    }
    // 遊休師団を戦線へ割当
    const assigned = new Set(myUnits.filter((u) => u.frontId >= 0).map((u) => u.frontId));
    for (const u of myUnits) {
      if (u.frontId >= 0 || u.path.length > 0 || u.encircled) continue;
      const enemy = enemies.find((e) => w.fronts.some((f) => f.owner === c && f.enemy === e));
      const front = w.fronts.find((f) => f.owner === c && enemy !== undefined && f.enemy === enemy);
      if (front) {
        aiCmd(w, 'ai:' + c, 'assignToFront', { units: [u.id], frontId: front.id });
        log(w, c, 'front-assign', ['assign', 'hold'], [1, 0], 'assign', 'front#' + front.id);
      }
    }
    void assigned;
    // スタンス判断（国全体の攻勢可否）
    const front = w.fronts.find((f) => f.owner === c);
    if (front) {
      const ratio = aggregateFrontRatio(w, front);
      const threshold = [1.6, 1.3, 1.1][w.difficulty] + (rng.nextFloat() - 0.5) * noise * 0.3;
      const options = ['hold', 'counterattack', 'attack'];
      const scores = [0, 0.5, ratio];
      if (ratio > threshold) {
        aiCmd(w, 'ai:' + c, 'setFrontStance', { frontId: front.id, stance: 'attack', cap: 3 });
        log(w, c, 'front-stance', options, scores, 'attack', 'ratio=' + ratio.toFixed(2));
      } else {
        // Defend while weak, but prepare a limited counteroffensive if our
        // own provinces are under enemy control. Never turn the entire front
        // into a blind full attack while reorganizing.
        const lostLand=w.prov.owner.some((owner,p)=>owner===c&&w.prov.controller[p]===front.enemy);
        aiCmd(w, 'ai:' + c, 'setFrontStance', { frontId: front.id, stance: lostLand?'counterattack':'hold', cap: lostLand?2:0 });
        log(w, c, 'front-stance', options, scores, lostLand?'counterattack':'hold', 'ratio=' + ratio.toFixed(2));
      }
    }
  } else {
    // 平時: 敵対国（関係<-30）との国境に駐屯を1部隊ずつ（週3命令まで）
    let orders = 0;
    for (let p = 0; p < w.prov.count && orders < 3; p++) {
      if (w.prov.controller[p] !== c) continue;
      let hostile = false;
      for (let i = w.adj.offsets[p]; i < w.adj.offsets[p + 1]; i++) {
        const o = w.prov.owner[w.adj.targets[i]];
        if (o !== c && o >= 0 && getRelationValue(w, c, o) < -30) hostile = true;
      }
      if (!hostile) continue;
      if (unitsIn(w, p, c).length >= 1) continue;
      const idle = myUnits.filter((u) => u.path.length === 0 && !u.encircled)[0];
      if (!idle) break;
      const path = findPath(w, idle.loc, p, c);
      if (path) {
        aiCmd(w, 'ai:' + c, 'moveUnits', { units: [idle.id], target: p });
        idle.path = [-1];
        orders++;
        log(w, c, 'military-garrison', ['hold', 'garrison:' + provName(p)], [0, 1], 'garrison', '敵対国境');
      }
    }
  }

  // ── 経済AI: 生産配分（phase2-equipment-production）──
  const artLow = w.countries.artEquipmentStock[c] < 400;
  const share = w.productionShare[c] ?? 0.2;
  if (artLow && share < 0.4) {
    aiCmd(w, 'ai:' + c, 'setProductionShare', { share: 0.4 });
    log(w, c, 'economy', ['share:' + share, 'share:0.4'], [0, 1], 'share:0.4', '火砲不足→配分引き上げ');
  } else if (!artLow && w.countries.artEquipmentStock[c] > 2000 && share > 0.2) {
    aiCmd(w, 'ai:' + c, 'setProductionShare', { share: 0.2 });
    log(w, c, 'economy', ['share:' + share, 'share:0.2'], [0, 1], 'share:0.2', '火砲過剰→配分低下');
  } else {
    log(w, c, 'economy', ['produce'], [1], 'produce', '生産継続 share=' + share.toFixed(2));
  }

  // ── 外交AI: 条約提案（phase4-diplomacy-treaties）。平時のみ・1国あたり週1提案まで ──
  if (!hasActiveWar(w, c)) {
    const rel = (o: number) => getRelationValue(w, c, o);
    const candidates: { target: number; type: TreatyType; score: number }[] = [];
    for (let o = 0; o < w.countries.count; o++) {
      if (o === c || !w.countries.alive[o] || atWarFast(w, c, o)) continue;
      if (activeTreatyBetween(w, c, o, 'nonaggression') || isAllied(w, c, o)) continue;
      if (activeTreatyBetween(w, c, o, 'trade')) continue;
      const r = rel(o);
      // 不可侵/貿易は関係>40、同盟は関係>60かつ共通の脅威（いずれかが戦争中でない前提のため関係のみ）
      if (r > 60 && !activeTreatyBetween(w, c, o, 'access')) {
        candidates.push({ target: o, type: 'access', score: r });
      }
      if (r > 50) candidates.push({ target: o, type: 'trade', score: r + 5 });
      if (r > 40) candidates.push({ target: o, type: 'nonaggression', score: r });
    }
    candidates.sort((x, y) => y.score - x.score || x.target - y.target || (x.type < y.type ? -1 : 1));
    const best = candidates[0];
    const options = candidates.slice(0, 3).map((x) => x.type + ':' + nameOf(x.target)).concat(['none']);
    const scores = candidates.slice(0, 3).map((x) => x.score / 100).concat([0]);
    if (best && rng.nextFloat() < 0.5) {
      aiCmd(w, 'ai:' + c, 'proposeTreaty', { target: best.target, type: best.type });
      log(w, c, 'diplomacy', options, scores, best.type + ':' + nameOf(best.target),
        'relation=' + rel(best.target) + '（条約網の構築・受諾判断は相手国のログ参照）');
    } else {
      log(w, c, 'diplomacy', options, scores, 'none', '関係値不足または判断保留');
    }
  }

}

let packTechOrder: TechDef[] = [];

function refreshTechOrder(): void {
  const defs = techDefs();
  if (packTechOrder.length !== defs.length) packTechOrder = defs.slice();
}

export function registerAISystem(): void {
  registerSystem({
    name: 'ai',
    cadence: 'daily',
    fn: (w) => {
      refreshTechOrder();
      // 週内分散: 国家cは tick ≡ (offset − c) (mod 7) のtickに思考する
      const off = weeklyOffset('ai');
      for (let c = 0; c < w.countries.count; c++) {
        if (c === w.playerCountry) continue;
        if (!w.countries.alive[c]) continue;
        if (((w.tick + c) % 7) !== off) continue;
        aiThink(w, c);
      }
    },
  });
}
