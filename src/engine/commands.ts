// コマンドレジストリ — 全コマンドの検証と適用（game-core仕様）。
// UI（issuer='player'）とAI（issuer='ai:<id>'）は同一の検証を通る。
import { allocateAiSequence } from './core/sequence';
import { issuerCountry, registerCommand } from './core/command';
import { addAlert, atWar, type Cmd, type TreatyType, type WorldState } from './core/state';
import { getEdge } from './map/adjacency';
import { findPath, segmentDays } from './systems/movement';
import { applyRelationDelta, endWar, startWar, warScoreFor } from './military/war';
import { UNIT_MAX_ART_EQUIPMENT, UNIT_MAX_INF_EQUIPMENT, UNIT_MAX_MANPOWER } from './scenario/unitCosts';
import { autoAssignCommander } from './military/commanders';
import { autoFrontProvinces, frontOf } from './military/fronts';
import { divisionTemplate, MAX_TRAINING } from './military/templates';
import { refundTraining } from './systems/training';
import { MAX_ART_SHARE } from './systems/production';
import { LAW_PP_COST } from './systems/politics';
import { techDefs, MAX_ACTIVE_RESEARCH } from './systems/research';
import { COST_INFRA, COST_MILFACTORY, MAX_CONCURRENT, constructionDays } from './systems/construction';
import {
  activeTreatyBetween, aiEvaluateTreaty, annulTreaty, isAllied, logDiplomacyDecision,
  proposedTreatyBetween, TREATY_TYPES, TREATY_DURATION_DAYS,
} from './diplomacy/treaties';
import { aiEvaluatePeace, validateDemands } from './diplomacy/peace';

export const UNIT_MANPOWER_COST = 10000;
export const UNIT_INF_EQUIPMENT_COST = 1000;
export const UNIT_ART_EQUIPMENT_COST = 200;
export { UNIT_MAX_ART_EQUIPMENT, UNIT_MAX_INF_EQUIPMENT, UNIT_MAX_MANPOWER };

function resolveIssuerCountry(w: WorldState, issuer: string, claimed: number): boolean {
  if (issuer === 'player') return claimed === w.playerCountry;
  const c = issuerCountry(issuer);
  return c !== null && c === claimed;
}

/** プレイヤー（手動='player'、戦線AI='frontai'）は w.playerCountry、AIは 'ai:<id>' の国家として解決する */
function actorCountry(w: WorldState, issuer: string): number | null {
  if (issuer === 'player' || issuer === 'frontai') return w.playerCountry;
  return issuerCountry(issuer);
}

function aiCmd(w: WorldState, issuer: string, type: string, p: Record<string, unknown>): void {
  const seq = allocateAiSequence(w, issuer);
  const cmd: Cmd = { issuer, seq, type, p };
  w.runtime.commandsSinceLastTick.push(cmd);
}

