// 生産システム v3 — 旧二財配分率または明示的に有効化したモデル別ラインで実生産。
// 型番別倉庫・師団型番別配備は未実装。生成物は二財の実在庫へ集約。
// 財市場・価格はPhase 3（economy-system）。配分率 artShare ∈ [0, 0.5]。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { techMods } from './research';
import { lawOutputFactor } from './politics';
import { equipmentModels } from '../military/equipmentCatalog';
import { allocateProductionLines, efficiencyAfterDay, modelDailyOutput, type AllocatedLine } from './equipmentLinePlanner';
import { countryProductionLines, modelUnlocked } from './productionLineState';
import { recordModelProduction } from './modelProductionLedger';

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

export interface ProductionLineEstimate extends AllocatedLine {
  /** When the country is in legacy mode this is only a hypothetical output. */
  category: 'infantry'|'artillery'|null;
  unlocked: boolean;
  estimatedDailyOutput: number;
}

/** Side-effect-free per-line forecast. Uses the same formula as live production. */
export function forecastProductionLines(w:WorldState,c:number): ProductionLineEstimate[] {
  const catalog=new Map(equipmentModels().map(m=>[m.id,m]));
  const lines=allocateProductionLines(countryProductionLines(w,c),
    w.countries.alive[c] ? w.countries.milFactories[c] : 0).lines;
  const multiplier=w.countries.alive[c]
    ? (1+aiEquipmentBonus(w,c))*lawOutputFactor(w,c)*(1+techMods(w,c,'factoryOutput'))
    : 0;
  return lines.map(line=>{
    const model=catalog.get(line.modelId);
    const unlocked=!!model&&modelUnlocked(w,c,model);
    return {...line,category:model?.category??null,unlocked,
      estimatedDailyOutput:model&&unlocked?modelDailyOutput(line,model,multiplier):0};
  });
}

export function dailyEquipmentOutput(w: WorldState, c: number): { infantry: number; artillery: number } {
  if(!w.countries.alive[c])return {infantry:0,artillery:0};
  if(w.productionMode[c]==='lines'){
    let infantry=0,artillery=0;
    for(const line of forecastProductionLines(w,c)){
      if(line.category==='infantry')infantry+=line.estimatedDailyOutput;
      if(line.category==='artillery')artillery+=line.estimatedDailyOutput;
    }
    return {infantry,artillery};
  }
  const share = w.productionShare[c] ?? 0.2;
  const bonus = aiEquipmentBonus(w, c);
  const lawTech = lawOutputFactor(w, c) * (1 + techMods(w, c, 'factoryOutput'));
  const factories = w.countries.milFactories[c];
  return { infantry: factories * (1 - share) * EQUIPMENT_PER_FACTORY_DAY * (1 + bonus) * lawTech,
    artillery: factories * share * ART_PER_FACTORY_DAY * (1 + bonus) * lawTech };
}

export function registerProductionSystem(): void {
  registerSystem({
    name: 'production',
    cadence: 'daily',
    fn: (w) => {
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        const lines=w.productionMode[c]==='lines' ? forecastProductionLines(w,c) : null;
        // Sum in the original line order, same as the public dailyEquipmentOutput().
        const output=lines ? lines.reduce((tot,line)=>{
          if(line.category==='infantry')tot.infantry+=line.estimatedDailyOutput;
          else if(line.category==='artillery')tot.artillery+=line.estimatedDailyOutput;
          return tot;
        },{infantry:0,artillery:0}) : dailyEquipmentOutput(w,c);
        w.countries.infEquipmentStock[c] += output.infantry;
        w.countries.artEquipmentStock[c] += output.artillery;
        if(lines){
          // Ledger is cumulative production history, not a second warehouse.
          // Legacy, trade, training, losses and refunds never credit it.
          recordModelProduction(w,c,lines);
          for(const allocated of lines){
            if(allocated.allocatedFactories===0||!allocated.unlocked)continue;
            const original=w.productionLines.find(l=>l.id===allocated.id)!;
            original.efficiency=efficiencyAfterDay(original.efficiency,allocated.allocatedFactories);
          }
        }
        w.countries.manpowerPool[c] += (w.countries.population[c] * MANPOWER_RATE_MONTHLY) / w.daysPerMonth;
      }
    },
  });
}
