// シナリオパックの型定義（data-pipeline生成物・docs/07 §3準拠）

export interface PackManifest {
  id: string;
  nameEn: string;
  nameJa: string;
  version: string;
  engineCompat: string;
  epoch: [number, number, number];
  daysPerMonth: number;
  /** Phase8A: set only if all four maritime catalog assets are present. */
  maritimeMapVersion?: 1;
  descriptionEn: string;
  descriptionJa: string;
}

export interface PackProvince {
  id: string;
  nameEn: string;
  nameJa: string;
  owner: string; // 国家ID
  terrain: string; // TERRAIN名
  infra: number;
  population: number;
  centroid: [number, number]; // [lng, lat]
  cosLat: number;
  areaKm2: number;
  coastal: boolean;
  label: [number, number]; // ラベル表示点 [lng, lat]
}

export interface PackCountry {
  id: string;
  nameEn: string;
  nameJa: string;
  color: string;
  capital: string; // プロヴィンスID
  population: number; // 現実統計（real）または推定（estimated）
  popQuality: 'real' | 'estimated';
  milFactories: number; // balanced
  claims: string[]; // 領有を主張するプロヴィンスID
  startDivisions: { count: number; at: string[] }[];
}

export interface PackEdge {
  a: string;
  b: string;
  km: number;
  strait: boolean;
}

/** Phase8A maritime catalog. IDs are stable, independent of province indices.
 * These are scenario abstractions, not geographic navigation instructions.
 */
export interface PackSeaZone {
  id:string;
  nameJa:string;
  nameEn:string;
  polygonRef:string;
  neighbors:string[];
}
export interface PackPort {
  id:string;
  provinceId:string;
  zoneId:string;
  capacity:number;
  repairSlots:number;
  dockyardSlots:number;
}
export interface PackNavEdge {
  id:string;
  a:string;
  b:string;
  cost:number;
  gateId?:string;
}
export interface PackMaritimeGate {
  id:string;
  landProvinceIds:string[];
  seaEdgeIds:string[];
}
export interface MaritimeCatalog {
  seaZones:PackSeaZone[];
  ports:PackPort[];
  navEdges:PackNavEdge[];
  gates:PackMaritimeGate[];
}

export interface PackSources {
  generatedAt: string;
  sources: {
    id: string;
    name: string;
    version: string;
    license: string;
    attribution: string;
    retrievedAt: string;
    url: string;
  }[];
  qualityNotes: string;
  simplifications: string[];
}

export interface PackChecksums {
  [file: string]: string; // SHA-256 (hex)
}

export interface EventTrigger {
  type: 'date' | 'warStart' | 'provinceOccupied' | 'stockBelow' | 'commandDone';
  y?: number;
  m?: number;
  d?: number;
  countries?: string[];
  province?: string;
  country?: string;
  good?: 'infEquipment' | 'artEquipment' | 'manpower';
  amount?: number;
  command?: string; // commandDone
  after?: string[]; // commandDone: 先行ガイドID（直列化）
}

export interface EventEffect {
  type: 'relation' | 'equipment' | 'manpower' | 'alert' | 'declareWarAI';
  a?: string;
  b?: string;
  delta?: number;
  country?: string;
  good?: string;
  amount?: number;
  msgJa?: string;
  msgEn?: string;
  priority?: number;
  aggressor?: string;
  defender?: string;
}

export interface EventDef {
  id: string;
  once?: boolean;
  trigger: EventTrigger;
  effects: EventEffect[];
}

export interface TechDef {
  id: string;
  cat: string;
  req: string[];
  days: number;
  /** Optional for legacy scenario packs; 0 ahead-of-time penalty if absent. */
  year?: number;
  nameJa?: string;
  nameEn?: string;
  mods: Record<string, number>;
}

/** 装備モデルカタログ。生産・国家倉庫・師団保有と戦闘品質の派生計算に使用。 */
export interface EquipmentModelDef {
  id: string;
  category: 'infantry' | 'artillery';
  year: number;
  unlockTechId?: string;
  nameJa: string;
  nameEn: string;
  /** バランス用のモデル別戦闘係数。装備配備後のみ実戦闘に適用。 */
  attackFactor: number;
  defenseFactor: number;
  outputFactor: number;
}

export interface Pack {
  verifiedChecksums?: PackChecksums;
  equipmentModels?: EquipmentModelDef[]; // 検証時の固定マニフェスト（描画アセットの再取得にも使用）
  maritime?:MaritimeCatalog;
  techs: TechDef[];
  events: EventDef[];
  baseUrl: string;
  manifest: PackManifest;
  provinces: PackProvince[];
  countries: PackCountry[];
  edges: PackEdge[];
  relations: Record<string, number>; // "A:B"（ID昇順キー）→ 初期関係値
  viewBbox: [number, number, number, number]; // [west, south, east, north]
  sources: PackSources;
}
