import type { UiUnit } from '../ui';

export function summarizeDivisions(units: readonly UiUnit[]) {
  const sum = { count: units.length, manpower: 0, maxManpower: 0, infantry: 0, maxInfantry: 0, artillery: 0, maxArtillery: 0, org: 0, supply: 0, supplyLow: 0 };
  for (const u of units) {
    sum.manpower += u.manpower; sum.maxManpower += u.maxManpower;
    sum.infantry += u.infEquipment; sum.maxInfantry += u.maxInfEquipment;
    sum.artillery += u.artEquipment; sum.maxArtillery += u.maxArtEquipment;
    sum.org += u.org; sum.supply += u.supply;
    if (u.supply < 0.5) sum.supplyLow++;
  }
  return { ...sum, org: units.length ? sum.org / units.length : null, supply: units.length ? sum.supply / units.length : null };
}

