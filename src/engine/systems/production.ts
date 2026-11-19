// 生産システム v2（phase2-equipment-production）— 2財（歩兵装備・火砲）の生産ライン。
// 財市場・価格はPhase 3（economy-system）。配分率 artShare ∈ [0, 0.5]。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { techMods } from './research';
import { lawOutputFactor } from './politics';

export const EQUIPMENT_PER_FACTORY_DAY = 2; // 歩兵装備（配分1.0時）
export const ART_PER_FACTORY_DAY = 1.2; // 火砲（配分1.0時）
export const MANPOWER_RATE_MONTHLY = 0.0005; // 人口×0.05%/月
export const MAX_ART_SHARE = 0.5;

export function aiEquipmentBonus(w: WorldState, country: number): number {
  if (country === w.playerCountry) return 0;
  if (w.difficulty === 2) return 0.10;
  if (w.difficulty === 1) return 0.05;
  return 0;
}

export function registerProductionSystem(): void {
  registerSystem({
    name: 'production',
    cadence: 'daily',
    fn: (w) => {
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        const bonus = aiEquipmentBonus(w, c);
        const share = w.productionShare[c] ?? 0.2;
        // 経済法×技術効果（phase3: 一元参照・D-039/D-044）
        const lawTech = lawOutputFactor(w, c) * (1 + techMods(w, c, 'factoryOutput'));
        w.countries.infEquipmentStock[c] += w.countries.milFactories[c] * (1 - share) * EQUIPMENT_PER_FACTORY_DAY * (1 + bonus) * lawTech;
        w.countries.artEquipmentStock[c] += w.countries.milFactories[c] * share * ART_PER_FACTORY_DAY * (1 + bonus) * lawTech;
        w.countries.manpowerPool[c] += (w.countries.population[c] * MANPOWER_RATE_MONTHLY) / w.daysPerMonth;
      }
    },
  });
}
