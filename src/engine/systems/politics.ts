// 政治システム（phase3-politics-laws）。支持率contributors・安定度・政治力・法律制定手順。
import { clamp } from '../core/num';
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';

export const PP_RECOVERY_DAY = 0.5;
export const LAW_PP_COST = 50;
export const MAX_LAW_PENDING = 1;

/** 法律slot定義（内蔵データ・パック拡張はPhase 4） */
export const LAW_DEFS = {
  conscription: [
    { nameJa: '志願兵制', mobilization: 0.01, stability: 0 },
    { nameJa: '徴兵制', mobilization: 0.02, stability: -0.05 },
    { nameJa: '総動員法', mobilization: 0.05, stability: -0.15 },
  ],
  economy: [
    { nameJa: '計画経済', output: 0.9, living: 0.05 },
    { nameJa: '混合経済', output: 1.0, living: 0 },
    { nameJa: '自由市場', output: 1.1, living: -0.05 },
  ],
} as const;

export function lawOutputFactor(w: WorldState, c: number): number {
  return LAW_DEFS.economy[w.laws[c].economy].output;
}

export function lawLivingBonus(w: WorldState, c: number): number {
  return LAW_DEFS.economy[w.laws[c].economy].living;
}

export function lawStabilityPenalty(w: WorldState, c: number): number {
  return LAW_DEFS.conscription[w.laws[c].conscription].stability;
}

/** 支持率contributors（spec: 生活水準・税負担・戦争・事件を公開） */
export function supportContributors(w: WorldState, c: number): { label: string; value: number }[] {
  const atWar = w.wars.some((war) => war.status !== 'ended' && (war.aggressor === c || war.defender === c));
  return [
    { label: 'base', value: 0.5 },
    { label: 'living', value: (w.livingStandard[c] - 0.5) * 0.6 },
    { label: 'tax', value: -w.taxRate[c] * 0.4 },
    { label: 'war', value: atWar ? -0.1 : 0 },
    { label: 'stability', value: w.stability[c] * 0.2 },
  ];
}

export function computeSupport(w: WorldState, c: number): number {
  return clamp(supportContributors(w, c).reduce((acc, x) => acc + x.value, 0), 0, 1);
}

export function registerPoliticsSystem(): void {
  registerSystem({
    name: 'politics',
    cadence: 'daily',
    fn: (w) => {
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        // 政治力の日次回復
        w.pp[c] += PP_RECOVERY_DAY + w.stability[c] * 0.5;
        // 制定待ちの法律
        const q = w.lawQueue[c];
        if (q && w.tick - q.startTick >= q.enactDays) {
          if (q.slot === 'conscription') w.laws[c].conscription = q.target as 0 | 1 | 2;
          else w.laws[c].economy = q.target as 0 | 1 | 2;
          w.pp[c] -= q.cost;
          w.lawQueue[c] = null;
        }
        // 月次: 支持率・安定度の更新
        if ((w.tick % w.daysPerMonth) === w.daysPerMonth - 1) {
          w.supportRate[c] = computeSupport(w, c);
          const atWar = w.wars.some((war) => war.status !== 'ended' && (war.aggressor === c || war.defender === c));
          w.stability[c] = clamp(0.5 + w.supportRate[c] * 0.5 - (atWar ? 0.1 : 0) + lawStabilityPenalty(w, c), 0, 1);
        }
      }
    },
  });
}
