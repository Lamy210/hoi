// シナリオパック → WorldState 構築（scenario-system仕様の「初期状態の構築」）。
// 参照整合を再検証し、違反は全件収集して拒否する。
import type { Pack } from './types';
import type { WorldState } from '../core/state';
import { TERRAIN } from '../core/state';
import { buildAdjacency } from '../map/adjacency';
import { recomputeSupply } from '../systems/logistics';
import {portCapacitiesFromPack} from '../naval/portDefense';
import { UNIT_MAX_ART_EQUIPMENT, UNIT_MAX_INF_EQUIPMENT, UNIT_MAX_MANPOWER } from './unitCosts';
import { generateCommanders } from '../military/commanders';
import { legacyProductionLineState } from '../systems/productionLineState';

export class WorldBuildError extends Error {
  violations: string[];
  constructor(v: string[]) {
    super('world build failed: ' + v.length + ' violation(s)');
    this.violations = v;
  }
}

export interface BuildOptions {
  seed: number;
  playerCountryId: string;
  difficulty: 0 | 1 | 2;
}

export function buildWorld(pack: Pack, opts: BuildOptions): WorldState {
  const violations: string[] = [];
  const provIdx = new Map<string, number>();
  pack.provinces.forEach((p, i) => provIdx.set(p.id, i));
  const ctryIdx = new Map<string, number>();
  pack.countries.forEach((c, i) => ctryIdx.set(c.id, i));

  if (!ctryIdx.has(opts.playerCountryId)) violations.push('playerCountry not found: ' + opts.playerCountryId);

  for (const p of pack.provinces) {
    if (!ctryIdx.has(p.owner)) violations.push('province ' + p.id + ': unknown owner ' + p.owner);
  }
  for (const c of pack.countries) {
    if (!provIdx.has(c.capital)) violations.push('country ' + c.id + ': capital missing ' + c.capital);
    else {
      const cap = pack.provinces[provIdx.get(c.capital)!];
      if (cap.owner !== c.id) violations.push('country ' + c.id + ': capital not owned');
    }
    for (const cl of c.claims) {
      if (!provIdx.has(cl)) violations.push('country ' + c.id + ': claim missing ' + cl);
    }
    for (const sd of c.startDivisions) {
      for (const at of sd.at) {
        const idx = provIdx.get(at);
        if (idx === undefined) violations.push('country ' + c.id + ': startDivision province missing ' + at);
        else if (pack.provinces[idx].owner !== c.id)
          violations.push('country ' + c.id + ': startDivision not owned ' + at);
      }
    }
  }
  if (violations.length > 0) throw new WorldBuildError(violations);

  const n = pack.provinces.length;
  const terrainIndex = new Map<string, number>(TERRAIN.map((t, i) => [t, i]));

  const w: WorldState = {
    seed: opts.seed,
    difficulty: opts.difficulty,
    playerCountry: ctryIdx.get(opts.playerCountryId)!,
    tick: 0,
    epochDays: 0, // engine.tsがmanifestから設定
    daysPerMonth: pack.manifest.daysPerMonth,
    prov: {
      count: n,
      id: pack.provinces.map((p) => p.id),
      nameEn: pack.provinces.map((p) => p.nameEn),
      nameJa: pack.provinces.map((p) => p.nameJa),
      owner: pack.provinces.map((p) => ctryIdx.get(p.owner)!),
      controller: pack.provinces.map((p) => ctryIdx.get(p.owner)!),
      terrain: pack.provinces.map((p) => terrainIndex.get(p.terrain)!),
      infra: pack.provinces.map((p) => p.infra),
      population: pack.provinces.map((p) => p.population),
      cx: pack.provinces.map((p) => p.centroid[0]),
      cy: pack.provinces.map((p) => p.centroid[1]),
      cosLat: pack.provinces.map((p) => p.cosLat),
      areaKm2: pack.provinces.map((p) => p.areaKm2),
      coastal: pack.provinces.map((p) => p.coastal),
      labelX: pack.provinces.map((p) => p.label[0]),
      labelY: pack.provinces.map((p) => p.label[1]),
    },
    adj: buildAdjacency(pack, provIdx),
    countries: {
      count: pack.countries.length,
      id: pack.countries.map((c) => c.id),
      nameEn: pack.countries.map((c) => c.nameEn),
      nameJa: pack.countries.map((c) => c.nameJa),
      color: pack.countries.map((c) => c.color),
      capital: pack.countries.map((c) => provIdx.get(c.capital)!),
      population: pack.countries.map((c) => c.population),
      manpowerPool: pack.countries.map((c) => Math.round(c.population * 0.005)),
      infEquipmentStock: pack.countries.map((c) => c.milFactories * 500),
      artEquipmentStock: pack.countries.map((c) => c.milFactories * 100),
      milFactories: pack.countries.map((c) => c.milFactories),
      alive: pack.countries.map(() => true),
    },
    claims: [],
    relations: [],
    treaties: [],
    wars: [],
    units: [],
    armies: [], armyGroups: [], nextArmyId: 1, nextArmyGroupId: 1,
    trainingQueue: [],
    customTemplates: [], nextCustomTemplateId: 1,
    fronts: [],
    garrisons: [],
    commanders: [],
    productionShare: pack.countries.map(() => 0.2),
    productionMode: pack.countries.map(() => 'legacy' as const),
    modelProduction: [],
    modelStock: [],
    issuedEquipment: [],
    ...legacyProductionLineState(pack.countries.map(c=>c.milFactories),pack.countries.map(()=>0.2),pack.equipmentModels??[]),
    firedEvents: [],
    // phase3: 国家・経済運営の初期値
    treasury: pack.countries.map((c) => Math.round(c.population * 0.002)),
    householdPool: pack.countries.reduce((acc, c) => acc + c.population * 0.02, 0),
    taxRate: pack.countries.map(() => 0.2),
    budgetEdu: pack.countries.map(() => 0.5),
    gdp: pack.countries.map((c) => Math.round(c.milFactories * 30 * 2 * 0.3 + c.population * 0.001 * 30)),
    livingStandard: pack.countries.map(() => 0.55),
    literacy: pack.countries.map(() => 0.8),
    unemployment: pack.countries.map(() => 0.05),
    supportRate: pack.countries.map(() => 0.6),
    stability: pack.countries.map(() => 0.7),
    pp: pack.countries.map(() => 50),
    laws: pack.countries.map(() => ({ conscription: 1 as const, economy: 1 as const })),
    lawQueue: pack.countries.map(() => null),
    research: pack.countries.map(() => ({ active: [], done: [] })),
    constructionQueue: [],
    foodStock: pack.countries.map((c) => c.population * 0.05),
    consumerStock: pack.countries.map((c) => c.population * 0.02),
    prices: [
      pack.countries.map(() => 1.0), // 歩兵装備
      pack.countries.map(() => 5.0), // 火砲
      pack.countries.map(() => 0.5), // 食料
      pack.countries.map(() => 1.0), // 消費財
    ],
    scoreHistory: {},
    occupancyTimer: new Array<number>(n).fill(0),
    occupierCandidate: new Array<number>(n).fill(-1),
    rng: {},
    anchors: [],
    journal: [],
    commandWatermarks: {},
    journalStart: 0,
    nextUnitId: 1,
    nextWarId: 1,
    nextAlertId: 1,
    nextFrontId: 1,
    nextGarrisonId: 1,
    nextCommanderId: 1,
    nextConstructionId: 1,
    nextTreatyId: 1,
    runtime: {
      portCapacities:portCapacitiesFromPack(pack),
      supplyEff: new Array<number>(n).fill(0),
      graphEff: new Map<number, number[]>(),
      unitSupplyFactor: new Map<number, number>(),
      supplyDirty: true,
      activeBattles: new Set<number>(),
      weatherWeek: -1,
      weatherByProv: [],
      decisionLog: {},
      alerts: [],
      alertsSeenByUi: 0,
      commandsSinceLastTick: [],
      aiSeq: {},
      eventSeq: 1,
      seenWars: new Set<number>(),
      rngCache: {},
    },
  };

  // 領有主張
  for (const c of pack.countries) {
    for (const cl of c.claims) {
      w.claims.push({ country: ctryIdx.get(c.id)!, province: provIdx.get(cl)! });
    }
  }
  // 初期関係値
  for (const [key, v] of Object.entries(pack.relations)) {
    const [as, bs] = key.split(':');
    const a = ctryIdx.get(as);
    const b = ctryIdx.get(bs);
    if (a === undefined || b === undefined) {
      violations.push('relation references unknown country: ' + key);
      continue;
    }
    w.relations.push({ a: Math.min(a, b), b: Math.max(a, b), v });
  }
  // 開始師団（コマンドを介さない初期状態。コストは請求しない）
  for (const c of pack.countries) {
    const ci = ctryIdx.get(c.id)!;
    for (const sd of c.startDivisions) {
      for (const at of sd.at) {
        for (let k = 0; k < sd.count; k++) {
          w.units.push({
            id: w.nextUnitId++,
            owner: ci,
            loc: provIdx.get(at)!,
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
            org: 100,
            exp: 0,
            frontId: -1,
            commanderId: -1,
            encircled: false,
            destroyed: false,
          });
        }
      }
    }
  }

  if (violations.length > 0) throw new WorldBuildError(violations);

  // 指揮官の決定論生成（phase2-equipment-production）
  generateCommanders(w);
  // 派生値の初期計算
  recomputeSupply(w);
  return w;
}
