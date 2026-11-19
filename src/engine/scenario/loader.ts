// シナリオパックの読み込みと検証（scenario-system仕様）。
// manifest/スキーマ/参照整合/checksumを検証し、違反は全件収集して拒否する。

import { fnv1a32 } from '../core/rng';
import { TERRAIN } from '../core/state';
import type { EventDef, Pack, PackChecksums, PackCountry, PackEdge, PackManifest, PackProvince, PackSources, TechDef } from './types';

export class PackValidationError extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super('scenario pack validation failed: ' + violations.length + ' violation(s)');
    this.violations = violations;
  }
}

async function sha256Hex(text: string): Promise<string> {
  // crypto.subtle は secure context（https/localhost）でのみ利用可能。
  // file:// では利用できないため、呼び出し側が available フラグを確認すること。
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const cryptoAvailable: boolean =
  typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' && typeof crypto.subtle.digest === 'function';

export interface FetchResponseLike {
  ok: boolean;
  status?: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchImpl = (url: string) => Promise<FetchResponseLike>;

export const defaultFetch: FetchImpl = (url) => fetch(url) as unknown as Promise<FetchResponseLike>;

async function fetchJson<T>(url: string, impl: FetchImpl): Promise<T> {
  const res = await impl(url);
  if (!res.ok) throw new Error('failed to fetch ' + url + ' (' + (res.status ?? '?') + ')');
  return (await res.json()) as T;
}

export interface LoadPackOptions {
  verifyChecksums?: boolean;
  fetchImpl?: FetchImpl;
}

/** パックの全JSONを検証つきで読み込む。baseUrlは絶対URLで指定する。Node環境ではfetchImplを差し替える。 */
/** 技術前提グラフの循環検出（phase3-research-tree） */
export function detectTechCycles(techs: TechDef[], violations: string[]): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclePath: string[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      violations.push('tech prerequisite cycle: ' + cyclePath.join('->') + '->' + id);
      return;
    }
    visiting.add(id);
    cyclePath.push(id);
    const t = techs.find((x) => x.id === id);
    for (const req of t?.req ?? []) visit(req);
    visiting.delete(id);
    cyclePath.pop();
    visited.add(id);
  };
  for (const t of techs) visit(t.id);
}

