// 戦線AI（phase2-fronts-logistics）— 週次でプレイヤー戦線とAI戦線に同一ロジックを適用する。
// 命令はコマンド経由（INV-3）。移動中（path>0）・包囲中の師団には触れない＝明示命令優先。
import { deriveStream } from '../core/rng';
import { atWar, effectiveSupply, type Front, type Unit, type WorldState } from '../core/state';
import { registerSystem, weeklyOffset } from '../core/scheduler';
import { findPath } from './movement';
import { TERRAIN_DATA, unitPowerFactorsPure } from './combat';
import { aiCmd } from '../commands';

function log(w: WorldState, country: number, module: string, options: string[], scores: number[], chosen: string, reason: string): void {
  const arr = (w.runtime.decisionLog[String(country)] ||= []);
  arr.push({ tick: w.tick, module, options, scores: scores.map((s) => Math.round(s * 1000) / 1000), chosen, reason });
  if (arr.length > 100) arr.shift();
}

function cmd(w: WorldState, front: Front, type: string, p: Record<string, unknown>): void {
  // プレイヤー戦線の命令は専用issuer 'frontai'（手動コマンドのuidと衝突しない・INV-6）
  if (type !== 'moveUnits') return;
  const unitId = (p.units as number[])[0];
  if (w.runtime.commandsSinceLastTick.some(c => c.type === 'frontMove' && c.p.unitId === unitId)) return;
  aiCmd(w, front.owner === w.playerCountry ? 'frontai' : 'ai:' + front.owner, 'frontMove', { unitId, target: p.target, frontId: front.id, revision: front.revision ?? 1 });
}

function unitExpectedPower(w: WorldState, u: Unit, provIdx: number, side: 'attack' | 'defend'): number {
  const eff = effectiveSupply(w, u);
  const factors = unitPowerFactorsPure(u, w.prov.terrain[provIdx], eff, side);
  return factors.reduce((acc, c) => acc * c.value, 1);
}

function unitsOfFront(w: WorldState, front: Front): Unit[] {
  return w.units.filter((u) => !u.destroyed && u.owner === front.owner && u.frontId === front.id);
}

