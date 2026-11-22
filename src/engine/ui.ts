// UIスナップショット — Worker→UIの公開状態（差分レンダリングの源）。
// エンジン状態そのものではなく、UIが必要な値の投影。
import { dailyEquipmentOutput } from './systems/production';
import type { TrainingOrder, DivisionTemplateId } from './military/templates';
import type { WorldState } from './core/state';
import { formatDate, civilFromDays } from './clock/date';
import { activeWarBetween, atWar, effectiveSupply } from './core/state';
import { refreshWeather, seasonOfMonth } from './systems/weather';
import { computeScores } from './systems/score';
import { techDefs } from './systems/research';
import { equipmentModels } from './military/equipmentCatalog';
import { contributionOf } from './diplomacy/peace';
import { warScoreFor } from './military/war';
import { unitComposition,unitCombatWidth,unitOrgCap,unitSupplyDemand,unitSpeedMultiplier } from './military/unitComposition';
import type { Alert } from './core/state';

export interface UiCountry {
  id: string;
  nameEn: string;
  nameJa: string;
  color: string;
  capital: number;
  population: number;
  manpowerPool: number;
  infEquipmentStock: number;
  artEquipmentStock: number;
  productionShare: number;
  dailyEquipment: { infantry: number; artillery: number };
  training: TrainingOrder[];
  milFactories: number;
  alive: boolean;
  divisions: number;
  atWar: number[]; // 交戦中の国家
  treasury: number;
  taxRate: number;
  budgetEdu: number;
  gdp: number;
  livingStandard: number;
  literacy: number;
  unemployment: number;
  supportRate: number;
  stability: number;
  pp: number;
  laws: { conscription: number; economy: number };
  lawPending: { slot: string; target: number; startTick: number; enactDays: number } | null;
  research: { active: { id: string; progress: number; days: number }[]; done: string[] };
  construction: { id: number; prov: number; type: string; costPaid: number; cost: number; daysProgress: number; daysTotal: number; paused: boolean }[];
  foodStock: number;
  consumerStock: number;
  scores: { military: number; economy: number; diplomacy: number; technology: number; living: number };
  scoreHistory: { tick: number; military: number; economy: number; diplomacy: number; technology: number; living: number }[];
}

export interface UiTechDef {
  id: string;
  cat: string;
  req: string[];
  days: number;
  year?: number;
  nameJa?: string;
  nameEn?: string;
  mods: Record<string, number>;
}

export interface UiFront {
  borderLinks: {from:number;to:number}[]; // 有効な戦線州から敵支配州への陸上隣接のみ
  paused: boolean;
  held: number;
  id: number;
  owner: number;
  enemy: number;
  stance: string;
  provinces: number[];
  targets: number[];
  cap: number;
  assigned: number;
}

export interface UiCommander {
  id: number;
  country: number;
  nameJa: string;
  nameEn: string;
  skill: number;
  trait: number;
  assignedUnit: number;
  exp: number;
}

export interface UiUnit {
  combatWidth: number;
  baseAttack: number;
  baseDefense: number;
  orgCap: number;
  supplyDemand: number;
  speedMultiplier: number;
  customTemplateId?: number;
  customRevision?: number;
  manualHold: boolean;
  armyId: number | null;
  manpower: number;
  maxManpower: number;
  supplyBase: number;
  supplyCapacityFactor: number;
  templateId?: DivisionTemplateId;
  id: number;
  owner: number;
  loc: number;
  moving: boolean;
  nextProvince: number;
  segmentProgress: number;
  segmentDays: number;
  target: number; // 移動先（移動中のみ有効）
  route: number[]; // 現在州から残りの実経路
  attackTargets: number[]; // 現状態で選択できる敵対隣接州（予告、適用時は再検証）
  org: number;
  strength: number; // manpower/maxManpower
  infEquipment: number;
  maxInfEquipment: number;
  artEquipment: number;
  maxArtEquipment: number;
  supply: number;
  frontId: number;
  commanderId: number;
  encircled: boolean;
  inBattle: boolean;
}

