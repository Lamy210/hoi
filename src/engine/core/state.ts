import { clamp } from './num';

// WorldState — ゲームの全状態（決定論・セーブ可能）。
// docs/07 データモデル準拠。派生キャッシュ（補給等）はセーブに含めず復元時に再計算する。

import type { RngState } from './rng';

export const TERRAIN = ['plains', 'hills', 'mountains', 'urban', 'forest', 'desert'] as const;
export type TerrainId = (typeof TERRAIN)[number];

export interface Unit {
  templateId?: import('../military/templates').DivisionTemplateId;
  id: number;
  owner: number; // 国家インデックス
  loc: number; // 現在のプロヴィンス（移動完了済み）
  // 移動中: path[segIdx] → path[segIdx+1] の移動を行う
  path: number[]; // プロヴィンスID列（A*結果）
  segIdx: number;
  segProgress: number; // 現在セグメントの進捗日数
  segDays: number; // 現在セグメントの所要日数（0=移動していない）
  manpower: number;
  maxManpower: number;
  // 装備2財（phase2-equipment-production）: 歩兵装備・火砲
  infEquipment: number;
  maxInfEquipment: number;
  artEquipment: number;
  maxArtEquipment: number;
  org: number;
  exp: number; // 0..5
  frontId: number; // 割当戦線（-1=未割当・phase2-fronts-logistics）
  commanderId: number; // 割当指揮官（-1=未割当）
  encircled: boolean;
  destroyed: boolean;
}

/** 法律slot（phase3-politics-laws）: 徵兵法・経済法の選択index */
export interface Laws {
  conscription: 0 | 1 | 2; // 志願/徴兵/総動員
  economy: 0 | 1 | 2; // 計画/混合/自由市場
}

export interface LawPending {
  slot: 'conscription' | 'economy';
  target: 0 | 1 | 2;
  cost: number; // PP（適用時に消費）
  startTick: number;
  enactDays: number;
}

export interface ResearchState {
  active: { id: string; progress: number }[]; // 最大2
  done: string[];
}

export interface ConstructionProject {
  id: number;
  country: number;
  prov: number;
  type: 'milFactory' | 'infra';
  cost: number;
  costPaid: number;
  daysTotal: number;
  daysProgress: number;
  paused: boolean;
}

export interface ScoreEntry {
  tick: number;
  military: number;
  economy: number;
  diplomacy: number;
  technology: number;
  living: number;
}

export interface Front {
  id: number;
  owner: number;
  enemy: number;
  stance: 'hold' | 'attack' | 'retreat';
  provinces: number[]; // 前線州（自国支配）
  targets: number[]; // 攻勢目標州（攻勢スタンス時）
  cap: number; // 攻勢投入上限
}

export interface Commander {
  id: number;
  country: number;
  nameJa: string;
  nameEn: string;
  skill: number; // 1..5
  trait: 0 | 1 | 2; // 攻撃/防御/兵站
  assignedUnit: number; // -1=未割当
  exp: number; // 0..1（1.0でスキル上昇ロール）
}

export type TreatyType = 'nonaggression' | 'alliance' | 'trade' | 'access';

/** 条約（phase4-diplomacy-treaties）。proposed→active→annulled（期限切れもannulled） */
export interface Treaty {
  id: number;
  type: TreatyType;
  a: number;
  b: number; // a < b
  startTick: number;
  expiryTick: number; // -1 = 無期限
  status: 'proposed' | 'active' | 'annulled';
  proposer: number;
}

export interface War {
  id: number;
  aggressor: number;
  defender: number;
  startTick: number;
  cb: boolean;
  status: 'active' | 'peaceOffered' | 'ended';
  offeredBy: number; // peaceOffered時の提案者
  offerType: 'white' | 'demand' | -1; // 提案種別（-1=なし）
  offerDemands: number[]; // peaceOffered時の要求州（講和会議・phase4-peace-conference）
  endTick: number; // ended時
  contrib: Record<number, number>; // 戦争貢献度スコア（phase4-peace-conference）
}

