// エンジンクライアント — Worker境界のRPCラッパ＋シナリオカタログ＋パック読込。
// http(s): fetch＋checksum検証 / file://: 静的インポート（検証スキップ・UIに注記）。
import EngineWorker from '../engine/worker?worker&inline';
import { loadPack, defaultFetch, cryptoAvailable, loadVerifiedPackAsset } from '../engine/scenario/loader';
import type { Pack } from '../engine/scenario/types';
import type { UiMeta, UiSnapshot } from '../engine/ui';
import type { TraceRequest, TraceResult } from '../engine/engine';
import { appStore } from './store';
import { saveAutosave } from './idb';

export interface ScenarioInfo {
  id: string;
  nameEn: string;
  nameJa: string;
  version: string;
  epoch: [number, number, number];
  descriptionEn: string;
  descriptionJa: string;
  provinceCount: number;
  countryCount: number;
  sources: { name: string; attribution: string; license: string }[];
}

export interface GameOptions {
  seed: number;
  playerCountryId: string;
  difficulty: 0 | 1 | 2;
}

const PACK_BASE = (import.meta.env.BASE_URL ?? '/') + 'packs/modern-eastasia/';

async function fetchJsonStatic<T>(url: string): Promise<T> {
  const res = await defaultFetch(url);
  if (!res.ok) throw new Error('fetch failed: ' + url);
  return (await res.json()) as T;
}

async function loadPackViaImport(): Promise<Pack> {
  // file://モード: バンドルへ静的取り込み（動的importでコード分割）
  const [manifest, provinces, countries, edges, meta, sources, events, techs] = await Promise.all([
    import('../../public/packs/modern-eastasia/manifest.json'),
    import('../../public/packs/modern-eastasia/provinces.json'),
    import('../../public/packs/modern-eastasia/countries.json'),
    import('../../public/packs/modern-eastasia/adjacency.json'),
    import('../../public/packs/modern-eastasia/meta.json'),
    import('../../public/packs/modern-eastasia/SOURCES.json'),
    import('../../public/packs/modern-eastasia/events.json'),
    import('../../public/packs/modern-eastasia/techs.json'),
  ]);
  return {
    baseUrl: PACK_BASE,
    manifest: manifest.default as unknown as Pack['manifest'],
    provinces: provinces.default as unknown as Pack['provinces'],
    countries: countries.default as unknown as Pack['countries'],
    edges: edges.default as unknown as Pack['edges'],
    relations: (meta.default as unknown as { relations: Record<string, number> }).relations,
    viewBbox: (meta.default as unknown as { viewBbox: [number, number, number, number] }).viewBbox,
    sources: sources.default as unknown as Pack['sources'],
    events: events.default as unknown as Pack['events'],
    techs: techs.default as unknown as Pack['techs'],
  };
}

export async function listScenarios(): Promise<ScenarioInfo[]> {
  if (appStore.get().fileMode) {
    const pack = await loadPackViaImport();
    return [
      {
        id: pack.manifest.id,
        nameEn: pack.manifest.nameEn,
        nameJa: pack.manifest.nameJa,
        version: pack.manifest.version,
        epoch: pack.manifest.epoch,
        descriptionEn: pack.manifest.descriptionEn,
        descriptionJa: pack.manifest.descriptionJa,
        provinceCount: pack.provinces.length,
        countryCount: pack.countries.length,
        sources: pack.sources.sources.map((s) => ({ name: s.name, attribution: s.attribution, license: s.license })),
      },
    ];
  }
  const manifest = await fetchJsonStatic<Pack['manifest']>(PACK_BASE + 'manifest.json');
  const sources = await fetchJsonStatic<Pack['sources']>(PACK_BASE + 'SOURCES.json');
  const provinces = await fetchJsonStatic<Pack['provinces']>(PACK_BASE + 'provinces.json');
  const countries = await fetchJsonStatic<Pack['countries']>(PACK_BASE + 'countries.json');
  return [
    {
      id: manifest.id,
      nameEn: manifest.nameEn,
      nameJa: manifest.nameJa,
      version: manifest.version,
      epoch: manifest.epoch,
      descriptionEn: manifest.descriptionEn,
      descriptionJa: manifest.descriptionJa,
      provinceCount: provinces.length,
      countryCount: countries.length,
      sources: sources.sources.map((s) => ({ name: s.name, attribution: s.attribution, license: s.license })),
    },
  ];
}

export async function loadScenarioPack(): Promise<{ pack: Pack; checksumVerified: boolean }> {
  if (appStore.get().fileMode) {
    return { pack: await loadPackViaImport(), checksumVerified: false };
  }
  const pack = await loadPack(PACK_BASE, { verifyChecksums: cryptoAvailable });
  return { pack, checksumVerified: cryptoAvailable };
}

let packCache: { pack: Pack; checksumVerified: boolean } | null = null;

/** 国家選択画面などで使用するキャッシュつきパック取得 */
export async function getPack(): Promise<{ pack: Pack; checksumVerified: boolean }> {
  if (!packCache) packCache = await loadScenarioPack();
  return packCache;
}

/** 地図ジオメトリの読み込み（http: fetch / file: 静的取り込み） */
export async function loadGeometry(lod: 1 | 2): Promise<GeoJSON.FeatureCollection> {
  if (appStore.get().fileMode) {
    const mod = lod === 1
      ? await import('../../public/packs/modern-eastasia/geometry-lod1.json')
      : await import('../../public/packs/modern-eastasia/geometry-lod2.json');
    return mod.default as unknown as GeoJSON.FeatureCollection;
  }
  return loadVerifiedPackAsset<GeoJSON.FeatureCollection>((await getPack()).pack, 'geometry-lod' + lod + '.json');
}