export async function loadPack(baseUrl: string, opts: LoadPackOptions = {}): Promise<Pack> {
  const impl = opts.fetchImpl ?? defaultFetch;
  const violations: string[] = [];
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const manifest = await fetchJson<PackManifest>(base + 'manifest.json', impl);
  const provinces = await fetchJson<PackProvince[]>(base + 'provinces.json', impl);
  const countries = await fetchJson<PackCountry[]>(base + 'countries.json', impl);
  const edges = await fetchJson<PackEdge[]>(base + 'adjacency.json', impl);
  const meta = await fetchJson<{ viewBbox: [number, number, number, number]; relations: Record<string, number> }>(
    base + 'meta.json',
    impl,
  );
  const sources = await fetchJson<PackSources>(base + 'SOURCES.json', impl);
  // events.json は任意（phase2-events-basic）
  let events: EventDef[] = [];
  try {
    events = await fetchJson<EventDef[]>(base + 'events.json', impl);
  } catch {
    events = [];
  }
  // techs.json は任意（phase3-research-tree）
  let techs: TechDef[] = [];
  try {
    techs = await fetchJson<TechDef[]>(base + 'techs.json', impl);
  } catch {
    techs = [];
  }

  // checksum検証（crypto.subtleが利用できる環境のみ）
  const verify = opts.verifyChecksums !== false;
  if (verify && cryptoAvailable) {
    try {
      const sums = await fetchJson<PackChecksums>(base + 'checksums.json', impl);
      for (const [file, expect] of Object.entries(sums)) {
        const res = await impl(base + file);
        const text = await res.text();
        const actual = await sha256Hex(text);
        if (actual !== expect) violations.push('checksum mismatch: ' + file);
      }
    } catch (err) {
      violations.push('checksum verification failed: ' + String(err));
    }
  }

  // 参照整合
  const countryIds = new Set(countries.map((c) => c.id));
  const provIds = new Set(provinces.map((p) => p.id));
  if (provIds.size !== provinces.length) violations.push('duplicate province id');
  if (countryIds.size !== countries.length) violations.push('duplicate country id');

  const terrainNames = new Set<string>(TERRAIN);
  for (const p of provinces) {
    if (!countryIds.has(p.owner)) violations.push('province ' + p.id + ': unknown owner country ' + p.owner);
    if (!terrainNames.has(p.terrain)) violations.push('province ' + p.id + ': unknown terrain ' + p.terrain);
    if (!Number.isFinite(p.infra) || p.infra < 0 || p.infra > 5)
      violations.push('province ' + p.id + ': infra out of range ' + p.infra);
    if (!(p.population > 0)) violations.push('province ' + p.id + ': population must be positive');
    if (Math.abs(p.cosLat) > 1.0001) violations.push('province ' + p.id + ': cosLat invalid');
  }
  for (const c of countries) {
    if (!provIds.has(c.capital)) violations.push('country ' + c.id + ': unknown capital ' + c.capital);
    const cap = provinces.find((p) => p.id === c.capital);
    if (cap && cap.owner !== c.id) violations.push('country ' + c.id + ': capital ' + c.capital + ' not owned');
    for (const cl of c.claims) {
      if (!provIds.has(cl)) violations.push('country ' + c.id + ': claim references unknown province ' + cl);
    }
    if (c.startDivisions) {
      for (const sd of c.startDivisions) {
        for (const at of sd.at) {
          if (!provIds.has(at)) violations.push('country ' + c.id + ': startDivisions unknown province ' + at);
          const prov = provinces.find((p) => p.id === at);
          if (prov && prov.owner !== c.id)
            violations.push('country ' + c.id + ': startDivisions province ' + at + ' not owned');
        }
      }
    }
  }
  const seenEdges = new Set<string>();
  for (const e of edges) {
    if (!provIds.has(e.a)) violations.push('edge: unknown province ' + e.a);
    if (!provIds.has(e.b)) violations.push('edge: unknown province ' + e.b);
    if (e.a === e.b) violations.push('edge: self loop ' + e.a);
    if (!(e.km > 0)) violations.push('edge ' + e.a + '-' + e.b + ': km must be positive');
    const key = [e.a, e.b].sort().join('|');
    if (seenEdges.has(key)) violations.push('edge duplicated: ' + key);
    seenEdges.add(key);
  }
  // 対称性: エッジは無向リストなので自動的に対称。隣接の重複はチェック済み。

  // 技術ツリーの検証（phase3-research-tree）: id一意・前提存在・循環拒否・既知modsキー
  const techIds = new Set<string>();
  for (const t of techs) {
    if (!t.id || techIds.has(t.id)) violations.push('tech id missing/duplicated: ' + t.id);
    techIds.add(t.id);
    if (!Number.isFinite(t.days) || t.days <= 0) violations.push('tech ' + t.id + ': invalid days');
    for (const key of Object.keys(t.mods ?? {})) {
      if (!['factoryOutput', 'orgRegen', 'supplyRadius', 'researchRate', 'living'].includes(key)) {
        violations.push('tech ' + t.id + ': unknown mod key ' + key);
      }
    }
  }
  for (const t of techs) {
    for (const req of t.req ?? []) {
      if (!techIds.has(req)) violations.push('tech ' + t.id + ': unknown prerequisite ' + req);
    }
  }
  // 循環検出（DFS・exportして単体テスト可能に）
  detectTechCycles(techs, violations);

  // イベント定義の検証（phase2-events-basic）
  const eventIds = new Set<string>();
  for (const ev of events) {
    if (!ev.id || eventIds.has(ev.id)) violations.push('event id missing/duplicated: ' + ev.id);
    eventIds.add(ev.id);
    const t = ev.trigger;
    if (!t || !['date', 'warStart', 'provinceOccupied', 'stockBelow', 'commandDone'].includes(t.type)) {
      violations.push('event ' + ev.id + ': unknown trigger type');
    }
    for (const c of t.countries ?? []) {
      if (!countryIds.has(c)) violations.push('event ' + ev.id + ': unknown country ' + c);
    }
    if (t.province && !provIds.has(t.province)) violations.push('event ' + ev.id + ': unknown province ' + t.province);
    if (t.country && !countryIds.has(t.country)) violations.push('event ' + ev.id + ': unknown country ' + t.country);
    for (const e of ev.effects ?? []) {
      for (const cid of [e.a, e.b, e.country, e.aggressor, e.defender]) {
        if (cid !== undefined && !countryIds.has(cid)) violations.push('event ' + ev.id + ': unknown country ' + cid);
      }
      if (e.type === 'alert' && !e.msgJa && !e.msgEn) violations.push('event ' + ev.id + ': alert effect without text');
    }
    if (!Array.isArray(ev.effects) || ev.effects.length === 0) violations.push('event ' + ev.id + ': no effects');
  }

  if (violations.length > 0) throw new PackValidationError(violations);

  return { baseUrl: base, manifest, provinces, countries, edges, relations: meta.relations, viewBbox: meta.viewBbox, sources, events, techs };
}

/** パック内容の簡易フィンガープリント（schemaHash用） */
export function packFingerprint(pack: Pack): string {
  let h = 0x811c9dc5;
  h = fnv1a32(h + pack.manifest.id + pack.manifest.version);
  h = fnv1a32(h + String(pack.provinces.length) + String(pack.countries.length) + String(pack.edges.length));
  for (const p of pack.provinces) h = fnv1a32(h + p.id + p.owner + p.terrain + String(p.infra) + String(p.population));
  return (h >>> 0).toString(16);
}
