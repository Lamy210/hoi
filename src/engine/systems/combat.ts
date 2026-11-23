// 戦闘システム — プロヴィンス単位バトル・日次解決・撤退・包囲・占領（combat-system仕様）。
// 全ての係数はトレース可能（trace.tsのunitCombatTraceで再計算）。決定論ロールはPCG32派生ストリーム。
import { divisionTemplate } from '../military/templates';
import {releaseEquipmentAttribution,trimUnitEquipment} from './issuedEquipment';
import { selectCombatFront, unitComposition, unitOrgCap } from '../military/unitComposition';
import type { TemplateStats } from '../military/templateStats';
import { deriveStream } from '../core/rng';
import { addAlert, atWar, effectiveSupply, type Unit, type WorldState } from '../core/state';
import { registerSystem } from '../core/scheduler';
import { tickMovement } from './movement';
import { reinforceIdleUnits } from './reinforcement';
import { weatherAttackMod, weatherOrgMod } from './weather';
import { commanderMod, commanderTrait, releaseCommander } from '../military/commanders';
import { techMods } from './research';
import {issuedModelCombatFactor,operationalCombatTechBonus} from '../military/equipmentCombat';
import { checkAnnexation } from '../military/war';
import {advanceBattlePreparedness,preparednessPowerFactor} from '../military/preparedness';
import {unitProtectionPoints,protectionDamageFactor} from '../military/combatProtection';
import { addContribution, CONTRIB_CAPITAL, CONTRIB_OCCUPATION } from '../diplomacy/peace';

/** 地形修飾（balanced）。indexはTERRAIN配列の順。 */
export const TERRAIN_DATA = [
  { width: 10, atk: 1.0, def: 1.0 }, // plains（GDD §4.3準拠）
  { width: 6, atk: 0.8, def: 1.15 }, // hills
  { width: 4, atk: 0.65, def: 1.35 }, // mountains
  { width: 5, atk: 0.75, def: 1.25 }, // urban
  { width: 6, atk: 0.85, def: 1.10 }, // forest
  { width: 8, atk: 1.0, def: 0.95 }, // desert
] as const;

export const RETREAT_ORG = 20;
// A vacant hostile province changes control on the arrival-day combat tick.
// Occupation is still conditional on surviving attackers and no defenders.
export const OCCUPATION_DAYS = 1;
export const ENCIRCLE_DAMAGE = 8;
export const ORG_REGEN_BASE = 3;

export interface PowerContrib {
  label: string;
  value: number;
  formula: string;
}

/** 師団1個の戦闘力（決定論ロールを除く係数部分。トレースAPIからも使用） */
export function unitPowerFactorsPure(
  u: Unit,
  terrainIdx: number,
  supplyEff: number,
  side: 'attack' | 'defend',
  weatherMod = 1.0,
  cmdrMod = 1.0,
  composition: TemplateStats | null = null,
): PowerContrib[] {
  const t = TERRAIN_DATA[terrainIdx];
  const supplyMod = 0.5 + 0.5 * supplyEff;
  const mpFill = u.maxManpower > 0 ? u.manpower / u.maxManpower : 0;
  const infFill = u.maxInfEquipment > 0 ? u.infEquipment / u.maxInfEquipment : 1;
  const artFill = u.maxArtEquipment > 0 ? u.artEquipment / u.maxArtEquipment : 1;
  // 装備係数は2財の幾何平均（D-029）
  const eqFill = Math.sqrt(Math.max(0, infFill) * Math.max(0, artFill));
  const orgFrac = u.org / 100;
  const expMod = 1 + u.exp * 0.02;
  const sideMod = side === 'attack' ? t.atk : t.def;
  const weather = side === 'attack' ? weatherMod : 1.0; // 天候は攻撃側にのみ適用
  return [
    { label: 'base', value: composition ? (side === 'attack' ? composition.attack : composition.defense) : 40 * (u.maxManpower / 10000) * (side === 'attack' ? (divisionTemplate(u.templateId)?.attack ?? 1) : 1), formula: composition ? (side === 'attack' ? 'Σbattalion.attack' : 'Σbattalion.defense') : '40×size×templateAttack' },
    { label: 'org', value: orgFrac, formula: 'org/100' },
    { label: 'manpower', value: mpFill, formula: 'manpower/maxManpower' },
    { label: 'equipment', value: eqFill, formula: 'sqrt(infFill×artFill)' },
    { label: 'experience', value: expMod, formula: '1+exp×0.02' },
    { label: 'terrain', value: sideMod, formula: side === 'attack' ? 'terrain.atk' : 'terrain.def' },
    { label: 'supply', value: supplyMod, formula: '0.5+0.5×supplyEff' },
    { label: 'weather', value: weather, formula: 'weather.atk' },
    { label: 'commander', value: cmdrMod, formula: '1+skill×0.04(+trait)' },
    { label: side === 'defend' ? 'entrenchment' : 'planning', value: preparednessPowerFactor(u,side), formula: side === 'defend' ? '1+0.05×entrenchmentLevel' : '1+0.04×preparationLevel' },
  ];
}

