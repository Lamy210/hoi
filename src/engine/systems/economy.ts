// 経済システム（phase3-market-economy + phase3-population-laborの生活水準部分）。
// 4財国家市場（価格月末更新）・国家予算（税収/支出/国庫）・月次GDP・生活水準。
// 資金保存則（INV-2）: 世界の資金 = Σ treasury + householdPool。全収支は資金移転。
import { clamp } from '../core/num';
import { addAlert, type WorldState } from '../core/state';
import { registerSystem, weeklyOffset } from '../core/scheduler';
import { EQUIPMENT_PER_FACTORY_DAY } from './production';
import { techMods } from './research';
import { lawLivingBonus } from './politics';
import { activeWarBetween } from '../core/state';
import { activeTreatyBetween } from '../diplomacy/treaties';

export const GOODS = ['infEquipment', 'artEquipment', 'food', 'consumer'] as const;
export const BASE_PRICES = [1.0, 5.0, 0.5, 1.0];
export const FOOD_DEMAND_PER_POP = 0.01;
export const FOOD_SUPPLY_PER_POP = 0.011;
export const CONSUMER_DEMAND_PER_POP = 0.002;
export const CONSUMER_SUPPLY_PER_POP = 0.0022;
export const TAX_INCOME_PER_POP = 0.002; // pop×taxRate×0.002/日
export const PUBLIC_WAGE_PER_POP = 0.0003; // 公共賃金（国庫→家計）/日
export const CONSUMPTION_PER_POP = 0.0001; // 消費支出（家計→国庫）/日
export const UNIT_UPKEEP_DAY = 2; // 師団維持費/日
export const FACTORY_UPKEEP_DAY = 0.5; // 軍需工場維持費/日
export const LITERACY_RATE = 0.0001; // 教育配分1.0で+0.0001/日

/** 支配州のみの人口（占領州は産出・税収に寄与しない） */
export function controlledPopulation(w: WorldState, c: number): number {
  let total = 0;
  for (let p = 0; p < w.prov.count; p++) {
    if (w.prov.controller[p] === c) total += w.prov.population[p];
  }
  return total;
}

/** 日次の収支（税収・軍事維持）と財需給。生活水準・失業率・識字率を更新する */
export function tickEconomyDaily(w: WorldState): void {
  for (let c = 0; c < w.countries.count; c++) {
    if (!w.countries.alive[c]) continue;
    const pop = controlledPopulation(w, c);
    // 公共賃金（国庫→家計の資金移転・国庫残高で上限）
    const wage = Math.min(pop * PUBLIC_WAGE_PER_POP, Math.max(0, w.treasury[c]));
    w.treasury[c] -= wage;
    w.householdPool += wage;
    // 税収（家計→国庫の資金移転・家計残高で上限=家計は非負を保つ）
    const tax = Math.min(pop * w.taxRate[c] * TAX_INCOME_PER_POP, Math.max(0, w.householdPool));
    w.householdPool -= tax;
    w.treasury[c] += tax;
    // 消費支出（家計→国庫）
    const consumption = Math.min(pop * CONSUMPTION_PER_POP, Math.max(0, w.householdPool - 0));
    w.householdPool -= consumption;
    w.treasury[c] += consumption;
    // 軍事維持（国庫→家計）。国庫不足で50%縮退
    const upkeep = w.units.filter((u) => u.owner === c && !u.destroyed).length * UNIT_UPKEEP_DAY
      + w.countries.milFactories[c] * FACTORY_UPKEEP_DAY;
    const actual = Math.min(upkeep, w.treasury[c]);
    w.treasury[c] -= actual;
    w.householdPool += actual;
    const upkeepPenalty = actual < upkeep * 0.999 ? 0.5 : 1.0;
    // 財需給（国家市場）
    const foodSupply = pop * FOOD_SUPPLY_PER_POP;
    const foodDemand = pop * FOOD_DEMAND_PER_POP;
    const consumerSupply = pop * CONSUMER_SUPPLY_PER_POP * (0.9 + w.laws[c].economy * 0.1);
    const consumerDemand = pop * CONSUMER_DEMAND_PER_POP;
    w.foodStock[c] = Math.max(0, w.foodStock[c] + foodSupply - foodDemand);
    w.consumerStock[c] = Math.max(0, w.consumerStock[c] + consumerSupply - consumerDemand);
    // 生活水準（contributors: GDP/人口・消費財・税負担・戦争）
    const gdpCap = w.countries.population[c] > 0 ? w.gdp[c] / w.countries.population[c] : 0;
    const consumerFactor = w.consumerStock[c] > 0 ? 0.1 : -0.1;
    const warFactor = w.wars.some((war) => war.status !== 'ended' && (war.aggressor === c || war.defender === c)) ? 0.05 : 0;
    const raw = 0.4 + Math.min(0.3, gdpCap * 0.4) + consumerFactor - w.taxRate[c] * 0.2 - warFactor
      + techMods(w, c, 'living') + lawLivingBonus(w, c) - (upkeepPenalty < 1 ? 0.05 : 0);
    w.livingStandard[c] = clamp(raw, 0, 1);
    // 失業率（労働人口=pop×0.55、雇用=サービス基礎雇用(workforce×0.9)＋軍需工場×10,000＋建設ペイロール）
    const workforce = pop * 0.55;
    const employed = workforce * 0.9 + w.countries.milFactories[c] * 10000
      + w.constructionQueue.filter((pr) => pr.country === c && !pr.paused).length * 5000;
    w.unemployment[c] = workforce > 0 ? clamp(1 - employed / workforce, 0, 1) : 0;
    // 識字率（教育配分）
    w.literacy[c] = Math.min(0.99, w.literacy[c] + w.budgetEdu[c] * LITERACY_RATE);
  }
}

