// 5軸スコア（docs/02 §4）: 軍事力・経済規模・外交的影響力・技術水準・国民生活水準。
// 毎月末に算出し、履歴として保存（グラフ表示・トレース用）。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { unitPowerFactorsPure } from './combat';
import { getRelationValue } from '../military/war';
import { researchPointsPerDay } from './research';
import { TREATY_SCORE_BONUS } from '../diplomacy/treaties';

export function computeScores(w: WorldState, c: number): { military: number; economy: number; diplomacy: number; technology: number; living: number } {
  let military = 0;
  for (const u of w.units) {
    if (u.destroyed || u.owner !== c) continue;
    military += unitPowerFactorsPure(u, w.prov.terrain[u.loc], w.runtime.supplyEff[u.loc], 'defend')
      .reduce((acc, x) => acc * x.value, 1);
  }
  military += (w.countries.infEquipmentStock[c] + w.countries.artEquipmentStock[c]) / 1000;
  const economy = w.gdp[c];
  // 外交的影響力（phase4-diplomacy-treaties: 条約網を加算）
  let relSum = 0;
  let relCount = 0;
  for (let o = 0; o < w.countries.count; o++) {
    if (o === c || !w.countries.alive[o]) continue;
    relSum += getRelationValue(w, c, o);
    relCount++;
  }
  let treatyBonus = 0;
  for (const t of w.treaties) {
    if (t.status !== 'active') continue;
    if (t.a === c || t.b === c) treatyBonus += TREATY_SCORE_BONUS[t.type];
  }
  const diplomacy = relCount > 0 ? relSum / relCount + 50 + treatyBonus : 50 + treatyBonus;
  const technology = w.research[c].done.length * 10 + researchPointsPerDay(w, c);
  const living = w.livingStandard[c] * 100 * w.literacy[c] * (1 - w.unemployment[c]);
  return { military, economy, diplomacy, technology, living };
}

export function registerScoreSystem(): void {
  registerSystem({
    name: 'score',
    cadence: 'daily',
    fn: (w) => {
      if ((w.tick % w.daysPerMonth) !== w.daysPerMonth - 1) return;
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        const axes = computeScores(w, c);
        const arr = (w.scoreHistory[c] ||= []);
        arr.push({ tick: w.tick, ...axes });
        if (arr.length > 720) arr.shift(); // 60年分
      }
    },
  });
}