export async function loadDecoration(): Promise<GeoJSON.FeatureCollection> {
  if (appStore.get().fileMode) {
    const mod = await import('../../public/packs/modern-eastasia/decoration.json');
    return mod.default as unknown as GeoJSON.FeatureCollection;
  }
  return loadVerifiedPackAsset<GeoJSON.FeatureCollection>((await getPack()).pack, 'decoration.json');
}

type MsgHandler = (msg: Record<string, any>) => void;

export class EngineClient {
  private worker: Worker | null = null;
  private seq = 1;
  private handlers: MsgHandler[] = [];
  private pendingSave: ((m: Record<string, any>) => void) | null = null;
  private pendingLoad: ((m: Record<string, any>) => void) | null = null;
  private pendingTrace: ((m: Record<string, any>) => void) | null = null;
  /** スナップショット到着の通知先（pacerが遅延計測に使用） */
  onSnapshotHook: (() => void) | null = null;

  /** Workerを起動してゲームを初期化する */
  async startGame(pack: Pack, opts: GameOptions): Promise<void> {
    this.dispose();
    appStore.set({ pendingCommands: 0 });
    this.worker = new EngineWorker();
    this.worker.onmessage = (ev: MessageEvent) => this.handle(ev.data as Record<string, any>);
    this.worker.onerror = (err) => {
      appStore.set({ statusMessage: 'worker error: ' + String(err) });
    };
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('worker init timeout')), 30000);
      this.handlers.push((m) => {
        if (m.type === 'ready') {
          clearTimeout(timeout);
          appStore.set({ meta: m.meta as UiMeta, scenarioNote: null });
          resolve();
        }
      });
      this.worker!.postMessage({ type: 'initPack', pack, opts });
    });
  }

  private handle(m: Record<string, any>): void {
    switch (m.type) {
      case 'snapshot': {
        const snap = m.snap as UiSnapshot;
        const st = appStore.get();
        const alertLog = [...st.alertLog, ...(snap.alerts ?? [])];
        if (alertLog.length > 100) alertLog.splice(0, alertLog.length - 100);
        appStore.set({ snap, alertLog, lastAlertId: snap.lastAlertId, pendingCommands: Math.max(0, st.pendingCommands - (m.appliedPlayerCommands ?? 0)) });
        this.onSnapshotHook?.();
        break;
      }
      case 'autosave': {
        void saveAutosave(m.buf as Uint8Array, m.tick as number);
        appStore.set({ statusMessage: 'autosaved' });
        break;
      }
      case 'saved': {
        this.pendingSave?.(m);
        this.pendingSave = null;
        break;
      }
      case 'loaded': {
        if (m.ok) appStore.set({ pendingCommands: 0, selection: { prov: null, unitId: null, country: null }, alertLog: [], lastAlertId: 0 });
        this.pendingLoad?.(m);
        this.pendingLoad = null;
        break;
      }
      case 'traceResult': {
        this.pendingTrace?.(m);
        this.pendingTrace = null;
        break;
      }
      case 'error': {
        appStore.set({ statusMessage: m.message });
        break;
      }
    }
    for (const h of this.handlers.splice(0)) h(m);
  }

  private send(msg: Record<string, any>, transfer?: Transferable[]): void {
    this.worker?.postMessage(msg, transfer ?? []);
  }

  command(cmdType: string, p: Record<string, unknown>): void {
    if (!this.worker) return;
    this.send({ type: 'command', seq: this.seq++, cmdType, p });
    appStore.set({ pendingCommands: appStore.get().pendingCommands + 1 });
  }

  step(ticks = 1, sinceAlertId: number): void {
    this.send({ type: 'step', ticks, sinceAlertId });
  }

  requestSnapshot(sinceAlertId: number): void {
    this.send({ type: 'snapshot', sinceAlertId });
  }

  save(): Promise<{ buf: Uint8Array; tick: number; dateStr: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('save timeout')), 15000);
      this.pendingSave = (m) => {
        clearTimeout(timeout);
        resolve({ buf: m.buf as Uint8Array, tick: m.tick as number, dateStr: m.dateStr as string });
      };
      this.send({ type: 'save' });
    });
  }

  load(buf: Uint8Array): Promise<{ ok: boolean; violations?: string[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('load timeout')), 15000);
      this.pendingLoad = (m) => {
        clearTimeout(timeout);
        resolve({ ok: m.ok as boolean, violations: m.violations as string[] | undefined });
      };
      const copy = buf.slice();
      this.send({ type: 'load', buf: copy }, [copy.buffer as ArrayBuffer]);
    });
  }

  trace(req: TraceRequest): Promise<TraceResult | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);
      this.pendingTrace = (m) => {
        clearTimeout(timeout);
        resolve((m.result as TraceResult) ?? null);
      };
      this.send({ type: 'trace', req });
    });
  }

  /** 開発者モード: AI判断ログの照会 */
  requestAiLog(country: number): Promise<{ tick: number; module: string; options: string[]; scores: number[]; chosen: string; reason: string }[]> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 8000);
      const handler = (m: Record<string, any>) => {
        if (m.type === 'aiLog' && m.country === country) {
          clearTimeout(timeout);
          this.handlers = this.handlers.filter((h) => h !== wrapped);
          resolve(m.logs ?? []);
        }
      };
      const wrapped = (m: Record<string, any>) => handler(m);
      this.handlers.push(wrapped);
      this.send({ type: 'aiLog', country });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingSave = null;
    this.pendingLoad = null;
    this.pendingTrace = null;
  }
}

export const engineClient = new EngineClient();
