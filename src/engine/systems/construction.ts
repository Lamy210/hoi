// 建設システム（phase3-construction）。建物レベルの更新は本システム経由のみ（spec）。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';

export const COST_MILFACTORY = 8000;
export const COST_INFRA = 5000;
export const BASE_DAYS = 120;
export const MAX_CONCURRENT = 2;

export function constructionDays(w: WorldState, prov: number): number {
  return Math.round(BASE_DAYS * (1.2 - w.prov.infra[prov] * 0.04));
}

export function registerConstructionSystem(): void {
  registerSystem({
    name: 'construction',
    cadence: 'daily',
    fn: (w) => {
      for (const pr of w.constructionQueue) {
        if (!w.countries.alive[pr.country]) continue;
        // 待機からの再開（資金回復時）— baseline「待機→資金回復で進行再開」
        const perDay = pr.cost / pr.daysTotal;
        if (pr.paused) {
          if (w.treasury[pr.country] >= perDay) pr.paused = false;
          else continue;
        }
        if (w.treasury[pr.country] < perDay) {
          pr.paused = true;
          continue;
        }
        w.treasury[pr.country] -= perDay;
        w.householdPool += perDay; // 建設労働者への賃金（資金移転）
        pr.costPaid += perDay;
        pr.daysProgress += 1;
        if (pr.daysProgress >= pr.daysTotal && pr.costPaid >= pr.cost - 1e-6) {
          // 完了: 一経路のレベル更新
          if (pr.type === 'milFactory') w.countries.milFactories[pr.country] += 1;
          else w.prov.infra[pr.prov] = Math.min(10, w.prov.infra[pr.prov] + 1);
          pr.paused = true;
          pr.daysProgress = pr.daysTotal; // 完了マーク（除去は下で実施）
          pr.costPaid = pr.cost;
        }
      }
      // 完了プロジェクトの除去（決定論: id順）
      const done = w.constructionQueue.filter((pr) => pr.daysProgress >= pr.daysTotal && pr.paused && pr.costPaid >= pr.cost);
      if (done.length > 0) {
        w.constructionQueue = w.constructionQueue.filter((pr) => !done.includes(pr));
      }
    },
  });
}
