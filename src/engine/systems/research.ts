// 研究システム（phase3-research-tree）。技術ツリーはパックtechs.json（データ駆動）。
// 研究力 = (GDP/100000＋milFactories×0.02)×(0.5＋識字率×0.5)×(0.6＋安定度×0.4)×教育倍率。
import type { WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { civilFromDays } from '../clock/date';
import type { Pack, TechDef } from '../scenario/types';

export const MAX_ACTIVE_RESEARCH = 2;
export const TECH_MOD_KEYS = ['factoryOutput', 'orgRegen', 'supplyRadius', 'researchRate', 'living', 'infantryAttack', 'infantryDefense', 'artilleryAttack'] as const;
export type TechModKey = (typeof TECH_MOD_KEYS)[number];

let packTechs: TechDef[] = [];

/** パックの技術定義を登録（createEngineで1回・冪等） */
export function setTechDefs(defs: TechDef[]): void {
  packTechs = defs;
}

export function techDefs(): TechDef[] {
  return packTechs;
}

/** 完了技術の修飾子の一元参照点（他システムは参照のみ・spec） */
export function techMods(w: WorldState, country: number, key: TechModKey): number {
  const st = w.research[country];
  if (!st) return 0;
  let total = 0;
  for (const id of st.done) {
    const def = packTechs.find((t) => t.id === id);
    if (def && def.mods[key]) total += def.mods[key];
  }
  return total;
}

/** Research ahead of its historical year is slower, but never blocked. Pure and date-driven. */
export function researchEraPenalty(currentYear: number, techYear?: number): number {
  if (techYear === undefined || techYear <= currentYear) return 1;
  return Math.min(4, 1 + (techYear - currentYear) * 0.35);
}

export function researchPointsPerDay(w: WorldState, c: number): number {
  const base = w.gdp[c] / 100000 + w.countries.milFactories[c] * 0.02;
  const literacy = 0.5 + w.literacy[c] * 0.5;
  const stability = 0.6 + w.stability[c] * 0.4;
  const edu = 0.5 + w.budgetEdu[c]; // 0.5〜1.5倍
  return base * literacy * stability * edu * (1 + techMods(w, c, 'researchRate'));
}

export function registerResearchSystem(): void {
  registerSystem({
    name: 'research',
    cadence: 'daily',
    fn: (w) => {
      const currentYear = civilFromDays(w.epochDays + w.tick).y;
      for (let c = 0; c < w.countries.count; c++) {
        if (!w.countries.alive[c]) continue;
        const st = w.research[c];
        const rp = researchPointsPerDay(w, c);
        for (const act of st.active) {
          const def = packTechs.find((t) => t.id === act.id);
          if (!def) continue;
          act.progress += rp / researchEraPenalty(currentYear, def.year);
          if (act.progress >= def.days) {
            st.done.push(act.id);
          }
        }
        const before = st.active.length;
        st.active = st.active.filter((a) => {
          const def = packTechs.find((t) => t.id === a.id);
          return def ? a.progress < def.days : false;
        });
        if (st.active.length !== before) {
          // 完了: 空いた枠に待機はなし（ユーザー/AIが次を開始）
        }
      }
    },
  });
}

export function extractPackTechs(pack: Pack): TechDef[] {
  return pack.techs ?? [];
}