export function registerAllCommands(): void {
  registerCommand('setDifficulty', {
    validate(w, p, issuer) {
      if (issuer !== 'player') return 'notPlayer';
      if (w.tick !== 0) return 'onlyAtGameStart';
      const d = p.d;
      if (typeof d !== 'number' || d < 0 || d > 2 || !Number.isInteger(d)) return 'badDifficulty';
      return null;
    },
    apply(w, p) {
      w.difficulty = p.d as 0 | 1 | 2;
    },
  });

  registerCommand('createUnit', {
    validate(w, p, issuer) {
      const country = p.country as number;
      const prov = p.province as number;
      if (!Number.isInteger(country) || !Number.isInteger(prov)) return 'badParams';
      if (!resolveIssuerCountry(w, issuer, country)) return 'notYourCountry';
      if (country < 0 || country >= w.countries.count || !w.countries.alive[country]) return 'countryDead';
      if (prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== country) return 'notControlledByYou';
      if (w.countries.manpowerPool[country] < UNIT_MANPOWER_COST) return 'insufficientManpower';
      if (w.countries.infEquipmentStock[country] < UNIT_INF_EQUIPMENT_COST) return 'insufficientEquipment';
      if (w.countries.artEquipmentStock[country] < UNIT_ART_EQUIPMENT_COST) return 'insufficientArtillery';
      return null;
    },
    apply(w, p, issuer) {
      const country = p.country as number;
      const prov = p.province as number;
      w.countries.manpowerPool[country] -= UNIT_MANPOWER_COST;
      w.countries.infEquipmentStock[country] -= UNIT_INF_EQUIPMENT_COST;
      w.countries.artEquipmentStock[country] -= UNIT_ART_EQUIPMENT_COST;
      const unit = {
        id: w.nextUnitId++,
        owner: country,
        loc: prov,
        path: [],
        segIdx: 0,
        segProgress: 0,
        segDays: 0,
        manpower: UNIT_MAX_MANPOWER,
        maxManpower: UNIT_MAX_MANPOWER,
        infEquipment: UNIT_MAX_INF_EQUIPMENT,
        maxInfEquipment: UNIT_MAX_INF_EQUIPMENT,
        artEquipment: UNIT_MAX_ART_EQUIPMENT,
        maxArtEquipment: UNIT_MAX_ART_EQUIPMENT,
        org: 50,
        exp: 0,
        frontId: -1,
        commanderId: -1,
        encircled: false,
        destroyed: false,
      };
      w.units.push(unit);
      // 空き指揮官の自動割当（最skill者。プレイヤーは後からUIで変更可能）
      autoAssignCommander(w, unit);
      addAlert(w, {
        kind: 'unitCreated', priority: 2,
        msgKey: 'alert.unitCreated',
        params: { where: w.prov.nameJa[prov] || w.prov.nameEn[prov] },
        actor: country, province: prov,
      });
      void issuer;
    },
  });

  registerCommand('startTraining', {
    validate(w, p, issuer) {
      const c = actorCountry(w, issuer), prov = p.province as number;
      const t = divisionTemplate(p.templateId);
      if (c === null || !w.countries.alive[c]) return 'countryDead';
      if (!t) return 'badParams';
      if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== c) return 'notControlledByYou';
      if (w.trainingQueue.filter(o => o.country === c).length >= MAX_TRAINING) return 'trainingFull';
      if (w.countries.manpowerPool[c] < t.manpower) return 'insufficientManpower';
      if (w.countries.infEquipmentStock[c] < t.infantry) return 'insufficientEquipment';
      if (w.countries.artEquipmentStock[c] < t.artillery) return 'insufficientArtillery';
      return null;
    },
    apply(w, p, issuer) {
      const c = actorCountry(w, issuer)!;
      const t = divisionTemplate(p.templateId)!;
      w.countries.manpowerPool[c] -= t.manpower;
      w.countries.infEquipmentStock[c] -= t.infantry;
      w.countries.artEquipmentStock[c] -= t.artillery;
      w.trainingQueue.push({ id: w.nextUnitId++, country: c, province: p.province as number, templateId: t.id, readyTick: w.tick + t.days });
    },
  });
  registerCommand('cancelTraining', {
    validate(w, p, issuer) {
      const c = actorCountry(w, issuer);
      return w.trainingQueue.some(o => o.id === p.id && o.country === c) ? null : 'badParams';
    },
    apply(w, p) {
      const index = w.trainingQueue.findIndex(o => o.id === p.id);
      refundTraining(w, w.trainingQueue[index]);
      w.trainingQueue.splice(index, 1);
    },
  });

  registerCommand('setProductionShare', {
    validate(w, p, issuer) {
      const share = p.share as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > MAX_ART_SHARE) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.productionShare[country] = p.share as number;
      void issuer;
    },
  });

  registerCommand('createFront', {
    validate(w, p, issuer) {
      const enemy = p.enemy as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (!Number.isInteger(enemy) || enemy < 0 || enemy >= w.countries.count || !w.countries.alive[enemy]) return 'badTarget';
      if (enemy === country) return 'selfWar';
      if (!atWar(w, country, enemy)) return 'notAtWar';
      const provinces = p.provinces as number[] | undefined;
      if (provinces !== undefined) {
        if (!Array.isArray(provinces) || provinces.length === 0) return 'badParams';
        for (const prov of provinces) {
          if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
          if (w.prov.controller[prov] !== country) return 'notControlledByYou';
        }
      }
      const cap = p.cap as number | undefined;
      if (cap !== undefined && (!Number.isInteger(cap) || cap < 1 || cap > 8)) return 'badParams';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      const enemy = p.enemy as number;
      const provinces = Array.isArray(p.provinces) ? (p.provinces as number[]).slice().sort((a, b) => a - b) : autoFrontProvinces(w, country, enemy);
      const targets = Array.isArray(p.targets) ? (p.targets as number[]).slice().sort((a, b) => a - b) : [];
      const cap = typeof p.cap === 'number' ? p.cap : 2;
      const front = { id: w.nextFrontId++, owner: country, enemy, stance: 'hold' as const, provinces, targets, cap };
      w.fronts.push(front);
      void issuer;
    },
  });

  registerCommand('setFrontStance', {
    validate(w, p, issuer) {
      const front = frontOf(w, p.frontId as number);
      const country = actorCountry(w, issuer);
      if (!front) return 'noFront';
      if (country === null || front.owner !== country) return 'notYourFront';
      if (!['hold', 'attack', 'retreat'].includes(p.stance as string)) return 'badParams';
      return null;
    },
    apply(w, p) {
      const front = frontOf(w, p.frontId as number)!;
      front.stance = p.stance as 'hold' | 'attack' | 'retreat';
      if (Array.isArray(p.targets)) front.targets = (p.targets as number[]).slice().sort((a, b) => a - b);
      if (typeof p.cap === 'number') front.cap = p.cap;
    },
  });

  registerCommand('deleteFront', {
    validate(w, p, issuer) {
      const front = frontOf(w, p.frontId as number);
      const country = actorCountry(w, issuer);
      if (!front) return 'noFront';
      if (country === null || front.owner !== country) return 'notYourFront';
      return null;
    },
    apply(w, p) {
      const id = p.frontId as number;
      w.fronts = w.fronts.filter((f) => f.id !== id);
      for (const u of w.units) {
        if (u.frontId === id) u.frontId = -1;
      }
    },
  });

  registerCommand('assignToFront', {
    validate(w, p, issuer) {
      const front = frontOf(w, p.frontId as number);
      const country = actorCountry(w, issuer);
      const ids = p.units as number[];
      if (!Array.isArray(ids) || ids.length === 0) return 'noUnits';
      if (!front) return 'noFront';
      if (country === null || front.owner !== country) return 'notYourFront';
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (!u) return 'unknownUnit:' + id;
        if (u.owner !== country) return 'notYourUnit:' + id;
        if (u.destroyed) return 'unitDestroyed:' + id;
      }
      return null;
    },
    apply(w, p) {
      const frontId = p.frontId as number;
      const ids = p.units as number[];
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (u) u.frontId = frontId;
      }
    },
  });

  registerCommand('setTaxRate', {
    validate(w, p, issuer) {
      const rate = p.rate as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 0.5) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.taxRate[country] = p.rate as number;
      void issuer;
    },
  });

  registerCommand('setBudgetEdu', {
    validate(w, p, issuer) {
      const rate = p.rate as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.budgetEdu[country] = p.rate as number;
      void issuer;
    },
  });

  registerCommand('enactLaw', {
    validate(w, p, issuer) {
      const slot = p.slot as string;
      const target = p.target as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (slot !== 'conscription' && slot !== 'economy') return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target > 2) return 'badParams';
      if (w.lawQueue[country]) return 'lawPending';
      if (w.laws[country][slot] === target) return 'badParams';
      if (w.pp[country] < LAW_PP_COST) return 'insufficientPP';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.lawQueue[country] = {
        slot: p.slot as 'conscription' | 'economy',
        target: p.target as 0 | 1 | 2,
        cost: LAW_PP_COST,
        startTick: w.tick,
        enactDays: 30,
      };
      void issuer;
    },
  });

  registerCommand('startResearch', {
    validate(w, p, issuer) {
      const techId = p.techId as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      const def = techDefs().find((t) => t.id === techId);
      if (!def) return 'noTech';
      const st = w.research[country];
      if (st.done.includes(techId) || st.active.some((a) => a.id === techId)) return 'badParams';
      if (st.active.length >= MAX_ACTIVE_RESEARCH) return 'researchSlotsFull';
      for (const req of def.req) {
        if (!st.done.includes(req)) return 'techPrereqMissing';
      }
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.research[country].active.push({ id: p.techId as string, progress: 0 });
      void issuer;
    },
  });

  registerCommand('startConstruction', {
    validate(w, p, issuer) {
      const prov = p.province as number;
      const type = p.type as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== country) return 'notControlledByYou';
      if (type !== 'milFactory' && type !== 'infra') return 'badParams';
      if (type === 'infra' && w.prov.infra[prov] >= 10) return 'badParams';
      if (w.constructionQueue.filter((pr) => pr.country === country && pr.daysProgress < pr.daysTotal).length >= MAX_CONCURRENT) return 'constructionFull';
      if (w.treasury[country] < (type === 'milFactory' ? COST_MILFACTORY : COST_INFRA) / constructionDays(w, prov)) return 'insufficientFunds';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      const prov = p.province as number;
      const type = p.type as 'milFactory' | 'infra';
      const cost = type === 'milFactory' ? COST_MILFACTORY : COST_INFRA;
      w.constructionQueue.push({
        id: w.nextConstructionId++,
        country,
        prov,
        type,
        cost,
        costPaid: 0,
        daysTotal: constructionDays(w, prov),
        daysProgress: 0,
        paused: false,
      });
      void issuer;
    },
  });

  registerCommand('assignCommander', {
    validate(w, p, issuer) {
      const unit = w.units.find((x) => x.id === p.unitId as number);
      const country = actorCountry(w, issuer);
      const cmdr = w.commanders.find((c) => c.id === p.commanderId as number);
      if (!unit) return 'unknownUnit';
      if (country === null || unit.owner !== country) return 'notYourUnit';
      if (!cmdr) return 'noCommander';
      if (cmdr.country !== country) return 'notYourCommander';
      return null;
    },
    apply(w, p) {
      const unit = w.units.find((x) => x.id === p.unitId as number)!;
      const cmdr = w.commanders.find((c) => c.id === p.commanderId as number)!;
      // 既存の割当を解除
      if (unit.commanderId >= 0) {
        const prev = w.commanders.find((c) => c.id === unit.commanderId);
        if (prev) prev.assignedUnit = -1;
      }
      if (cmdr.assignedUnit >= 0) {
        const prevUnit = w.units.find((u) => u.id === cmdr.assignedUnit);
        if (prevUnit) prevUnit.commanderId = -1;
      }
      unit.commanderId = cmdr.id;
      cmdr.assignedUnit = unit.id;
    },
  });

  registerCommand('moveUnits', {
    validate(w, p, issuer) {
      const ids = p.units as number[];
      const target = p.target as number;
      const country = actorCountry(w, issuer);
      if (!Array.isArray(ids) || ids.length === 0) return 'noUnits';
      if (issuer === 'player' && (ids.length > 256 || new Set(ids).size !== ids.length)) return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'badIssuer';
      let movable = 0;
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (!u) return 'unknownUnit:' + id;
        if (u.owner !== country) return 'notYourUnit:' + id;
        if (u.destroyed) return 'unitDestroyed:' + id;
        if (u.encircled) return 'unitEncircled:' + id;
        if ((issuer === 'player' || issuer === 'frontai') && (u.path.length > 0 || w.runtime.activeBattles.has(u.loc))) return 'unitBusy:' + id;
        if (u.loc !== target) movable++;
      }
      if (movable === 0) return 'alreadyAtTarget';
      // 経路の存在確認（applyで再計算し同じ結果を得る）
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id)!;
        if (u.loc === target) continue;
        const path = findPath(w, u.loc, target, country);
        if (!path) return 'noPath';
      }
      return null;
    },
    apply(w, p, issuer) {
      const ids = p.units as number[];
      const target = p.target as number;
      const country = actorCountry(w, issuer)!;
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (!u || u.loc === target) continue;
        const path = findPath(w, u.loc, target, country)!;
        u.path = path;
        u.segIdx = 0;
        u.segProgress = 0;
        u.segDays = segmentDays(w, path[0], path[1]);
      }
    },
  });

  // Dedicated UI travel order: never routes through hostile-controlled territory.
  registerCommand('travelUnits', {
    validate(w, p, issuer) {
      const country = actorCountry(w, issuer);
      if (country === null || !w.countries.alive[country]) return 'badIssuer';
      if (!Array.isArray(p.units) || p.units.length < 1 || p.units.length > 256 ||
          new Set(p.units).size !== p.units.length) return 'badParams';
      const target = p.target as number;
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (atWar(w, country, w.prov.controller[target])) return 'useAttack';
      let movable = false;
      for (const id of p.units) {
        const u = w.units.find(x => x.id === id && !x.destroyed);
        if (!u || u.owner !== country) return 'notYourUnit';
        if (u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc)) return 'unitBusy';
        if (u.loc === target) continue;
        movable = true;
        if (!findPath(w, u.loc, target, country, false)) return 'noPath';
      }
      return movable ? null : 'alreadyAtTarget';
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      for (const id of p.units as number[]) {
        const u = w.units.find(x => x.id === id)!;
        const target = p.target as number;
        if (u.loc === target) continue;
        u.path = findPath(w, u.loc, target, country, false)!;
        u.segIdx = 0; u.segProgress = 0;
        u.segDays = segmentDays(w, u.path[0], u.path[1]);
      }
    },
  });

  registerCommand('attackUnits', {
    validate(w, p, issuer) {
      const country = actorCountry(w, issuer);
      if (country === null || !w.countries.alive[country]) return 'badIssuer';
      const ids = p.units;
      const target = p.target as number;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 256 || new Set(ids).size !== ids.length) return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (!atWar(w, country, w.prov.controller[target])) return 'notAtWar';
      for (const id of ids) {
        const u = w.units.find(x => x.id === id && !x.destroyed);
        if (!u || u.owner !== country) return 'notYourUnit';
        if (u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc) || u.org <= 0) return 'unitBusy';
        if (w.prov.controller[u.loc] !== country) return 'notControlledByYou';
        const edge = getEdge(w, u.loc, target);
        if (!edge || edge.strait || !Number.isFinite(segmentDays(w, u.loc, target))) return 'attackNotAdjacent';
      }
      return null;
    },
    apply(w, p) {
      const target = p.target as number;
      for (const id of p.units as number[]) {
        const u = w.units.find(x => x.id === id)!;
        u.path = [u.loc, target]; u.segIdx = 0; u.segProgress = 0;
        u.segDays = segmentDays(w, u.loc, target);
      }
    },
  });

  registerCommand('declareWar', {
    validate(w, p, issuer) {
      const defender = p.defender as number;
      const country = actorCountry(w, issuer);
      if (!Number.isInteger(defender)) return 'badParams';
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'badIssuer';
      if (country === defender) return 'selfWar';
      if (defender < 0 || defender >= w.countries.count || !w.countries.alive[defender]) return 'targetDead';
      if (atWar(w, country, defender)) return 'alreadyAtWar';
      // 同盟国への宣戦は却下（diplomacy-system仕様: 矛盾する状態は存在しない）
      if (isAllied(w, country, defender)) return 'allied';
      return null;
    },
    apply(w, p, issuer) {
      const defender = p.defender as number;
      const country = actorCountry(w, issuer)!;
      const cb = w.claims.some((cl) => cl.country === country && w.prov.owner[cl.province] === defender);
      startWar(w, country, defender, cb);
      addAlert(w, {
        kind: 'warDeclared', priority: 8,
        msgKey: 'alert.warDeclared',
        params: {
          aggressor: w.countries.nameJa[country] || w.countries.nameEn[country],
          defender: w.countries.nameJa[defender] || w.countries.nameEn[defender],
          cb: cb ? 'yes' : 'no',
        },
        actor: country, target: defender,
      });
      void issuer;
    },
  });

  registerCommand('proposePeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war || war.status === 'ended') return 'noWar';
      if (country === null) return 'badIssuer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      if (war.status === 'peaceOffered') return 'alreadyOffered';
      // 講和要求（phase4-peace-conference）: 占領現状に整合する州のみ
      if (Array.isArray(p.demands)) {
        for (const d of p.demands as number[]) {
          if (!Number.isInteger(d) || d < 0 || d >= w.prov.count) return 'badParams';
        }
        const { valid, invalid } = validateDemands(w, war, country, p.demands as number[]);
        if (invalid.length > 0) return 'invalidDemand:' + invalid.join(',');
        void valid;
      }
      return null;
    },
    apply(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer)!;
      const war = w.wars.find((x) => x.id === warId)!;
      const other = war.aggressor === country ? war.defender : war.aggressor;
      const nameOf = (c: number) => w.countries.nameJa[c] || w.countries.nameEn[c];
      const demands = Array.isArray(p.demands) ? validateDemands(w, war, country, p.demands as number[]).valid : [];
      const type = demands.length > 0 ? ('demand' as const) : (p.type === 'demand' ? ('demand' as const) : ('white' as const));
      if (other === w.playerCountry) {
        // プレイヤー側に提示 → 受諾待ち（要求州を保存して講和会議UIへ）
        war.status = 'peaceOffered';
        war.offeredBy = country;
        war.offerType = type;
        war.offerDemands = demands.slice().sort((a, b) => a - b);
        addAlert(w, {
          kind: 'peaceOffered', priority: 9, msgKey: 'alert.peaceOffered',
          params: { from: nameOf(country), type, demands: String(war.offerDemands.length) }, actor: country, target: other,
        });
      } else {
        // AI側が即時判断（phase4-peace-conference: 要求価値とwarScoreで決定論判断）
        if (demands.length > 0) {
          const decision = aiEvaluatePeace(w, war, country, other, demands);
          const options = ['accept', 'decline'];
          logDiplomacyDecision(w, other, 'peace-demand', options, [1, -1],
            decision.accept ? 'accept' : 'decline', decision.reason);
          if (decision.accept) {
            endWar(w, war, 'demand', demands);
            addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type: 'demand', demands: String(demands.length) } });
          } else {
            addAlert(w, { kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined', params: { from: nameOf(other) }, actor: other });
          }
        } else {
          const otherScore = warScoreFor(w, war, other);
          const longWar = w.tick - war.startTick > 360;
          const accept = type === 'demand' ? otherScore < -30 || longWar : otherScore < 20 || longWar;
          logDiplomacyDecision(w, other, 'peace', ['accept', 'decline'], [accept ? 1 : -1, accept ? -1 : 1],
            accept ? 'accept' : 'decline', 'warScore=' + otherScore + (longWar ? ' 長期戦' : ''));
          if (accept) {
            endWar(w, war, type);
            addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type } });
          } else {
            addAlert(w, { kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined', params: { from: nameOf(other) }, actor: other });
          }
        }
      }
      void issuer;
    },
  });

  registerCommand('acceptPeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war) return 'noWar';
      if (war.status !== 'peaceOffered') return 'notOffered';
      if (country === null) return 'badIssuer';
      if (war.offeredBy === country) return 'ownOffer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const war = w.wars.find((x) => x.id === p.warId)!;
      const demands = war.offerDemands ?? [];
      endWar(w, war, war.offerType === 'demand' ? 'demand' : 'white', demands);
      addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type: war.offerType === 'demand' ? 'demand' : 'white', demands: String(demands.length) } });
    },
  });

  registerCommand('declinePeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war) return 'noWar';
      if (war.status !== 'peaceOffered') return 'notOffered';
      if (country === null) return 'badIssuer';
      if (war.offeredBy === country) return 'ownOffer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const war = w.wars.find((x) => x.id === p.warId)!;
      const proposer = war.offeredBy;
      war.status = 'active';
      war.offeredBy = -1;
      war.offerDemands = [];
      addAlert(w, {
        kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined',
        params: { from: proposer >= 0 ? w.countries.nameJa[proposer] || w.countries.nameEn[proposer] : '' },
      });
    },
  });

  // ── phase4-diplomacy-treaties: 条約コマンド ──

  registerCommand('proposeTreaty', {
    validate(w, p, issuer) {
      const target = p.target as number;
      const type = p.type as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (!Number.isInteger(target) || target < 0 || target >= w.countries.count || !w.countries.alive[target]) return 'badTarget';
      if (target === country) return 'badTarget';
      if (!TREATY_TYPES.includes(type as TreatyType)) return 'badParams';
      if (atWar(w, country, target)) return 'atWar';
      if (activeTreatyBetween(w, country, target, type as TreatyType)) return 'alreadyActive';
      if (proposedTreatyBetween(w, country, target, type as TreatyType)) return 'alreadyProposed';
      return null;
    },
    apply(w, p, issuer) {
      const target = p.target as number;
      const type = p.type as TreatyType;
      const country = actorCountry(w, issuer)!;
      const nameOf = (c: number) => w.countries.nameJa[c] || w.countries.nameEn[c];
      if (target === w.playerCountry) {
        // プレイヤー宛 → 受諾待ち（proposed状態で保存）
        w.treaties.push({
          id: w.nextTreatyId++,
          type,
          a: Math.min(country, target),
          b: Math.max(country, target),
          startTick: w.tick,
          expiryTick: w.tick + TREATY_DURATION_DAYS,
          status: 'proposed',
          proposer: country,
        });
        addAlert(w, {
          kind: 'treatyOffered', priority: 6, msgKey: 'alert.treatyOffered',
          params: { from: nameOf(country), type }, actor: country, target,
        });
      } else {
        // AI宛 → 即時判断（決定論RNG・decisionLog記録）
        const decision = aiEvaluateTreaty(w, target, country, type);
        logDiplomacyDecision(w, target, 'treaty', ['accept', 'decline'], [decision.score, -decision.score],
          decision.accept ? 'accept' : 'decline', decision.reason);
        if (decision.accept) {
          w.treaties.push({
            id: w.nextTreatyId++,
            type,
            a: Math.min(country, target),
            b: Math.max(country, target),
            startTick: w.tick,
            expiryTick: w.tick + TREATY_DURATION_DAYS,
            status: 'active',
            proposer: country,
          });
          addAlert(w, {
            kind: 'treatyAccepted', priority: 4, msgKey: 'alert.treatyAccepted',
            params: { a: nameOf(country), b: nameOf(target), type }, actor: country, target,
          });
        } else {
          addAlert(w, {
            kind: 'treatyDeclined', priority: 3, msgKey: 'alert.treatyDeclined',
            params: { from: nameOf(target), type }, actor: target,
          });
        }
      }
      void issuer;
    },
  });

  registerCommand('acceptTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'proposed') return 'notProposed';
      if (country === null) return 'badIssuer';
      if (treaty.proposer === country) return 'ownOffer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      treaty.status = 'active';
      addAlert(w, {
        kind: 'treatyAccepted', priority: 4, msgKey: 'alert.treatyAccepted',
        params: {
          a: w.countries.nameJa[treaty.a] || w.countries.nameEn[treaty.a],
          b: w.countries.nameJa[treaty.b] || w.countries.nameEn[treaty.b],
          type: treaty.type,
        },
        actor: treaty.a, target: treaty.b,
      });
    },
  });

  registerCommand('declineTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'proposed') return 'notProposed';
      if (country === null) return 'badIssuer';
      if (treaty.proposer === country) return 'ownOffer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      treaty.status = 'annulled';
      addAlert(w, {
        kind: 'treatyDeclined', priority: 3, msgKey: 'alert.treatyDeclined',
        params: {
          from: w.countries.nameJa[treaty.b] || w.countries.nameEn[treaty.b],
          type: treaty.type,
        },
        actor: treaty.b,
      });
    },
  });

  registerCommand('annulTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'active') return 'notActive';
      if (country === null) return 'badIssuer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      const country = actorCountry(w, issuer)!;
      const other = treaty.a === country ? treaty.b : treaty.a;
      // 一方的な破棄は関係値に小さな負の影響
      applyRelationDelta(w, country, other, -5);
      annulTreaty(w, treaty, 'annulled');
    },
  });
}

export { aiCmd };
