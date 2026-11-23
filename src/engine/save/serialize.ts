// セーブデータの直列化・検証・復元（save-system仕様）。
// derivedCache（runtime・adjacency）は保存せず、復元時に再計算する（INV-8）。
import { encode, decode } from '@msgpack/msgpack';
import { divisionTemplate, MAX_TRAINING } from '../military/templates';
import { commandIssuerKey, validSequence, legacyWatermarks } from '../core/sequence';
import { previewTemplate } from '../military/templateStats';
import { validateCustomTemplates } from '../military/customTemplates';
import { validateHierarchy } from '../military/armies';
import { legacyProductionLineState, validateProductionLineState } from '../systems/productionLineState';
import { validateModelProductionLedger } from '../systems/modelProductionLedger';
import { validateModelWarehouse } from '../systems/modelWarehouse';
import { validateIssuedEquipment } from '../systems/issuedEquipment';
import { hashWorld } from '../core/hash';
import type { WorldState } from '../core/state';
import { buildAdjacency } from '../map/adjacency';
import { recomputeSupply } from '../systems/logistics';
import { packFingerprint } from '../scenario/loader';
import type { Pack } from '../scenario/types';

export const SAVE_SCHEMA_VERSION = 20;

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
  payloadChecksum?: number;
}

/** CRC-32 of the deterministic MessagePack payload; corruption detection, not authentication. */
export function savePayloadChecksum(header: SaveHeader, stores: Record<string, unknown>): number {
  let crc = 0xffffffff;
  for (const byte of encode({ header, stores })) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
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
    armies: w.armies, armyGroups: w.armyGroups,
    trainingQueue: w.trainingQueue,
    customTemplates: w.customTemplates,
    fronts: w.fronts,
    commanders: w.commanders,
    productionShare: w.productionShare,
    productionLines: w.productionLines,
    productionMode: w.productionMode,
    modelProduction: w.modelProduction,
    modelStock: w.modelStock,
    issuedEquipment: w.issuedEquipment,
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
    commandWatermarks: w.commandWatermarks,
    pendingCommands: w.runtime.commandsSinceLastTick,
    journalStart: w.journalStart,
    counters: {
      nextUnitId: w.nextUnitId,
      nextCustomTemplateId: w.nextCustomTemplateId,
      nextArmyId: w.nextArmyId, nextArmyGroupId: w.nextArmyGroupId,
      nextWarId: w.nextWarId,
      nextAlertId: w.nextAlertId,
      nextFrontId: w.nextFrontId,
      nextCommanderId: w.nextCommanderId,
      nextConstructionId: w.nextConstructionId,
      nextTreatyId: w.nextTreatyId,
      nextProductionLineId: w.nextProductionLineId,
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
  const stores = packStores(w);
  const blob: SaveBlob = { header, stores, payloadChecksum: savePayloadChecksum(header, stores) };
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
  if (h.v !== SAVE_SCHEMA_VERSION && h.v !== 19 && h.v !== 18 && h.v !== 17 && h.v !== 16 && h.v !== 15 && h.v !== 14 && h.v !== 13 && h.v !== 12 && h.v !== 11 && h.v !== 10 && h.v !== 9 && h.v !== 8 && h.v !== 7 && h.v !== 6 && h.v !== 5 && h.v !== 4) violations.push('unsupported save version: ' + h.v);
  if (h.schema !== 'orbis-save') violations.push('unknown schema: ' + h.schema);
  if (h.packId !== pack.manifest.id) violations.push('pack mismatch: ' + h.packId + ' != ' + pack.manifest.id);
  if (h.schemaFingerprint !== packFingerprint(pack)) violations.push('pack content changed since save');
  if (h.difficulty !== 0 && h.difficulty !== 1 && h.difficulty !== 2) violations.push('difficulty out of range: ' + h.difficulty);
  if (!Number.isSafeInteger(h.tick) || h.tick < 0 || h.savedAtTick !== h.tick) violations.push('invalid header tick');
  if (!Number.isSafeInteger(h.playerCountry) || h.playerCountry < 0 || h.playerCountry >= pack.countries.length) violations.push('player country out of range');
  if (violations.length > 0) return { world: null, violations };

  if (!isRecord(blob.stores)) return { world: null, violations: ['stores missing or invalid'] };
  if (h.v >= 5) {
    if (!Number.isInteger(blob.payloadChecksum) || blob.payloadChecksum !== savePayloadChecksum(h, blob.stores)) {
      return { world: null, violations: ['save payload checksum mismatch'] };
    }
    // v5以降は本エンジンの決定論的なMessagePack表現を唯一の書式とする。
    // 重複キーや代替バイト表現などデコード時に失われる差異も拒否する。
    const canonical = encode({ header: h, stores: blob.stores, payloadChecksum: blob.payloadChecksum });
    if (canonical.length !== buf.length || canonical.some((v, i) => v !== buf[i])) {
      return { world: null, violations: ['noncanonical save payload'] };
    }
  } else if (blob.payloadChecksum !== undefined) {
    return { world: null, violations: ['v4 contains v5 checksum'] };
  }
  const s = blob.stores as Record<string, any>;
  if (!isRecord(s.prov) || !isRecord(s.countries) || !isRecord(s.counters)) {
    return { world: null, violations: ['required store missing or invalid'] };
  }
  if (s.tick !== h.tick || s.epochDays !== h.epochDays || s.playerCountry !== h.playerCountry || s.difficulty !== h.difficulty) {
    return { world: null, violations: ['header and stores mismatch'] };
  }
  if (h.v === 4 && (s.trainingQueue !== undefined || (Array.isArray(s.units) && s.units.some((u: any) => u?.templateId !== undefined)))) return { world: null, violations: ['v4 contains v5 data'] };
  if (h.v >= 5 && !Array.isArray(s.trainingQueue)) return { world: null, violations: ['training queue missing'] };
  if (h.v < 6 && (s.commandWatermarks !== undefined || s.pendingCommands !== undefined)) return { world: null, violations: ['legacy save contains v6 commands'] };
  // 構造検証（範囲・参照）
  const provCount = pack.provinces.length;
  const ctryCount = pack.countries.length;
  if (!Array.isArray(s.journal) || s.journal.some((entry: any) => !isRecord(entry) || !validSequence(entry.seq) || (entry.issuer !== 'event' && commandIssuerKey(entry.issuer, ctryCount) === null))) return { world: null, violations: ['invalid command journal'] };
  if (s.aiSeq !== undefined && (!isRecord(s.aiSeq) || Object.entries(s.aiSeq).some(([key, seq]) => (key !== '-1' && commandIssuerKey('ai:' + key, ctryCount) === null) || !validSequence(seq)))) return { world: null, violations: ['invalid AI sequence counters'] };
  if (s.eventSeq !== undefined && !validSequence(s.eventSeq)) return { world: null, violations: ['invalid event sequence counter'] };
  if (h.v >= 6) {
    if (!isRecord(s.commandWatermarks) || Object.entries(s.commandWatermarks).some(([issuer, seq]) => commandIssuerKey(issuer, ctryCount) === null || !validSequence(seq))) return { world: null, violations: ['invalid command watermarks'] };
    if (s.journal.some((entry: any) => entry.issuer !== 'event' && (s.commandWatermarks[entry.issuer] ?? 0) < entry.seq)) return { world: null, violations: ['watermark behind journal'] };
    if (!Array.isArray(s.pendingCommands) || s.pendingCommands.some((cmd: any) => !isRecord(cmd) || commandIssuerKey(cmd.issuer, ctryCount) === null || !validSequence(cmd.seq) || typeof cmd.type !== 'string' || !isRecord(cmd.p))) return { world: null, violations: ['invalid pending commands'] };
  }
  if (h.v >= 7 && (!Array.isArray(s.armies) || !Array.isArray(s.armyGroups) || !validSequence(s.counters.nextArmyId) || !validSequence(s.counters.nextArmyGroupId))) return { world: null, violations: ['invalid army hierarchy stores'] };
  if (h.v < 7 && (s.armies !== undefined || s.armyGroups !== undefined || s.counters.nextArmyId !== undefined || s.counters.nextArmyGroupId !== undefined || (Array.isArray(s.units) && s.units.some((u: any) => u?.armyId !== undefined)))) return { world: null, violations: ['legacy save contains v7 hierarchy'] };
  if(h.v>=10 && (!Array.isArray(s.customTemplates) || !isRecord(s.counters) || !validSequence(s.counters.nextCustomTemplateId)))
    return {world:null,violations:['invalid custom template stores']};
  if(h.v<10&&(s.customTemplates!==undefined||s.counters.nextCustomTemplateId!==undefined))
    return {world:null,violations:['legacy save contains v10 custom templates']};
  if (h.v >= 14 && (!Array.isArray(s.productionLines) ||
    !validSequence(s.counters.nextProductionLineId)))
    return { world:null, violations:['invalid v14 production line stores'] };
  if (h.v < 14 && (s.productionLines !== undefined || s.counters.nextProductionLineId !== undefined))
    return { world:null, violations:['legacy save contains v14 production line stores'] };
  if(h.v>=15 && (!Array.isArray(s.productionMode)||
    s.productionMode.length!==ctryCount||
    s.productionMode.some((mode:unknown)=>mode!=='legacy'&&mode!=='lines')))
    return {world:null,violations:['invalid v15 production mode']};
  if(h.v<15&&s.productionMode!==undefined)
    return {world:null,violations:['legacy save contains v15 production mode']};
  if(h.v>=16){
    const errors=validateModelProductionLedger(s.modelProduction,pack.equipmentModels??[],ctryCount);
    if(errors.length)return {world:null,violations:errors};
  } else if(s.modelProduction!==undefined) {
    return {world:null,violations:['legacy save contains v16 production ledger']};
  }
  if(h.v>=17){
    const errors=validateModelWarehouse(s.modelStock,pack.equipmentModels??[],
      ctryCount,s.countries.infEquipmentStock,s.countries.artEquipmentStock);
    if(errors.length)return {world:null,violations:errors};
  } else if(s.modelStock!==undefined){
    return {world:null,violations:['legacy save contains v17 warehouse']};
  }
  if(h.v>=18 && !Array.isArray(s.issuedEquipment))
    return {world:null,violations:['missing v18 issued equipment ledger']};
  if(h.v<18&&s.issuedEquipment!==undefined)
    return {world:null,violations:['legacy save contains v18 issued equipment']};
  const owner: number[] = s.prov.owner;
  const controller: number[] = s.prov.controller;
  if (!Array.isArray(owner) || owner.length !== provCount) violations.push('owner array size mismatch');
  if (!Array.isArray(controller) || controller.length !== provCount) violations.push('controller array size mismatch');
  if (violations.length === 0) {
    for (let i = 0; i < provCount; i++) {
      if (!Number.isInteger(owner[i]) || owner[i] < 0 || owner[i] >= ctryCount) violations.push('owner out of range at ' + i);
      if (!Number.isInteger(controller[i]) || controller[i] < -1 || controller[i] >= ctryCount) violations.push('controller out of range at ' + i);
    }
    const ids = new Set<number>();
    const next = s.counters.nextUnitId;
    if (!Number.isSafeInteger(next) || next < 1) violations.push('invalid nextUnitId');
    for (const u of s.units as any[]) {
      if (!Number.isSafeInteger(u.id) || u.id < 1 || u.id >= next || ids.has(u.id)) violations.push('invalid unit id');
      ids.add(u.id);
      if (u.customTemplateId!==undefined||u.customRevision!==undefined) {
        const rev=(s.customTemplates??[]).find((t: any)=>t&&t.country===u.owner&&t.templateId===u.customTemplateId&&t.revision===u.customRevision);
        const check=rev?previewTemplate({battalionIds:rev.battalionIds,supportIds:rev.supportIds}):null;
        if(h.v<11||u.templateId!==undefined||!Number.isSafeInteger(u.customTemplateId)||!Number.isSafeInteger(u.customRevision)||!check?.ok ||
          u.maxManpower!==check.stats.manpower||u.maxInfEquipment!==check.stats.infantry||u.maxArtEquipment!==check.stats.artillery)
          violations.push('invalid custom division unit');
      }
      if (u.templateId !== undefined) {
        const t = divisionTemplate(u.templateId);
        if (!t || u.maxManpower !== t.manpower || u.maxInfEquipment !== t.infantry || u.maxArtEquipment !== t.artillery) violations.push('invalid unit template');
      }
      if (!Number.isInteger(u.owner) || u.owner < 0 || u.owner >= ctryCount) violations.push('unit owner out of range: ' + u.id);
      if (!Number.isInteger(u.loc) || u.loc < 0 || u.loc >= provCount) violations.push('unit loc out of range: ' + u.id);
      if (![u.manpower, u.infEquipment, u.artEquipment].every((n) => Number.isFinite(n) && n >= 0)) violations.push('invalid stock in unit: ' + u.id);
      if ((h.v < 8 && u.manualHold !== undefined) || (u.manualHold !== undefined && typeof u.manualHold !== 'boolean')) violations.push('invalid manual hold');
      if((h.v<19&&u.frontlinePriority!==undefined)||
        (u.frontlinePriority!==undefined&&
          (!Number.isSafeInteger(u.frontlinePriority)||u.frontlinePriority<0||u.frontlinePriority>9)))
        violations.push('invalid unit frontline priority');
      // v20 adds two integer, bounded persistent combat preparation fields.
      // A v19 or older save must not silently inject later-version bonuses.
      if(h.v<20&&(u.entrenchment!==undefined||u.preparation!==undefined))
        violations.push('legacy save contains v20 combat preparedness');
      if(h.v>=20&&(
        (u.entrenchment!==undefined&&(!Number.isSafeInteger(u.entrenchment)||u.entrenchment<0||u.entrenchment>6))||
        (u.preparation!==undefined&&(!Number.isSafeInteger(u.preparation)||u.preparation<0||u.preparation>5))))
        violations.push('invalid unit combat preparedness');
      if (u.frontId !== undefined && u.frontId < -1) violations.push('bad frontId in unit: ' + u.id);
    }
    const counts = new Array<number>(ctryCount).fill(0);
    for (const o of s.trainingQueue ?? []) {
      const custom = o && (o.customTemplateId!==undefined||o.customRevision!==undefined);
      const rev=custom?(s.customTemplates??[]).find((t:any)=>t&&t.country===o.country&&t.templateId===o.customTemplateId&&t.revision===o.customRevision):null;
      const check=rev?previewTemplate({battalionIds:rev.battalionIds,supportIds:rev.supportIds}):null;
      const validTemplate=custom ? (h.v>=11&&o.templateId===undefined&&Number.isSafeInteger(o.customTemplateId)&&Number.isSafeInteger(o.customRevision)&&check?.ok) : !!divisionTemplate(o?.templateId);
      const daysLimit=custom?180:60;
      const modern=!!o&&o.status!==undefined;
      const stateOk=modern ? (h.v>=13&&['queued','training','ready'].includes(o.status)&&Number.isInteger(o.priority)&&o.priority>=0&&o.priority<=9&&typeof o.autoDeploy==='boolean') : (!o||o.priority===undefined&&o.autoDeploy===undefined);
      const timeOk=modern ? (o.status==='queued'?o.readyTick===-1:o.status==='ready'?Number.isSafeInteger(o.readyTick)&&o.readyTick>=0&&o.readyTick<=h.tick:Number.isSafeInteger(o.readyTick)&&o.readyTick>h.tick&&o.readyTick<=h.tick+daysLimit) : (Number.isSafeInteger(o?.readyTick)&&o.readyTick>h.tick&&o.readyTick<=h.tick+daysLimit);
      if (!o || !stateOk || !timeOk || !Number.isSafeInteger(o.id) || o.id < 1 || o.id >= next || ids.has(o.id) || !Number.isInteger(o.country) || o.country < 0 || o.country >= ctryCount || !Number.isInteger(o.province) || o.province < 0 || o.province >= provCount || !validTemplate)  { violations.push('invalid training order'); continue; }
      ids.add(o.id);
      if (++counts[o.country] > MAX_TRAINING) violations.push('training queue limit');
    }
    for (const c of s.countries.manpowerPool) if (c < 0) violations.push('negative manpowerPool');
    for (const c of s.countries.population ?? []) if (!Number.isFinite(c) || c < 0) violations.push('invalid population');
    for (const c of s.prov.population ?? []) if (!Number.isFinite(c) || c < 0) violations.push('invalid prov population');
    for (const f of (s.fronts ?? []) as any[]) {
      if ((h.v < 8 && (f.paused !== undefined || f.revision !== undefined)) || (f.paused !== undefined && typeof f.paused !== 'boolean') || (f.revision !== undefined && (!Number.isSafeInteger(f.revision) || f.revision < 1))) violations.push('invalid front control');
      if (f.owner < 0 || f.owner >= ctryCount) violations.push('front owner out of range: ' + f.id);
      if (f.enemy < 0 || f.enemy >= ctryCount) violations.push('front enemy out of range: ' + f.id);
      if (!['hold', 'attack', 'counterattack', 'retreat'].includes(f.stance)) violations.push('front stance invalid: ' + f.id);
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
    armies: s.armies ?? [], armyGroups: s.armyGroups ?? [],
    nextArmyId: s.counters.nextArmyId ?? 1, nextArmyGroupId: s.counters.nextArmyGroupId ?? 1,
    trainingQueue: s.trainingQueue ?? [],
    customTemplates: s.customTemplates ?? [], nextCustomTemplateId: s.counters.nextCustomTemplateId ?? 1,
    fronts: s.fronts ?? [],
    commanders: s.commanders ?? [],
    productionShare: s.productionShare ?? pack.countries.map(() => 0.2),
    productionMode: h.v>=15 ? s.productionMode : pack.countries.map(()=>'legacy' as const),
    modelProduction: h.v>=16 ? s.modelProduction : [],
    modelStock: h.v>=17 ? s.modelStock : [],
    issuedEquipment: h.v>=18 ? s.issuedEquipment : [],
    ...(h.v >= 14 ? {productionLines:s.productionLines,nextProductionLineId:s.counters.nextProductionLineId} :
      legacyProductionLineState(s.countries.milFactories ?? pack.countries.map(c=>c.milFactories),
        s.productionShare ?? pack.countries.map(()=>0.2),pack.equipmentModels??[])),
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
    commandWatermarks: s.commandWatermarks ?? {},
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
      commandsSinceLastTick: s.pendingCommands ?? [],
      aiSeq: s.aiSeq ?? {},
      eventSeq: s.eventSeq ?? 1,
      seenWars: new Set<number>(s.seenWars ?? []),
      rngCache: {},
    },
  };
  // 派生再計算 → 整合ハッシュ検証（INV-8）
  recomputeSupply(w);
  if(h.v<9&&[...w.armies,...w.armyGroups].some(f=>f.commanderId!==undefined))return {world:null,violations:['legacy save contains v9 formation commanders']};
  if(h.v<12&&w.armies.some(a=>a.reinforcementPriority!==undefined))return {world:null,violations:['legacy save contains v12 reinforcement priority']};
  const issuedErrors=validateIssuedEquipment(w,pack.equipmentModels??[]);
  if(issuedErrors.length)return {world:null,violations:issuedErrors};
  const lineErrors=validateProductionLineState(w,pack.equipmentModels??[],w.countries.count);
  if(lineErrors.length)return {world:null,violations:lineErrors};
  const templateErrors=validateCustomTemplates(w);
  if(templateErrors.length)return {world:null,violations:templateErrors};
  const hierarchyErrors = validateHierarchy(w);
  if (hierarchyErrors.length) return { world: null, violations: hierarchyErrors };
  const actual = hashWorld(w, h.v < 6, h.v >= 7, h.v >= 8, h.v >= 9, h.v >= 10, h.v >= 11, h.v >= 12, h.v >= 13, h.v >= 14, h.v >= 15, h.v >= 16, h.v >= 17, h.v >= 18, h.v >= 19, h.v >= 20);
  if (actual !== h.integrity) {
    return { world: null, violations: ['integrity mismatch: expected ' + h.integrity + ' got ' + actual] };
  }
  if (h.v < 6) w.commandWatermarks = legacyWatermarks(w);
  return { world: w, violations: [] };
}