/** WorldStateから係数を解決するラッパ（戦闘解決・トレース用） */
export function unitPowerFactors(
  w: WorldState,
  u: Unit,
  provIdx: number,
  side: 'attack' | 'defend',
): PowerContrib[] {
  const eff = effectiveSupply(w, u);
  const factors = unitPowerFactorsPure(u, w.prov.terrain[provIdx], eff, side, weatherAttackMod(w, provIdx), commanderMod(w, u, side), unitComposition(w, u));
  const primary=operationalCombatTechBonus(w,u.owner,
    side==='attack'?'infantryAttack':'infantryDefense');
  const artillery=side==='attack'&&u.maxArtEquipment>0
    ? operationalCombatTechBonus(w,u.owner,'artilleryAttack')*
      Math.max(0,Math.min(1,u.artEquipment/u.maxArtEquipment)) : 0;
  if(primary+artillery!==0)factors.push({
    label:'technology',value:Math.max(0.1,1+primary+artillery),
    formula:'1+operationalTech+artillerySupport×fill',
  });
  const equipmentModel=issuedModelCombatFactor(w,u,side);
  if(equipmentModel!==1)factors.push({
    label:'equipmentModel',value:equipmentModel,
    formula:'identified model quality weighted by held equipment (unclassified=1)',
  });
  return factors;
}

function factorProduct(cs: PowerContrib[]): number {
  let p = 1;
  for (const c of cs) p *= c.value;
  return p;
}

interface Sides {
  attackers: Unit[];
  defenders: Unit[];
}

function gatherBattles(w: WorldState): Map<number, Sides> {
  const map = new Map<number, Sides>();
  for (const u of w.units) {
    if (u.destroyed) continue;
    if (u.path.length > 0) continue; // 移動中は戦闘不参加
    const ctrl = w.prov.controller[u.loc];
    if (u.owner === ctrl) {
      const s = map.get(u.loc) ?? { attackers: [], defenders: [] };
      s.defenders.push(u);
      map.set(u.loc, s);
    } else if (atWar(w, u.owner, ctrl)) {
      const s = map.get(u.loc) ?? { attackers: [], defenders: [] };
      s.attackers.push(u);
      map.set(u.loc, s);
    }
  }
  return map;
}

