// セーブデータの直列化・検証・復元（save-system仕様）。
// derivedCache（runtime・adjacency）は保存せず、復元時に再計算する（INV-8）。
import { encode, decode } from '@msgpack/msgpack';
import { hashWorld } from '../core/hash';
import type { WorldState } from '../core/state';
import { buildAdjacency } from '../map/adjacency';
import { recomputeSupply } from '../systems/logistics';
import { packFingerprint } from '../scenario/loader';
import type { Pack } from '../scenario/types';

export const SAVE_SCHEMA_VERSION = 4;

export interface SaveHeader {
  v: number;
  schema: string;
  packId: string;
  schemaFingerprint: string;
  seed: number;
  tick: number;
  epochDays: number;
  playerCountry: number;
  difficulty: number;
  savedAtTick: number;
  integrity: number; // hashWorld（保存時点）
}

interface SaveBlob {
  header: SaveHeader;
  stores: Record<string, unknown>;
}

function packStores(w: WorldState): Record<string, unknown> {
  return {
    tick: w.tick,
    difficulty: w.difficulty,
    playerCountry: w.playerCountry,
    epochDays: w.epochDays,
    daysPerMonth: w.daysPerMonth,
    prov: {
      owner: w.prov.owner,
      controller: w.prov.controller,
      infra: w.prov.infra,
      population: w.prov.population,
      occupancyTimer: w.occupancyTimer,
      occupierCandidate: w.occupierCandidate,
    },
    countries: {
      population: w.countries.population,
      manpowerPool: w.countries.manpowerPool,
      infEquipmentStock: w.countries.infEquipmentStock,
      artEquipmentStock: w.countries.artEquipmentStock,
      milFactories: w.countries.milFactories,
      alive: w.countries.alive,
    },
    claims: w.claims,
    relations: w.relations,
    treaties: w.treaties,
    wars: w.wars,
    units: w.units,
    fronts: w.fronts,
    commanders: w.commanders,
    productionShare: w.productionShare,
    firedEvents: w.firedEvents,
    treasury: w.treasury,
    householdPool: w.householdPool,
    aiSeq: w.runtime.aiSeq,
    eventSeq: w.runtime.eventSeq,
    seenWars: [...w.runtime.seenWars],
    taxRate: w.taxRate,
    budgetEdu: w.budgetEdu,
    gdp: w.gdp,
    livingStandard: w.livingStandard,
    literacy: w.literacy,
    unemployment: w.unemployment,
    supportRate: w.supportRate,
    stability: w.stability,
    pp: w.pp,
    laws: w.laws,
    lawQueue: w.lawQueue,
    research: w.research,
    constructionQueue: w.constructionQueue,
    foodStock: w.foodStock,
    consumerStock: w.consumerStock,
    prices: w.prices,
    scoreHistory: w.scoreHistory,
    rng: w.rng,
    anchors: w.anchors,
    journal: w.journal,
    journalStart: w.journalStart,
    counters: {
      nextUnitId: w.nextUnitId,
      nextWarId: w.nextWarId,
      nextAlertId: w.nextAlertId,
      nextFrontId: w.nextFrontId,
      nextCommanderId: w.nextCommanderId,
      nextConstructionId: w.nextConstructionId,
      nextTreatyId: w.nextTreatyId,
    },
  };
}

export function serializeWorld(w: WorldState, pack: Pack): Uint8Array {
  const header: SaveHeader = {
    v: SAVE_SCHEMA_VERSION,
    schema: 'orbis-save',
    packId: pack.manifest.id,
    schemaFingerprint: packFingerprint(pack),
    seed: w.seed,
    tick: w.tick,
    epochDays: w.epochDays,
    playerCountry: w.playerCountry,
    difficulty: w.difficulty,
    savedAtTick: w.tick,
    integrity: hashWorld(w),
  };
  const blob: SaveBlob = { header, stores: packStores(w) };
  return encode(blob);
}

export interface LoadResult {
  world: WorldState | null;
  violations: string[];
}

