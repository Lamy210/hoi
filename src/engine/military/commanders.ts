// 指揮官システム（phase2-equipment-production）。
// 国ごとに決定論生成（架空名・balanced）。戦闘力係数・月次スキル成長・割当コマンドを提供する。
import { deriveStream } from '../core/rng';
import type { Unit, WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';

export const COMMANDERS_PER_COUNTRY = 8;

// 架空の氏名プール（balanced: 実在人物とは無関係）
const SURNAMES_JA = ['神代', '氷室', '早坂', '芹沢', '砂原', '鷹村', '目黒', '栗栖'];
const GIVEN_JA = ['温人', '宗介', '玲司', '柚希', '鉄生', '環', '洸太', '詠'];
const SURNAME_EN = ['Krauss', 'Brenner', 'Okafor', 'Lindqvist', 'Marchetti', 'Hsu', 'Delacroix', 'Vance'];
const GIVEN_EN = ['Aldric', 'Mei', 'Jorah', 'Silke', 'Rurik', 'Anja', 'Tobin', 'Cecil'];

export interface CommanderTraitInfo {
  attack: number;
  defense: number;
  logistics: number;
}

export const TRAIT_INFO: Record<number, string> = { 0: 'trait.attack', 1: 'trait.defense', 2: 'trait.logistics' };

/** ゲーム開始時に全国の指揮官を決定論生成する */
export function generateCommanders(w: WorldState): void {
  for (let c = 0; c < w.countries.count; c++) {
    const rng = deriveStream(w.seed, 'commanders', w.countries.id[c]);
    for (let i = 0; i < COMMANDERS_PER_COUNTRY; i++) {
      const si = rng.nextInt(SURNAMES_JA.length);
      const gi = rng.nextInt(GIVEN_JA.length);
      // スキル: 1-5の重み付き（中央寄り）
      const skillRoll = rng.nextFloat();
      const skill = skillRoll < 0.1 ? 5 : skillRoll < 0.3 ? 4 : skillRoll < 0.7 ? 3 : skillRoll < 0.9 ? 2 : 1;
      const traitRoll = rng.nextFloat();
      const trait: 0 | 1 | 2 = traitRoll < 0.4 ? 0 : traitRoll < 0.8 ? 1 : 2;
      w.commanders.push({
        id: w.nextCommanderId++,
        country: c,
        nameJa: SURNAMES_JA[si] + ' ' + GIVEN_JA[gi],
        nameEn: GIVEN_EN[gi] + ' ' + SURNAME_EN[si],
        skill,
        trait,
        assignedUnit: -1,
        exp: 0,
      });
    }
  }
}

export function commanderTrait(w: WorldState, commanderId: number): 0 | 1 | 2 | -1 {
  const cmdr = w.commanders.find((c) => c.id === commanderId);
  return cmdr ? cmdr.trait : -1;
}

/** 師団の指揮官戦闘力係数（攻/防側それぞれ） */
export function commanderMod(w: WorldState, u: Unit, side: 'attack' | 'defend'): number {
  if (u.commanderId < 0) return 1.0;
  const cmdr = w.commanders.find((c) => c.id === u.commanderId);
  if (!cmdr) return 1.0;
  let mod = 1 + cmdr.skill * 0.04;
  if ((side === 'attack' && cmdr.trait === 0) || (side === 'defend' && cmdr.trait === 1)) mod += 0.06;
  return mod;
}

/** 師団作成時の自動割当（空き指揮官の最skill者） */
export function formationAssignment(w:WorldState,id:number):boolean {
  return w.armies.some(a=>a.commanderId===id)||w.armyGroups.some(g=>g.commanderId===id);
}
/** One position at a time, including the legacy division role. */
export function releaseCommander(w:WorldState,id:number):void {
  if(id<0)return;
  for(const u of w.units)if(u.commanderId===id)u.commanderId=-1;
  for(const a of w.armies)if(a.commanderId===id)a.commanderId=-1;
  for(const g of w.armyGroups)if(g.commanderId===id)g.commanderId=-1;
  const c=w.commanders.find(c=>c.id===id);
  if(c)c.assignedUnit=-1;
}
export function autoAssignCommander(w: WorldState, unit: Unit): void {
  const free = w.commanders
    .filter((c) => c.country === unit.owner && c.assignedUnit < 0 && !formationAssignment(w,c.id))
    .sort((a, b) => b.skill - a.skill || a.id - b.id)[0];
  if (free) {
    free.assignedUnit = unit.id;
    unit.commanderId = free.id;
  }
}

/** 月次スキル成長（決定論ロール p=0.5） */
export function registerCommanderGrowthSystem(): void {
  registerSystem({
    name: 'commanderGrowth',
    cadence: 'monthly',
    fn: (w) => {
      const rng = deriveStream(w.seed, 'commanderGrowth', String(w.tick));
      for (const cmdr of w.commanders) {
        if (cmdr.exp >= 1.0 && cmdr.skill < 5) {
          if (rng.nextFloat() < 0.5) {
            cmdr.skill++;
          }
          cmdr.exp = 0;
        }
      }
    },
  });
}