function resolveBattle(w: WorldState, provIdx: number, sides: Sides, engagedUnitIds: Set<number>): void {
  const prov = w.prov;
  const rng = deriveStream(w.seed, 'combat', prov.id[provIdx] + ':' + String(w.tick));
  const t = TERRAIN_DATA[prov.terrain[provIdx]];
  const byId = (a: Unit, b: Unit) => a.id - b.id;
  const attackers = sides.attackers.slice().sort(byId);
  const defenders = sides.defenders.slice().sort(byId);
  const selA=selectCombatFront(w,attackers,t.width);
  const selD=selectCombatFront(w,defenders,t.width);
  const frontA=selA.units,frontD=selD.units;
  // Persist participation for this tick only. Reserves on the same
  // contested tile must not be treated as engaged or take battle losses.
  for (const u of [...frontA,...frontD]) engagedUnitIds.add(u.id);
  const powersA = frontA.map((u,i) => factorProduct(unitPowerFactors(w, u, provIdx, 'attack'))*selA.penalties[i]);
  const powersD = frontD.map((u,i) => factorProduct(unitPowerFactors(w, u, provIdx, 'defend'))*selD.penalties[i]);
  const sumA = powersA.reduce((a, b) => a + b, 0) || 1e-9;
  const sumD = powersD.reduce((a, b) => a + b, 0) || 1e-9;
  const ratioA = sumA / (sumA + sumD);
  // Enemy fire is distributed only over engaged divisions. Reserves outside
  // combat width neither absorb damage nor inflate defense/breakthrough.
  const pressureOnDefender = sumA / Math.max(1, frontD.length);
  const pressureOnAttacker = sumD / Math.max(1, frontA.length);

  // 戦争貢献度（phase4-peace-conference）: 与ダメを戦力比で配分して加算（D-046）
  const warOfPair = (c1: number, c2: number) => {
    for (const war of w.wars) {
      if (war.status === 'ended') continue;
      if ((war.aggressor === c1 && war.defender === c2) || (war.aggressor === c2 && war.defender === c1)) return war;
    }
    return null;
  };
  const battleWar = frontA.length > 0 && frontD.length > 0 ? warOfPair(frontA[0].owner, w.prov.controller[provIdx]) : null;
  if (battleWar) {
    for (let i = 0; i < frontA.length; i++) {
      addContribution(battleWar, frontA[i].owner, ((12 * ratioA) / 10) * (powersA[i] / sumA));
    }
    for (let i = 0; i < frontD.length; i++) {
      addContribution(battleWar, frontD[i].owner, ((12 * (1 - ratioA)) / 10) * (powersD[i] / sumD));
    }
  }

  // Organization and materiel losses depend on the original front-power
  // ratio, then on each engaged unit's independent defensive capacity.
  // Defense holds the province; breakthrough protects attacking divisions.
  // Both protection factors are bounded: even entrenched armies take losses.
  const totalDmgToDef = 12 * ratioA;
  const totalDmgToAtt = 12 * (1 - ratioA);
  for (const u of frontD) {
    const capacity = unitProtectionPoints(w,u,'defense',t.def);
    const dmg = (totalDmgToDef / Math.max(1, frontD.length)) *
      protectionDamageFactor(pressureOnDefender,capacity) * (0.85 + 0.3 * rng.nextFloat());
    u.org = Math.max(0, u.org - dmg);
    u.manpower = Math.max(0, u.manpower - dmg * 8);
    u.infEquipment = Math.max(0, u.infEquipment - dmg * 6);
    u.artEquipment = Math.max(0, u.artEquipment - dmg * 1.2);
    trimUnitEquipment(w,u.id,'infantry',u.infEquipment);
    trimUnitEquipment(w,u.id,'artillery',u.artEquipment);
    u.exp = Math.min(5, u.exp + 0.005);
    bumpCommanderExp(w, u, 0.01);
  }
  for (const u of frontA) {
    const capacity = unitProtectionPoints(w,u,'breakthrough',t.atk);
    const dmg = (totalDmgToAtt / Math.max(1, frontA.length)) *
      protectionDamageFactor(pressureOnAttacker,capacity) * (0.85 + 0.3 * rng.nextFloat());
    u.org = Math.max(0, u.org - dmg);
    u.manpower = Math.max(0, u.manpower - dmg * 8);
    u.infEquipment = Math.max(0, u.infEquipment - dmg * 6);
    u.artEquipment = Math.max(0, u.artEquipment - dmg * 1.2);
    trimUnitEquipment(w,u.id,'infantry',u.infEquipment);
    trimUnitEquipment(w,u.id,'artillery',u.artEquipment);
    u.exp = Math.min(5, u.exp + 0.005);
    bumpCommanderExp(w, u, 0.01);
  }

  // 崩壊チェック（戦力枯渇）
  for (const u of [...frontA, ...frontD]) {
    if (!u.destroyed && (u.manpower < u.maxManpower * 0.05 || u.infEquipment < u.maxInfEquipment * 0.4 || (u.maxArtEquipment > 0 && u.artEquipment < u.maxArtEquipment * 0.25))) {
      u.destroyed = true;
      addAlert(w, { kind: 'unitDestroyed', priority: 4, msgKey: 'alert.unitDestroyed', params: { where: prov.nameJa[provIdx] || prov.nameEn[provIdx] }, actor: u.owner, province: provIdx });
    }
  }

  // 撤退判定（org < 20%）
  for (const u of [...frontA, ...frontD]) {
    if (u.destroyed || u.encircled) continue;
    if (u.org < RETREAT_ORG) {
      retreatUnit(w, u);
    }
  }
}