export interface RelationEntry {
  a: number;
  b: number; // a < b
  v: number; // -100..100
}

export interface Claim {
  country: number;
  province: number;
}

export type AlertKind =
  | 'warDeclared'
  | 'battleStarted'
  | 'battleEnded'
  | 'provinceOccupied'
  | 'provinceLiberated'
  | 'supplyCut'
  | 'unitDestroyed'
  | 'peaceOffered'
  | 'peaceAccepted'
  | 'peaceDeclined'
  | 'commandRejected'
  | 'unitCreated'
  | 'treatyOffered'
  | 'treatyAccepted'
  | 'treatyDeclined'
  | 'treatyAnnulled'
  | 'treatyExpired';

export interface Alert {
  id: number;
  tick: number;
  kind: AlertKind;
  priority: number; // 大きいほど重要
  msgKey: string;
  params: Record<string, string | number>;
  actor?: number;
  target?: number;
  province?: number;
}

export interface JournalEntry {
  issuer: string;
  seq: number;
  type: string;
  ok: boolean;
  reason?: string;
  tick: number;
}

export interface LogEntry {
  tick: number;
  module: string;
  options: string[];
  scores: number[];
  chosen: string;
  reason: string;
}

export interface WorldState {
  seed: number;
  difficulty: 0 | 1 | 2; // easy / normal / hard
  playerCountry: number; // プレイヤーが操作する国家（AI対象外）
  tick: number;
  epochDays: number; // epochのdaysFromCivil値
  daysPerMonth: number;

  // プロヴィンス（SoA・不変数）
  prov: {
    count: number;
    id: string[];
    nameEn: string[];
    nameJa: string[];
    owner: number[];
    controller: number[];
    terrain: number[]; // TERRAINインデックス
    infra: number[];
    population: number[];
    cx: number[];
    cy: number[];
    cosLat: number[];
    areaKm2: number[];
    coastal: boolean[];
    labelX: number[]; // 描画用ラベル点（経度）
    labelY: number[];
  };

  // 隣接グラフ（CSR）
  adj: {
    offsets: number[];
    targets: number[];
    km: number[];
    strait: boolean[];
  };

  // 国家
  countries: {
    count: number;
    id: string[];
    nameEn: string[];
    nameJa: string[];
    color: string[];
    capital: number[]; // プロヴィンスインデックス
    population: number[];
    manpowerPool: number[];
    infEquipmentStock: number[];
    artEquipmentStock: number[];
    milFactories: number[];
    alive: boolean[];
  };

  claims: Claim[];
  relations: RelationEntry[];
  treaties: Treaty[]; // phase4-diplomacy-treaties
  wars: War[];
  units: Unit[];
  trainingQueue: import('../military/templates').TrainingOrder[];
  fronts: Front[];
  commanders: Commander[];
  productionShare: number[]; // 国ごとの火砲配分率 0..0.5
  firedEvents: string[]; // 発火済みイベントID
  // ── phase3（国家・経済運営）──
  treasury: number[]; // 国庫
  householdPool: number; // 家計プール（世界の資金=Σtreasury+householdPool で保存則検証）
  taxRate: number[]; // 0..0.5
  budgetEdu: number[]; // 教育配分 0..1（研究力倍率0.5〜1.5）
  gdp: number[]; // 月末集計
  livingStandard: number[]; // 0..1（日次）
  literacy: number[]; // 0..1
  unemployment: number[]; // 0..1（日次）
  supportRate: number[]; // 0..1（月次）
  stability: number[]; // 0..1（月次）
  pp: number[]; // 政治力
  laws: Laws[];
  lawQueue: (LawPending | null)[]; // 国ごとに最大1件の制定待ち
  research: ResearchState[];
  constructionQueue: ConstructionProject[];
  foodStock: number[];
  consumerStock: number[];
  prices: number[][]; // [good][country] 0=歩兵装備 1=火砲 2=食料 3=消費財
  scoreHistory: Record<number, ScoreEntry[]>; // 国 → 月次履歴