/** 月末の価格更新: price = clamp(base×(demand/supply)^0.5×平滑, 0.25×base, 4×base) */
export function updatePrices(w: WorldState): void {
  for (let g = 0; g < 4; g++) {
    for (let c = 0; c < w.countries.count; c++) {
      if (!w.countries.alive[c]) continue;
      const pop = controlledPopulation(w, c);
      let demand = 0;
      let supply = 0;
      if (g === 2) {
        demand = pop * FOOD_DEMAND_PER_POP;
        supply = pop * FOOD_SUPPLY_PER_POP;
      } else if (g === 3) {
        demand = pop * CONSUMER_DEMAND_PER_POP;
        supply = pop * CONSUMER_SUPPLY_PER_POP * (0.9 + w.laws[c].economy * 0.1);
      } else if (g === 0) {
        demand = w.units.filter((u) => u.owner === c && !u.destroyed).length * 25;
        supply = w.countries.milFactories[c] * (1 - w.productionShare[c]) * EQUIPMENT_PER_FACTORY_DAY;
      } else {
        demand = w.units.filter((u) => u.owner === c && !u.destroyed).length * 5;
        supply = w.countries.milFactories[c] * w.productionShare[c] * 1.2;
      }
      const ratio = demand > 0 && supply > 0 ? Math.sqrt(demand / supply) : 1;
      w.prices[g][c] = clamp(BASE_PRICES[g] * ratio * 0.5 + w.prices[g][c] * 0.5, BASE_PRICES[g] * 0.25, BASE_PRICES[g] * 4);
    }
  }
}