/** Retreat only onto an adjacent, friendly-controlled land tile.
 * Prefer supplied positions with fewer enemy approaches, never neutral borders,
 * straits or an already-contested tile. Pure selection: no teleport on failure.
 */
export function chooseRetreatProvince(w: WorldState, u: Unit): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (let i = w.adj.offsets[u.loc]; i < w.adj.offsets[u.loc + 1]; i++) {
    if (w.adj.strait[i]) continue;
    const p = w.adj.targets[i];
    if (w.prov.controller[p] !== u.owner) continue;
    if (w.units.some(x => !x.destroyed && x.loc === p && atWar(w, u.owner, x.owner))) continue;
    let enemyBorders = 0;
    for (let j = w.adj.offsets[p]; j < w.adj.offsets[p + 1]; j++) {
      if (!w.adj.strait[j] && atWar(w, u.owner, w.prov.controller[w.adj.targets[j]])) enemyBorders++;
    }
    const supply = Math.max(0, Math.min(1, w.runtime.supplyEff[p] ?? 0));
    const score = supply * 100 + w.prov.infra[p] * 3 - enemyBorders * 35;
    if (score > bestScore || (score === bestScore && (best === null || p < best))) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Battle loser retreats to a safe nearby controlled tile; otherwise encircled. */
function retreatUnit(w: WorldState, u: Unit): void {
  const best = chooseRetreatProvince(w, u);
  if (best === null) {
    u.encircled = true;
    return;
  }
  u.loc = best;
  u.path = [];
  u.segIdx = 0;
  u.segProgress = 0;
  u.segDays = 0;
  u.org = Math.max(u.org, RETREAT_ORG + 5); // Reorganization before the next assault.
}

function tickOccupation(w: WorldState, battles: Map<number, Sides>): void {
  for (let p = 0; p < w.prov.count; p++) {
    const ctrl = w.prov.controller[p];
    const s = battles.get(p);
    if (!s) { w.occupancyTimer[p] = 0; w.occupierCandidate[p] = -1; continue; }
    // Battle resolution can destroy or retreat units before occupation is evaluated.
    const defendersPresent = s.defenders.some(u => !u.destroyed && u.loc === p);
    const survivingAttackers = s.attackers.filter(u => !u.destroyed && !u.encircled && u.loc === p && atWar(w, u.owner, ctrl));
    const attackersPresent = survivingAttackers.length > 0;
    if (defendersPresent || !attackersPresent) {
      w.occupancyTimer[p] = 0;
      w.occupierCandidate[p] = -1;
      continue;
    }
    // 防衛軍不在＋攻撃側在駐 → 占領タイマ進行
    let candidate = -1;
    for (const u of survivingAttackers) {
      if (candidate < 0 || u.owner < candidate) candidate = u.owner;
    }
    if (w.occupierCandidate[p] !== candidate) {
      w.occupierCandidate[p] = candidate;
      w.occupancyTimer[p] = 1;
    } else {
      w.occupancyTimer[p]++;
    }
    if (w.occupancyTimer[p] >= OCCUPATION_DAYS && ctrl !== candidate) {
      const wasOwn = w.prov.owner[p];
      // 占領完了の貢献度（phase4-peace-conference）: 占領+15・首都追加+20
      const occWar = w.wars.find(
        (war) => war.status !== 'ended'
          && ((war.aggressor === candidate && war.defender === ctrl) || (war.aggressor === ctrl && war.defender === candidate)),
      );
      if (occWar) {
        addContribution(occWar, candidate, CONTRIB_OCCUPATION + (p === w.countries.capital[wasOwn] ? CONTRIB_CAPITAL : 0));
      }
      w.prov.controller[p] = candidate;
      w.occupancyTimer[p] = 0;
      w.occupierCandidate[p] = -1;
      w.runtime.supplyDirty = true;
      if (wasOwn === candidate) {
        addAlert(w, { kind: 'provinceLiberated', priority: 5, msgKey: 'alert.provinceLiberated', params: { province: w.prov.nameJa[p] || w.prov.nameEn[p] }, actor: candidate, province: p });
      } else {
        addAlert(w, { kind: 'provinceOccupied', priority: 7, msgKey: 'alert.provinceOccupied', params: { province: w.prov.nameJa[p] || w.prov.nameEn[p] }, actor: candidate, province: p });
      }
    }
  }
}

function tickAttrition(w: WorldState, battles: Map<number, Sides>, engagedUnitIds: ReadonlySet<number>, activeBattles: ReadonlySet<number>): void {
  for (const u of w.units) {
    if (u.destroyed) continue;
    // 実戦闘=攻撃側が存在する場合のみ（防衛のみのエントリは戦闘扱いにしない）
    const contested = battles.has(u.loc) && battles.get(u.loc)!.attackers.length > 0;
    // Attackers occupying an undefended tile retain the legacy behavior.
    // During an actual fight, only selected frontline divisions are engaged:
    // co-located reserves can recover organization without moving.
    const inBattle = contested && (!activeBattles.has(u.loc) || engagedUnitIds.has(u.id));
    // 補給途絶による包囲判定（phase2-fronts-logistics）: eff≈0かつ周囲に自領なし→包囲
    if (!u.encircled && !inBattle) {
      const eff = effectiveSupply(w, u);
      if (eff <= 0.05) {
        let friendlyNeighbor = false;
        for (let i = w.adj.offsets[u.loc]; i < w.adj.offsets[u.loc + 1]; i++) {
          const v = w.adj.targets[i];
          if (w.prov.controller[v] === u.owner) friendlyNeighbor = true;
        }
        if (!friendlyNeighbor) u.encircled = true;
      }
    }
    if (u.encircled) {
      u.org = Math.max(0, u.org - ENCIRCLE_DAMAGE);
      if (u.org <= 0) {
        u.destroyed = true;
        addAlert(w, { kind: 'unitDestroyed', priority: 4, msgKey: 'alert.unitEncircledDestroyed', params: { where: w.prov.nameJa[u.loc] || w.prov.nameEn[u.loc] }, actor: u.owner, province: u.loc });
      }
      continue;
    }
    if (!inBattle && u.path.length === 0) {
      const eff = effectiveSupply(w, u);
      const traitLogistics = u.commanderId >= 0 ? commanderTrait(w, u.commanderId) === 2 : false;
      // 安定度（phase3-politics）×技術（orgRegen）で回復速度変化
      const stabilityMod = 0.7 + w.stability[u.owner] * 0.3;
      const regen = ORG_REGEN_BASE * (0.2 + 0.8 * eff) * weatherOrgMod(w, u.loc) * (traitLogistics ? 1.15 : 1) * stabilityMod * (1 + techMods(w, u.owner, 'orgRegen'));
      u.org = Math.min(unitOrgCap(w,u), u.org + regen);
      // 補充は日次の組織回復・損耗処理後に優先度順で適用する。
    }
  }
  reinforceIdleUnits(w,new Set([...battles].filter(([,s])=>s.attackers.length>0).map(([p])=>p)),engagedUnitIds);
  // 破壊済みユニットの除去（ID順維持 → 決定論）
  for (let i = w.units.length - 1; i >= 0; i--) {
    if (w.units[i].destroyed) {
      const u=w.units[i];
      if(u.commanderId>=0&&w.commanders.some(c=>c.id===u.commanderId&&c.assignedUnit===u.id))releaseCommander(w,u.commanderId);
      releaseEquipmentAttribution(w,'unit',u.id);
      w.units.splice(i, 1);
    }
  }
}

export function registerCombatSystems(): void {
  registerSystem({
    name: 'combat',
    cadence: 'daily',
    fn: (w) => {
      // Capture the locations before path movement: both travel and retreat
      // invalidate prepared defenses at the end of this combat day.
      const initialLocations = new Map(w.units.filter(u=>!u.destroyed).map(u=>[u.id,u.loc]));
      const travelling=new Set(w.units.filter(u=>!u.destroyed&&u.path.length>0).map(u=>u.id));
      // 1) 移動進行 → 到着ユニットが戦闘/占領の対象になる
      tickMovement(w);
      const battles = gatherBattles(w);
      // 戦闘開始/終了アラート
      const nowActive = new Set<number>();
      for (const [prov, s] of battles) {
        if (s.attackers.length > 0 && s.defenders.length > 0) nowActive.add(prov);
      }
      for (const prov of nowActive) {
        if (!w.runtime.activeBattles.has(prov)) {
          addAlert(w, {
            kind: 'battleStarted', priority: 6, msgKey: 'alert.battleStarted',
            params: { province: w.prov.nameJa[prov] || w.prov.nameEn[prov] },
            province: prov,
          });
        }
      }
      for (const prov of w.runtime.activeBattles) {
        if (!nowActive.has(prov)) {
          addAlert(w, {
            kind: 'battleEnded', priority: 3, msgKey: 'alert.battleEnded',
            params: { province: w.prov.nameJa[prov] || w.prov.nameEn[prov] },
            province: prov,
          });
        }
      }
      w.runtime.activeBattles = nowActive;
      // 2) 戦闘解決（ID順・決定論）
      const provKeys = [...nowActive].sort((a, b) => a - b);
      const engagedUnitIds=new Set<number>();
      for (const prov of provKeys) {
        const s = battles.get(prov);
        if (s && s.attackers.length > 0 && s.defenders.length > 0)
          resolveBattle(w, prov, s, engagedUnitIds);
      }
      // 3) 占領タイマ → 4) 損耗・回復 → 5) 破壊済み除去 → 6) 併合判定（phase2-fronts-logistics）
      tickOccupation(w, battles);
      tickAttrition(w, battles, engagedUnitIds, nowActive);
      for(const u of w.units)if(initialLocations.get(u.id)!==u.loc)travelling.add(u.id);
      advanceBattlePreparedness(w,travelling,nowActive);
      for (const c of checkAnnexation(w)) {
        addAlert(w, {
          kind: 'provinceLiberated', priority: 9,
          msgKey: 'alert.countryAnnexed',
          params: { country: w.countries.nameJa[c] || w.countries.nameEn[c] },
          actor: c,
        });
      }
    },
  });
}

/** 戦闘力のトレース（UI要求時のみ再計算。常時保持しない） */
export function unitCombatTrace(w: WorldState, unitId: number): { contribs: PowerContrib[]; roll: string } | null {
  const u = w.units.find((x) => x.id === unitId && !x.destroyed);
  if (!u) return null;
  const provIdx = u.loc;
  const ctrl = w.prov.controller[provIdx];
  const side: 'attack' | 'defend' = u.owner === ctrl ? 'defend' : 'attack';
  const contribs = unitPowerFactors(w, u, provIdx, side);
  const role = side === 'defend' ? 'defense' : 'breakthrough';
  const terrain = TERRAIN_DATA[w.prov.terrain[provIdx]];
  const capacity = unitProtectionPoints(w,u,role,side==='defend'?terrain.def:terrain.atk);
  contribs.push({
    label:role==='defense'?'defenseCapacity':'breakthroughCapacity',
    value:capacity,
    formula:'independent protection points (NOT a combat-power multiplier); damage factor=1.10−0.40×min(1,capacity/incomingPerUnit)',
  });
  return {
    contribs,
    roll: '0.85〜1.15（PCG32派生ストリーム: combat/' + w.prov.id[provIdx] + '）・損耗軽減倍率0.70〜1.10',
  };
}

/** 戦闘経験を指揮官へ還元（phase2-equipment-production） */
function bumpCommanderExp(w: WorldState, u: Unit, amount: number): void {
  if (u.commanderId < 0) return;
  const cmdr = w.commanders.find((c) => c.id === u.commanderId);
  if (cmdr) cmdr.exp = Math.min(1, cmdr.exp + amount);
}