export interface UiWar {
  id: number;
  aggressor: number;
  defender: number;
  cb: boolean;
  status: string;
  days: number;
  scoreAggressor: number;
  scoreDefender: number;
  contribAggressor: number;
  contribDefender: number;
  offerDemands: number[]; // peaceOffered時の要求州
  offeredBy: number; // peaceOffered時の提案者
}

export interface UiTreaty {
  id: number;
  type: string;
  a: number;
  b: number;
  startTick: number;
  expiryTick: number;
  status: string;
  proposer: number;
}

export interface UiSnapshot {
  tick: number;
  dateStr: string;
  playerCountry: number;
  difficulty: number;
  owner: number[];
  controller: number[];
  supplyEff: number[];
  weather: number[]; // 0=晴 1=雨 2=雪 3=嵐
  season: string;
  countries: UiCountry[];
  units: UiUnit[];
  customTemplates: import('./military/customTemplates').CustomTemplateRevision[];
  armies: import('./military/armies').Army[];
  armyGroups: import('./military/armies').ArmyGroup[];
  wars: UiWar[];
  battles: number[];
  occupation: { province: number; candidate: number; days: number }[];
  fronts: UiFront[];
  commanders: UiCommander[];
  techs: UiTechDef[];
  equipmentModels: import('./scenario/types').EquipmentModelDef[];
  claims: { country: number; province: number }[];
  treaties: UiTreaty[]; // phase4-diplomacy-treaties（proposed含む全条約）
  relations: { a: number; b: number; v: number }[]; // phase4-diplomacy-treaties（UI表示用）
  alerts: Alert[]; // sinceAlertIdより新しいもの
  lastAlertId: number;
}

export interface UiMeta {
  packId: string;
  packNameEn: string;
  packNameJa: string;
  provCount: number;
  provIds: string[];
  provNameEn: string[];
  provNameJa: string[];
  provLabelX: number[];
  provLabelY: number[];
  provPop: number[];
  provTerrain: string[];
  provInfra: number[];
  provAreaKm2: number[];
  viewBbox: [number, number, number, number];
  epochY: number;
  sources: { name: string; attribution: string; license: string }[];
}

export function buildUiMeta(w: WorldState, pack: import('./scenario/types').Pack): UiMeta {
  return {
    packId: pack.manifest.id,
    packNameEn: pack.manifest.nameEn,
    packNameJa: pack.manifest.nameJa,
    provCount: w.prov.count,
    provIds: w.prov.id.slice(),
    provNameEn: w.prov.nameEn.slice(),
    provNameJa: w.prov.nameJa.slice(),
    provLabelX: w.prov.labelX.slice(),
    provLabelY: w.prov.labelY.slice(),
    provPop: w.prov.population.slice(),
    provTerrain: w.prov.terrain.map((t) => ['plains', 'hills', 'mountains', 'urban', 'forest', 'desert'][t]),
    provInfra: w.prov.infra.slice(),
    provAreaKm2: w.prov.areaKm2.slice(),
    viewBbox: pack.viewBbox,
    epochY: 2026,
    sources: pack.sources.sources.map((s) => ({ name: s.name, attribution: s.attribution, license: s.license })),
  };
}