/** 月次の国際貿易: 余剰国→不足国へ価格差マッチング（戦争国間は遮断）。資金移転でINV-2を維持 */
export function tickTrade(w: WorldState): void {
  for (let g = 0; g < 4; g++) {
    const surplus: { c: number; amount: number }[] = [];
    const deficit: { c: number; amount: number }[] = [];
    for (let c = 0; c < w.countries.count; c++) {
      if (!w.countries.alive[c]) continue;
      if (g === 2) {
        const pop = controlledPopulation(w, c);
        const net = w.foodStock[c] - pop * FOOD_DEMAND_PER_POP * 10;
        if (net > 0) surplus.push({ c, amount: net * 0.3 });
        else if (net < 0) deficit.push({ c, amount: -net * 0.3 });
      } else if (g === 3) {
        const net = w.consumerStock[c] - controlledPopulation(w, c) * CONSUMER_DEMAND_PER_POP * 10;
        if (net > 0) surplus.push({ c, amount: net * 0.3 });
        else if (net < 0) deficit.push({ c, amount: -net * 0.3 });
      }
      // 装備財は市場在庫を直接参照（国庫ストックの10%超を余剰とみなす）
      else if (g === 0) {
        const excess = w.countries.infEquipmentStock[c] - w.units.filter((u) => u.owner === c && !u.destroyed).length * 1000;
        if (excess > 500) surplus.push({ c, amount: excess * 0.2 });
      } else {
        const excess = w.countries.artEquipmentStock[c] - w.units.filter((u) => u.owner === c && !u.destroyed).length * 200;
        if (excess > 200) surplus.push({ c, amount: excess * 0.2 });
      }
    }
    // 不足国は価格の高い順、余剰国は安い順（決定論）
    deficit.sort((a, b) => w.prices[g][b.c] - w.prices[g][a.c] || a.c - b.c);
    surplus.sort((a, b) => w.prices[g][a.c] - w.prices[g][b.c] || a.c - b.c);
    for (const d of deficit) {
      for (const s of surplus) {
        if (s.amount <= 0 || d.amount <= 0) continue;
        if (s.c === d.c) continue;
        if (activeWarBetween(w, s.c, d.c)) continue; // 戦争国間は自動遮断
        // 貿易協定（phase4-diplomacy-treaties）: 条約ペア間は取引量1.5倍
        const treatyMult = activeTreatyBetween(w, s.c, d.c, 'trade') ? 1.5 : 1;
        const amount = Math.min(s.amount * treatyMult, d.amount * treatyMult);
        const price = (w.prices[g][s.c] + w.prices[g][d.c]) / 2;
        const value = amount * price;
        // 資金移転（INV-2）: 買い手の国庫→売り手の国庫
        const paid = Math.min(value, w.treasury[d.c]);
        if (paid < value * 0.5) continue; // 資金不足で取引縮退
        s.amount -= amount / treatyMult;
        d.amount -= amount / treatyMult;
        w.treasury[d.c] -= paid;
        w.treasury[s.c] += paid;
        if (g === 0) {
          w.countries.infEquipmentStock[s.c] -= amount;
          w.countries.infEquipmentStock[d.c] += amount;
        } else if (g === 1) {
          w.countries.artEquipmentStock[s.c] -= amount;
          w.countries.artEquipmentStock[d.c] += amount;
        } else if (g === 2) {
          w.foodStock[s.c] -= amount;
          w.foodStock[d.c] += amount;
        } else {
          w.consumerStock[s.c] -= amount;
          w.consumerStock[d.c] += amount;
        }
      }
    }
  }
}

/** 月末GDP: 建物付加価値＋建設＋サービス（占領州は除外） */
export function computeGDP(w: WorldState): void {
  for (let c = 0; c < w.countries.count; c++) {
    if (!w.countries.alive[c]) continue;
    const controlled = controlledPopulation(w, c);
    const share = w.countries.population[c] > 0 ? controlled / w.countries.population[c] : 0;
    const industry = w.countries.milFactories[c] * share * 30 * EQUIPMENT_PER_FACTORY_DAY * 0.3;
    const construction = w.constructionQueue.filter((pr) => pr.country === c && !pr.paused).length * 5000 * 30 / 60;
    const service = controlled * 0.001 * 30;
    const lawFactor = [0.9, 1.0, 1.1][w.laws[c].economy];
    w.gdp[c] = Math.round((industry + construction + service) * lawFactor * (1 + techMods(w, c, 'factoryOutput')));
  }
}

export function registerEconomySystems(): void {
  registerSystem({
    name: 'economy',
    cadence: 'daily',
    fn: (w) => {
      tickEconomyDaily(w);
      // 月末: 価格更新→貿易→GDP（daysPerMonth周期・tick位相で決定論）
      if ((w.tick % w.daysPerMonth) === monthlyPhase(w, 'economy')) {
        updatePrices(w);
        tickTrade(w);
        computeGDP(w);
      }
    },
  });
}

/** 月次処理の位相（国IDで週内分散するaiとは異なり、月末を tick≡daysPerMonth-1 に統一） */
function monthlyPhase(w: WorldState, _key: string): number {
  void _key;
  return w.daysPerMonth - 1;
}

// 週次オフセットの参照維持（logistics分割と同様の将来拡張用）
void weeklyOffset;
void addAlert;