  // 占領タイマ（領有≠支配の分離、INV-1）
  occupancyTimer: number[];
  occupierCandidate: number[]; // -1 なし

  // 決定論乱数ストリーム（名前→状態）
  rng: Record<string, RngState>;

  // 月末アンカー（決定論検証）
  anchors: { tick: number; hash: number }[];

  // ジャーナル（直近N件のリング）
  journal: JournalEntry[];
  journalStart: number; // journalの実インデックス開始（回転管理用）

  // 進行中カウンタ
  nextUnitId: number;
  nextWarId: number;
  nextAlertId: number;
  nextFrontId: number;
  nextCommanderId: number;
  nextConstructionId: number;
  nextTreatyId: number;

  // ランタイム（セーブ対象外）
  runtime: {
    supplyEff: number[]; // province → 0..1（controller国に対する効率）
    graphEff: Map<number, number[]>; // country → 州別の距離減衰eff（週次+dirtyで再計算）
    unitSupplyFactor: Map<number, number>; // unitId → 容量係数（0.5 or 1）
    supplyDirty: boolean;
    activeBattles: Set<number>; // 戦闘中プロヴィンス
    weatherWeek: number; // 天候キャッシュの週インデックス
    weatherByProv: number[]; // 0=晴 1=雨 2=雪 3=嵐
    decisionLog: Record<string, LogEntry[]>; // countryId文字列 → 直近N件
    alerts: Alert[]; // 直近200件
    alertsSeenByUi: number;
    commandsSinceLastTick: Cmd[];
    aiSeq: Record<number, number>; // AI国家ごとのコマンドseq
    eventSeq: number;
    seenWars: Set<number>; // warStartトリガー照合済み
    rngCache: Record<string, import('./rng').PCG32>;
  };
}

// コマンド型はcommand.tsで定義（循環参照回避のためここでは型のみ）
export interface Cmd {
  issuer: string;
  seq: number;
  type: string;
  p: Record<string, unknown>;
}

export function relationKey(a: number, b: number): string {
  return a < b ? a + ':' + b : b + ':' + a;
}

export function getRelation(w: WorldState, a: number, b: number): number {
  const key = relationKey(a, b);
  for (const r of w.relations) {
    if (relationKey(r.a, r.b) === key) return r.v;
  }
  return 0;
}

export function setRelation(w: WorldState, a: number, b: number, v: number): void {
  const key = relationKey(a, b);
  for (const r of w.relations) {
    if (relationKey(r.a, r.b) === key) {
      r.v = v;
      return;
    }
  }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  w.relations.push({ a: lo, b: hi, v });
}

/** 戦争中か */
export function atWar(w: WorldState, a: number, b: number): boolean {
  for (const war of w.wars) {
    if (war.status === 'active' || war.status === 'peaceOffered') {
      const p1 = war.aggressor;
      const p2 = war.defender;
      if ((p1 === a && p2 === b) || (p1 === b && p2 === a)) return true;
    }
  }
  return false;
}

export function activeWarBetween(w: WorldState, a: number, b: number): War | null {
  for (const war of w.wars) {
    const p1 = war.aggressor;
    const p2 = war.defender;
    if (war.status !== 'ended' && ((p1 === a && p2 === b) || (p1 === b && p2 === a))) return war;
  }
  return null;
}

/** 師団の実効補給効率（州の距離減衰 × 容量係数） */
export function effectiveSupply(w: WorldState, u: Unit): number {
  const cap = w.runtime.unitSupplyFactor.get(u.id) ?? 1;
  return clamp(w.runtime.supplyEff[u.loc] * cap, 0, 1);
}

export function addAlert(w: WorldState, a: Omit<Alert, 'id' | 'tick'>): void {
  const alert: Alert = { ...a, id: w.nextAlertId++, tick: w.tick };
  w.runtime.alerts.push(alert);
  if (w.runtime.alerts.length > 200) w.runtime.alerts.shift();
}