export function buildUiSnapshot(w: WorldState, sinceAlertId: number): UiSnapshot {
  const techs = techDefs();
  const countries: UiCountry[] = [];
  for (let c = 0; c < w.countries.count; c++) {
    const atWar: number[] = [];
    for (let e = 0; e < w.countries.count; e++) {
      if (e !== c && activeWarBetween(w, c, e)) atWar.push(e);
    }
    countries.push({
      id: w.countries.id[c],
      nameEn: w.countries.nameEn[c],
      nameJa: w.countries.nameJa[c],
      color: w.countries.color[c],
      capital: w.countries.capital[c],
      population: w.countries.population[c],
      manpowerPool: w.countries.manpowerPool[c],
      infEquipmentStock: w.countries.infEquipmentStock[c],
      artEquipmentStock: w.countries.artEquipmentStock[c],
      dailyEquipment: dailyEquipmentOutput(w, c),
      training: w.trainingQueue.filter(o => o.country === c).map(o => ({ ...o })),
      productionShare: Math.round((w.productionShare[c] ?? 0.2) * 1000) / 1000,
      milFactories: w.countries.milFactories[c],
      alive: w.countries.alive[c],
      divisions: w.units.filter((u) => u.owner === c && !u.destroyed).length,
      atWar,
      treasury: Math.round(w.treasury[c]),
      taxRate: w.taxRate[c],
      budgetEdu: w.budgetEdu[c],
      gdp: w.gdp[c],
      livingStandard: Math.round(w.livingStandard[c] * 1000) / 1000,
      literacy: Math.round(w.literacy[c] * 1000) / 1000,
      unemployment: Math.round(w.unemployment[c] * 1000) / 1000,
      supportRate: Math.round(w.supportRate[c] * 1000) / 1000,
      stability: Math.round(w.stability[c] * 1000) / 1000,
      pp: Math.round(w.pp[c]),
      laws: { conscription: w.laws[c].conscription, economy: w.laws[c].economy },
      lawPending: w.lawQueue[c]
        ? { slot: w.lawQueue[c]!.slot, target: w.lawQueue[c]!.target, startTick: w.lawQueue[c]!.startTick, enactDays: w.lawQueue[c]!.enactDays }
        : null,
      research: {
        active: w.research[c].active.map((a) => {
          const def = techs.find((t) => t.id === a.id);
          return { id: a.id, progress: Math.round(a.progress), days: def?.days ?? 1 };
        }),
        done: w.research[c].done.slice(),
      },
      construction: w.constructionQueue
        .filter((pr) => pr.country === c)
        .map((pr) => ({
          id: pr.id,
          prov: pr.prov,
          type: pr.type,
          costPaid: Math.round(pr.costPaid),
          cost: pr.cost,
          daysProgress: Math.round(pr.daysProgress),
          daysTotal: pr.daysTotal,
          paused: pr.paused,
        })),
      foodStock: Math.round(w.foodStock[c]),
      consumerStock: Math.round(w.consumerStock[c]),
      scores: computeScores(w, c),
      scoreHistory: (w.scoreHistory[c] ?? []).slice(-120).map((e) => ({ ...e })),
    });
  }
  const units: UiUnit[] = w.units
    .filter((u) => !u.destroyed)
    .map((u) => ({
      id: u.id,
      combatWidth:unitCombatWidth(w,u),
      baseAttack:unitComposition(w,u)?.attack ?? 40*(u.maxManpower/10000),
      baseDefense:unitComposition(w,u)?.defense ?? 40*(u.maxManpower/10000),
      orgCap:unitOrgCap(w,u),
      supplyDemand:unitSupplyDemand(w,u),
      speedMultiplier:unitSpeedMultiplier(w,u),
      templateId: u.templateId,
      customTemplateId: u.customTemplateId, customRevision: u.customRevision,
      armyId: u.armyId ?? null,
      manualHold: u.manualHold ?? false,
      manpower: u.manpower, maxManpower: u.maxManpower,
      supplyBase: w.runtime.supplyEff[u.loc], supplyCapacityFactor: w.runtime.unitSupplyFactor.get(u.id) ?? 1,
      owner: u.owner,
      loc: u.loc,
      moving: u.path.length > 0,
      nextProvince: u.path.length > 0 ? u.path[u.segIdx+1] : -1,
      segmentProgress: u.segProgress,
      segmentDays: u.segDays,
      target: u.path.length > 0 ? u.path[u.path.length - 1] : -1,
      route: u.path.length > 0 ? [u.loc, ...u.path.slice(u.segIdx + 1)] : [],
      attackTargets: u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc) ||
        u.org <= 0 || w.prov.controller[u.loc] !== u.owner ? [] :
        w.adj.targets.slice(w.adj.offsets[u.loc], w.adj.offsets[u.loc + 1]).filter((p, i) =>
          !w.adj.strait[w.adj.offsets[u.loc] + i] && atWar(w, u.owner, w.prov.controller[p])),
      org: u.org,
      strength: u.maxManpower > 0 ? Math.round((u.manpower / u.maxManpower) * 1000) / 1000 : 0,
      infEquipment: u.infEquipment,
      maxInfEquipment: u.maxInfEquipment,
      artEquipment: u.artEquipment,
      maxArtEquipment: u.maxArtEquipment,
      supply: effectiveSupply(w, u),
      frontId: u.frontId,
      commanderId: u.commanderId,
      encircled: u.encircled,
      inBattle: w.runtime.activeBattles.has(u.loc),
    }));
  const fronts: UiFront[] = w.fronts.map((f) => ({
    id: f.id,
    paused: f.paused ?? false,
    held: w.units.filter(u => !u.destroyed && u.frontId === f.id && u.manualHold).length,
    owner: f.owner,
    enemy: f.enemy,
    stance: f.stance,
    borderLinks: atWar(w,f.owner,f.enemy) ? [...new Set(f.provinces)].filter(p=>w.prov.controller[p]===f.owner).sort((a,b)=>a-b).flatMap(from=>w.adj.targets.slice(w.adj.offsets[from],w.adj.offsets[from+1]).filter((to,i)=>!w.adj.strait[w.adj.offsets[from]+i]&&w.prov.controller[to]===f.enemy).sort((a,b)=>a-b).map(to=>({from,to}))) : [],
    provinces: f.provinces.slice(),
    targets: f.targets.slice(),
    cap: f.cap,
    assigned: w.units.filter((u) => !u.destroyed && u.frontId === f.id).length,
  }));
  const commanders: UiCommander[] = w.commanders.map((c) => ({
    id: c.id,
    country: c.country,
    nameJa: c.nameJa,
    nameEn: c.nameEn,
    skill: c.skill,
    trait: c.trait,
    assignedUnit: c.assignedUnit,
    exp: Math.round(c.exp * 1000) / 1000,
  }));
  const wars: UiWar[] = w.wars
    .filter((war) => war.status !== 'ended')
    .map((war) => ({
      id: war.id,
      aggressor: war.aggressor,
      defender: war.defender,
      cb: war.cb,
      status: war.status,
      days: w.tick - war.startTick,
      scoreAggressor: warScoreFor(w, war, war.aggressor),
      scoreDefender: warScoreFor(w, war, war.defender),
      contribAggressor: Math.round(contributionOf(war, war.aggressor) * 100) / 100,
      contribDefender: Math.round(contributionOf(war, war.defender) * 100) / 100,
      offerDemands: (war.offerDemands ?? []).slice(),
      offeredBy: war.offeredBy,
    }));
  const treaties: UiTreaty[] = w.treaties.map((t) => ({
    id: t.id,
    type: t.type,
    a: t.a,
    b: t.b,
    startTick: t.startTick,
    expiryTick: t.expiryTick,
    status: t.status,
    proposer: t.proposer,
  }));
  const alerts = w.runtime.alerts.filter((a) => a.id > sinceAlertId);
  return {
    tick: w.tick,
    dateStr: formatDate(w.epochDays + w.tick),
    playerCountry: w.playerCountry,
    difficulty: w.difficulty,
    owner: w.prov.owner.slice(),
    controller: w.prov.controller.slice(),
    supplyEff: w.runtime.supplyEff.map((e) => Math.round(e * 1000) / 1000),
    weather: (refreshWeather(w), w.runtime.weatherByProv.slice()),
    season: seasonOfMonth(civilFromDays(w.epochDays + w.tick).m),
    countries,
    units,
    customTemplates: w.customTemplates.map(t=>({...t,battalionIds:t.battalionIds.slice(),supportIds:t.supportIds.slice()})),
    armies: w.armies.map(a => ({...a})), armyGroups: w.armyGroups.map(g => ({...g})),
    wars,
    battles: [...w.runtime.activeBattles].sort((a,b) => a-b),
    occupation: w.occupancyTimer.flatMap((days, province) => days > 0 ? [{province, candidate: w.occupierCandidate[province], days}] : []),
    fronts,
    commanders,
    techs: techs.map((t) => ({ id: t.id, cat: t.cat, req: t.req.slice(), days: t.days, year: t.year, nameJa: t.nameJa, nameEn: t.nameEn, mods: { ...t.mods } })),
    equipmentModels: equipmentModels().map(m => ({ ...m })),
    claims: w.claims.slice(),
    treaties,
    relations: w.relations.map((r) => ({ a: r.a, b: r.b, v: Math.round(r.v) })),
    alerts,
    lastAlertId: w.nextAlertId - 1,
  };
}