/** 戦線1本の週次命令（D-022: プレイヤー/AI共通ロジック） */
export function runFront(w: WorldState, front: Front, rng: () => number): void {
  if (front.paused || !atWar(w, front.owner, front.enemy)) return;
  const units = unitsOfFront(w, front);
  const movable = units.filter((u) => u.path.length === 0 && !u.encircled && !u.manualHold && !w.runtime.activeBattles.has(u.loc));
  const provName = (p: number) => w.prov.nameJa[p] || w.prov.nameEn[p];

  if (front.stance === 'retreat') {
    // 自国深部（最も補給効率の高い隣接自領）へ後退
    let orders = 0;
    for (const u of movable) {
      if (orders >= 4) break;
      let best = -1;
      let bestEff = effectiveSupply(w, u);
      for (let i = w.adj.offsets[u.loc]; i < w.adj.offsets[u.loc + 1]; i++) {
        const v = w.adj.targets[i];
        if (w.prov.controller[v] !== front.owner) continue;
        const eff = w.runtime.supplyEff[v];
        if (eff > bestEff + 0.05) {
          bestEff = eff;
          best = v;
        }
      }
      if (best >= 0) {
        const path = findPath(w, u.loc, best, front.owner, false);
        if (path) {
          cmd(w, front, 'moveUnits', { units: [u.id], target: best });
          orders++;
          log(w, front.owner, 'front-retreat', ['hold', 'retreat:' + provName(best)], [0, bestEff], 'retreat', '戦線スタンス=撤退');
        }
      }
    }
    return;
  }

  if (front.stance === 'hold') {
    // 前線州の穴埋めのみ（攻撃しない）。週4命令まで
    let orders = 0;
    for (const fp of front.provinces) {
      if (orders >= 4) break;
      if (w.prov.controller[fp] !== front.owner) continue;
      const present = units.filter((u) => u.loc === fp && !u.destroyed).length;
      if (present >= 1) continue;
      const spare = movable
        .filter((u) => u.loc !== fp && front.provinces.includes(u.loc))
        .sort((a, b) => a.id - b.id)[0];
      if (!spare) continue;
      const path = findPath(w, spare.loc, fp, front.owner, false);
      if (path) {
        cmd(w, front, 'moveUnits', { units: [spare.id], target: fp });
        orders++;
        log(w, front.owner, 'front-hold', ['hold', 'fill:' + provName(fp)], [0, 1], 'fill', '前線駐留なし');
      }
    }
    return;
  }

  // 攻勢: 目標州へ投入上限まで送り込む（局所戦力比の閾値つき）
  if (front.stance === 'attack') {
    // 集結（muster）: 前線州にいない割当師団を最寄りの前線州へ移動（週4命令）
    let musterOrders = 0;
    for (const u of movable) {
      if (musterOrders >= 4) break;
      if (front.provinces.includes(u.loc)) continue;
      // 既に敵州に隣接する位置なら集結不要
      let onFrontline = false;
      for (let i = w.adj.offsets[u.loc]; i < w.adj.offsets[u.loc + 1]; i++) {
        if (w.prov.controller[w.adj.targets[i]] === front.enemy) onFrontline = true;
      }
      if (onFrontline) continue;
      let nearest = -1;
      let nearestD = Infinity;
      for (const fp of front.provinces) {
        if (w.prov.controller[fp] !== front.owner) continue;
        const dx = w.prov.cx[fp] - w.prov.cx[u.loc];
        const dy = w.prov.cy[fp] - w.prov.cy[u.loc];
        const d = dx * dx + dy * dy;
        if (d < nearestD) {
          nearestD = d;
          nearest = fp;
        }
      }
      if (nearest >= 0) {
        const path = findPath(w, u.loc, nearest, front.owner, false);
        if (path) {
          cmd(w, front, 'moveUnits', { units: [u.id], target: nearest });
          musterOrders++;
          log(w, front.owner, 'front-muster', ['hold', 'muster:' + provName(nearest)], [0, 1], 'muster', '前線へ集結');
        }
      }
    }
    const isAi = front.owner !== w.playerCountry;
    const baseThreshold = isAi ? [1.8, 1.4, 1.15][w.difficulty] : 1.0;
    const threshold = baseThreshold + (rng() - 0.5) * 0.2;
    const candidates: { target: number; ratio: number }[] = [];
    const seen = new Set<number>();
    for (const fp of front.provinces) {
      if (w.prov.controller[fp] !== front.owner) continue;
      for (let i = w.adj.offsets[fp]; i < w.adj.offsets[fp + 1]; i++) {
        const ep = w.adj.targets[i];
        const ctrl = w.prov.controller[ep];
        if (ctrl !== front.enemy || seen.has(ep) || w.adj.strait[i] || (front.targets.length && !front.targets.includes(ep))) continue;
        seen.add(ep);
        let localPower = 0;
        const sources: Unit[] = [];
        for (let j = w.adj.offsets[ep]; j < w.adj.offsets[ep + 1]; j++) {
          const v = w.adj.targets[j];
          if (w.prov.controller[v] !== front.owner || w.adj.strait[j]) continue;
          for (const u of unitsOfFront(w, front)) {
            if (u.loc !== v || u.path.length > 0 || u.encircled || u.manualHold || u.org <= 0 || w.runtime.activeBattles.has(u.loc)) continue;
            localPower += unitExpectedPower(w, u, ep, 'attack');
            sources.push(u);
          }
        }
        let defPower = 40;
        for (const u of w.units) {
          if (u.destroyed || u.loc !== ep) continue;
          defPower += unitExpectedPower(w, u, ep, 'defend');
        }
        const t = TERRAIN_DATA[w.prov.terrain[ep]];
        const ratio = localPower / Math.max(1, defPower * t.def);
        candidates.push({ target: ep, ratio });
      }
    }
    candidates.sort((a, b) => b.ratio - a.ratio || a.target - b.target);
    const best = candidates[0];
    const options = candidates.map((x) => 'attack:' + provName(x.target)).concat(['hold']);
    const scores = candidates.map((x) => x.ratio).concat([0]);
    if (front.cap > 0 && best && best.ratio > threshold) {
      // 目標へ移動（投入上限・週4命令まで）
      const movable = unitsOfFront(w, front).filter((u) => u.path.length === 0 && !u.encircled);
      let sent = 0;
      for (const u of movable) {
        if (sent >= front.cap || sent >= 4) break;
        const adjacent = w.adj.targets.slice(w.adj.offsets[u.loc],w.adj.offsets[u.loc+1]).some((p,i)=>p===best.target&&!w.adj.strait[w.adj.offsets[u.loc]+i]);
        if (adjacent && w.prov.controller[u.loc]===front.owner && u.org>0) {
          cmd(w, front, 'moveUnits', { units: [u.id], target: best.target });
          sent++;
        }
      }
      if (sent > 0) {
        log(w, front.owner, 'front-attack', options, scores, 'attack:' + provName(best.target), 'ratio=' + best.ratio.toFixed(2) + '>th=' + threshold.toFixed(2));
      } else {
        log(w, front.owner, 'front-attack', options, scores, 'hold', '移動可能師団なし');
      }
    } else {
      log(w, front.owner, 'front-attack', options, scores, 'hold', 'ratio不足 th=' + threshold.toFixed(2));
    }
  }
}

export function registerFrontSystem(): void {
  registerSystem({
    name: 'fronts',
    cadence: 'daily',
    fn: (w) => {
      // 戦線ごとに週内分散（frontIdでオフストリーム化）
      const off = weeklyOffset('fronts');
      for (const front of w.fronts) {
        if (((w.tick + front.id) % 7) !== off) continue;
        const stream = deriveStream(w.seed, 'fronts', front.id + ':' + String(w.tick));
        runFront(w, front, () => stream.nextFloat());
      }
    },
  });
}