/** 検証つき復元。違反（バージョン・パック不一致・整合ハッシュ・参照範囲）は全件収集して拒否する。 */
export function deserializeWorld(
  buf: Uint8Array,
  pack: Pack,
): LoadResult {
  // デコードできても構造が不正な入力がある。検証・復元中の例外も
  // LoadResult に変換し、部分的に復元した状態を呼び出し元へ公開しない。
  try {
    return deserializeWorldInternal(buf, pack);
  } catch {
    return { world: null, violations: ['invalid save structure or state'] };
  }
}

function isRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function deserializeWorldInternal(buf: Uint8Array, pack: Pack): LoadResult {
  const violations: string[] = [];
  let blob: SaveBlob;
  try {
    blob = decode(buf) as SaveBlob;
  } catch (err) {
    return { world: null, violations: ['decode failed: ' + String(err)] };
  }
  if (!isRecord(blob)) return { world: null, violations: ['invalid save root'] };
  const h = blob.header;
  if (!isRecord(h)) return { world: null, violations: ['header missing or invalid'] };
  if (h.v !== SAVE_SCHEMA_VERSION) violations.push('unsupported save version: ' + h.v);
  if (h.schema !== 'orbis-save') violations.push('unknown schema: ' + h.schema);
  if (h.packId !== pack.manifest.id) violations.push('pack mismatch: ' + h.packId + ' != ' + pack.manifest.id);
  if (h.schemaFingerprint !== packFingerprint(pack)) violations.push('pack content changed since save');
  if (h.difficulty !== 0 && h.difficulty !== 1 && h.difficulty !== 2) violations.push('difficulty out of range: ' + h.difficulty);
  if (!Number.isSafeInteger(h.tick) || h.tick < 0 || h.savedAtTick !== h.tick) violations.push('invalid header tick');
  if (!Number.isSafeInteger(h.playerCountry) || h.playerCountry < 0 || h.playerCountry >= pack.countries.length) violations.push('player country out of range');
  if (violations.length > 0) return { world: null, violations };

  if (!isRecord(blob.stores)) return { world: null, violations: ['stores missing or invalid'] };
  const s = blob.stores as Record<string, any>;
  if (!isRecord(s.prov) || !isRecord(s.countries) || !isRecord(s.counters)) {
    return { world: null, violations: ['required store missing or invalid'] };
  }
  if (s.tick !== h.tick || s.epochDays !== h.epochDays || s.playerCountry !== h.playerCountry || s.difficulty !== h.difficulty) {
    return { world: null, violations: ['header and stores mismatch'] };
  }
  // 構造検証（範囲・参照）
  const provCount = pack.provinces.length;
  const ctryCount = pack.countries.length;
  const owner: number[] = s.prov.owner;
  const controller: number[] = s.prov.controller;
  if (!Array.isArray(owner) || owner.length !== provCount) violations.push('owner array size mismatch');
  if (!Array.isArray(controller) || controller.length !== provCount) violations.push('controller array size mismatch');
  if (violations.length === 0) {
    for (let i = 0; i < provCount; i++) {
      if (!Number.isInteger(owner[i]) || owner[i] < 0 || owner[i] >= ctryCount) violations.push('owner out of range at ' + i);
      if (!Number.isInteger(controller[i]) || controller[i] < -1 || controller[i] >= ctryCount) violations.push('controller out of range at ' + i);
    }
    for (const u of s.units as any[]) {
      if (!Number.isInteger(u.owner) || u.owner < 0 || u.owner >= ctryCount) violations.push('unit owner out of range: ' + u.id);
      if (!Number.isInteger(u.loc) || u.loc < 0 || u.loc >= provCount) violations.push('unit loc out of range: ' + u.id);
      if (![u.manpower, u.infEquipment, u.artEquipment].every((n) => Number.isFinite(n) && n >= 0)) violations.push('invalid stock in unit: ' + u.id);
      if (u.frontId !== undefined && u.frontId < -1) violations.push('bad frontId in unit: ' + u.id);
    }
    for (const c of s.countries.manpowerPool) if (c < 0) violations.push('negative manpowerPool');
    for (const c of s.countries.population ?? []) if (!Number.isFinite(c) || c < 0) violations.push('invalid population');
    for (const c of s.prov.population ?? []) if (!Number.isFinite(c) || c < 0) violations.push('invalid prov population');
    for (const f of (s.fronts ?? []) as any[]) {
      if (f.owner < 0 || f.owner >= ctryCount) violations.push('front owner out of range: ' + f.id);
      if (f.enemy < 0 || f.enemy >= ctryCount) violations.push('front enemy out of range: ' + f.id);
      if (!['hold', 'attack', 'retreat'].includes(f.stance)) violations.push('front stance invalid: ' + f.id);
      for (const p of f.provinces ?? []) if (p < 0 || p >= provCount) violations.push('front province out of range: ' + f.id);
      for (const t of f.targets ?? []) if (t < 0 || t >= provCount) violations.push('front target out of range: ' + f.id);
    }
    for (const c of (s.commanders ?? []) as any[]) {
      if (c.country < 0 || c.country >= ctryCount) violations.push('commander country out of range: ' + c.id);
      if (c.skill < 1 || c.skill > 5) violations.push('commander skill out of range: ' + c.id);
    }
    for (const sh of s.productionShare ?? []) if (sh < 0 || sh > 0.5) violations.push('productionShare out of range');
    for (const t of s.treasury ?? []) if (!Number.isFinite(t) || t < 0) violations.push('negative/nonfinite treasury');
    if (s.householdPool !== undefined && (!Number.isFinite(s.householdPool) || s.householdPool < 0)) violations.push('nonfinite householdPool');
    for (const r of s.taxRate ?? []) if (r < 0 || r > 0.5) violations.push('taxRate out of range');
    for (const c of (s.lawQueue ?? []) as any[]) {
      if (c && !['conscription', 'economy'].includes(c.slot)) violations.push('lawQueue slot invalid');
    }
    for (const r of (s.research ?? []) as any[]) {
      for (const a of r.active ?? []) if (a.progress < 0) violations.push('negative research progress');
    }
    for (const pr of (s.constructionQueue ?? []) as any[]) {
      if (pr.prov < 0 || pr.prov >= provCount) violations.push('construction prov out of range: ' + pr.id);
      if (pr.costPaid > pr.cost) violations.push('construction overpaid: ' + pr.id);
    }
    for (const row of s.prices ?? []) for (const v of row) if (!Number.isFinite(v) || v <= 0) violations.push('invalid price');
    for (const t of (s.treaties ?? []) as any[]) {
      if (t.a < 0 || t.a >= ctryCount || t.b < 0 || t.b >= ctryCount) violations.push('treaty country out of range: ' + t.id);
      if (!['nonaggression', 'alliance', 'trade', 'access'].includes(t.type)) violations.push('treaty type invalid: ' + t.id);
      if (!['proposed', 'active', 'annulled'].includes(t.status)) violations.push('treaty status invalid: ' + t.id);
      if (t.a >= t.b) violations.push('treaty pair unordered: ' + t.id);
    }
  }
  if (violations.length > 0) return { world: null, violations };

  // 復元（prov静的部分はパックから再構築し、動的部分はセーブから復元）
  const provIdx = new Map<string, number>();
  pack.provinces.forEach((p, i) => provIdx.set(p.id, i));
  const terrainIndex = new Map<string, number>(['plains', 'hills', 'mountains', 'urban', 'forest', 'desert'].map((t, i) => [t, i]));
  const w: WorldState = {
    seed: h.seed,
    difficulty: h.difficulty as 0 | 1 | 2,
    playerCountry: h.playerCountry,
    tick: s.tick,
    epochDays: s.epochDays,
    daysPerMonth: s.daysPerMonth,
    prov: {
      count: provCount,
      id: pack.provinces.map((p) => p.id),
      nameEn: pack.provinces.map((p) => p.nameEn),
      nameJa: pack.provinces.map((p) => p.nameJa),
      owner,
      controller,
      terrain: pack.provinces.map((p) => terrainIndex.get(p.terrain)!),
      infra: s.prov.infra ?? pack.provinces.map((p) => p.infra),
      population: s.prov.population ?? pack.provinces.map((p) => p.population),
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
      count: ctryCount,
      id: pack.countries.map((c) => c.id),
      nameEn: pack.countries.map((c) => c.nameEn),
      nameJa: pack.countries.map((c) => c.nameJa),
      color: pack.countries.map((c) => c.color),
      capital: pack.countries.map((c) => provIdx.get(c.capital)!),
      population: s.countries.population ?? pack.countries.map((c) => c.population),
      manpowerPool: s.countries.manpowerPool,
      infEquipmentStock: s.countries.infEquipmentStock,
      artEquipmentStock: s.countries.artEquipmentStock,
      milFactories: s.countries.milFactories ?? pack.countries.map((c) => c.milFactories),
      alive: s.countries.alive,
    },
    claims: s.claims,
    relations: s.relations,
    treaties: s.treaties ?? [],
    wars: s.wars,
    units: s.units,
    fronts: s.fronts ?? [],
    commanders: s.commanders ?? [],
    productionShare: s.productionShare ?? pack.countries.map(() => 0.2),
    firedEvents: s.firedEvents ?? [],
    treasury: s.treasury ?? pack.countries.map((c) => Math.round(c.population * 0.002)),
    householdPool: s.householdPool ?? pack.countries.reduce((acc, c) => acc + c.population * 0.02, 0),
    taxRate: s.taxRate ?? pack.countries.map(() => 0.2),
    budgetEdu: s.budgetEdu ?? pack.countries.map(() => 0.5),
    gdp: s.gdp ?? pack.countries.map((c) => Math.round(c.milFactories * 18 + c.population * 0.03)),
    livingStandard: s.livingStandard ?? pack.countries.map(() => 0.55),
    literacy: s.literacy ?? pack.countries.map(() => 0.8),
    unemployment: s.unemployment ?? pack.countries.map(() => 0.05),
    supportRate: s.supportRate ?? pack.countries.map(() => 0.6),
    stability: s.stability ?? pack.countries.map(() => 0.7),
    pp: s.pp ?? pack.countries.map(() => 50),
    laws: s.laws ?? pack.countries.map(() => ({ conscription: 1 as const, economy: 1 as const })),
    lawQueue: s.lawQueue ?? pack.countries.map(() => null),
    research: s.research ?? pack.countries.map(() => ({ active: [], done: [] })),
    constructionQueue: s.constructionQueue ?? [],
    foodStock: s.foodStock ?? pack.countries.map((c) => c.population * 0.05),
    consumerStock: s.consumerStock ?? pack.countries.map((c) => c.population * 0.02),
    prices: s.prices ?? [1, 5, 0.5, 1].map(() => pack.countries.map(() => 1)),
    scoreHistory: s.scoreHistory ?? {},
    occupancyTimer: s.prov.occupancyTimer,
    occupierCandidate: s.prov.occupierCandidate,
    rng: s.rng,
    anchors: s.anchors,
    journal: s.journal,
    journalStart: s.journalStart,
    nextUnitId: s.counters.nextUnitId,
    nextWarId: s.counters.nextWarId,
    nextAlertId: s.counters.nextAlertId,
    nextFrontId: s.counters.nextFrontId ?? 1,
    nextCommanderId: s.counters.nextCommanderId ?? 1,
    nextConstructionId: s.counters.nextConstructionId ?? 1,
    nextTreatyId: s.counters.nextTreatyId ?? 1,
    runtime: {
      supplyEff: new Array<number>(provCount).fill(0),
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
      aiSeq: s.aiSeq ?? {},
      eventSeq: s.eventSeq ?? 1,
      seenWars: new Set<number>(s.seenWars ?? []),
      rngCache: {},
    },
  };
  // 派生再計算 → 整合ハッシュ検証（INV-8）
  recomputeSupply(w);
  const actual = hashWorld(w);
  if (actual !== h.integrity) {
    return { world: null, violations: ['integrity mismatch: expected ' + h.integrity + ' got ' + actual] };
  }
  return { world: w, violations: [] };
}
