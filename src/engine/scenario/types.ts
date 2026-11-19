// シナリオパックの型定義（data-pipeline生成物・docs/07 §3準拠）

export interface PackManifest {
  id: string;
  nameEn: string;
  nameJa: string;
  version: string;
  engineCompat: string;
  epoch: [number, number, number];
  daysPerMonth: number;
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
  mods: Record<string, number>;
}

export interface Pack {
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
