// 人口システム（phase3-population-labor）。プロヴィンス集約値のみ（個人エンティティなし）。
// 成長=pop×(0.0001＋(living−0.5)×0.0002−戦争ペナルティ)。徴兵可能人口は本システムの一元計算。
import { clamp } from '../core/num';
import { atWar, type WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';

export const WORKFORCE_RATE = 0.55;
export const MOBILIZATION_RATES = [0.01, 0.02, 0.05]; // 志願/徴兵/総動員

/** 徴兵可能人口の一元計算（military・politicsは参照のみ・spec） */
export function conscriptionPool(w: WorldState, c: number): number {
  let pop = 0;
  for (let p = 0; p < w.prov.count; p++) {
    if (w.prov.owner[p] === c) pop += w.prov.population[p];
  }
  return pop * MOBILIZATION_RATES[w.laws[c].conscription];
}

export function registerPopulationSystem(): void {
  registerSystem({
    name: 'population',
    cadence: 'daily',
    fn: (w) => {
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        const warPenalty = w.wars.some((war) => war.status !== 'ended' && (war.aggressor === c || war.defender === c)) ? 0.0001 : 0;
        const growth = 0.0001 + (w.livingStandard[c] - 0.5) * 0.0002 - warPenalty;
        for (let p = 0; p < w.prov.count; p++) {
          if (w.prov.owner[p] !== c || w.prov.controller[p] !== c) continue; // 占領州は成長0
          w.prov.population[p] *= 1 + growth;
        }
      }
      // 月次: 国の総人口を州合計から再集計（総和整合・INV）＋徴兵プールの反映
      if ((w.tick % w.daysPerMonth) === w.daysPerMonth - 1) {
        for (let c = 0; c < w.countries.count; c++) {
          if (!w.countries.alive[c]) continue;
          let pop = 0;
          for (let p = 0; p < w.prov.count; p++) {
            if (w.prov.owner[p] === c) pop += w.prov.population[p];
          }
          w.countries.population[c] = Math.round(pop);
          // 訓練済み人力プールを徴兵可能人口へ更新（単一計算元）
          w.countries.manpowerPool[c] = Math.min(
            w.countries.manpowerPool[c] + (conscriptionPool(w, c) * 0.001) / w.daysPerMonth,
            conscriptionPool(w, c),
          );
        }
      }
    },
  });
}

// clampの参照維持（将来の成長clamp用）
void clamp;
void atWar;
