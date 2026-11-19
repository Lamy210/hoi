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

type Message = Record<string, any>;
type PendingRequest = { expected: string; resolve: (msg: Message) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> };

export class EngineClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private requests = new Map<number, PendingRequest>();
  private loading = false;
  onSnapshotHook: (() => void) | null = null;

  async startGame(pack: Pack, opts: GameOptions): Promise<void> {
    this.dispose();
    appStore.set({ pendingCommands: 0, speed: 0, snap: null, meta: null, alertLog: [], lastAlertId: 0, statusMessage: null });
    const worker = new EngineWorker();
    this.worker = worker;
    worker.onmessage = (ev: MessageEvent) => {
      if (this.worker === worker) this.handle(ev.data as Message);
    };
    worker.onerror = (err) => {
      if (this.worker !== worker) return;
      const error = new Error(err.message || 'Worker error');
      this.dispose();
      appStore.set({ statusMessage: error.message, speed: 0 });
    };
    worker.onmessageerror = () => {
      if (this.worker !== worker) return;
      this.dispose();
      appStore.set({ statusMessage: 'Worker message error', speed: 0 });
    };
    try {
      const m = await this.request({ type: 'initPack', pack, opts }, 'ready', 30000);
      appStore.set({ meta: m.meta as UiMeta, scenarioNote: null });
    } catch (error) {
      if (this.worker === worker) this.dispose();
      throw error;
    }
  }

  private handle(m: Message): void {
    if (m.type === 'snapshot') {
      const snap = m.snap as UiSnapshot;
      const st = appStore.get();
      const alertLog = [...st.alertLog, ...(snap.alerts ?? []).filter(a => a.id > st.lastAlertId)];
      if (alertLog.length > 100) alertLog.splice(0, alertLog.length - 100);
      appStore.set({ snap, alertLog, lastAlertId: snap.lastAlertId, pendingCommands: Math.max(0, st.pendingCommands - (m.appliedPlayerCommands ?? 0)) });
      this.onSnapshotHook?.();
    } else if (m.type === 'autosave') {
      void saveAutosave(m.buf as Uint8Array, m.tick as number, m.dateStr as string)
        .then(() => appStore.set({ statusMessage: 'autosaved' }))
        .catch((error: unknown) => appStore.set({ statusMessage: 'Autosave failed: ' + String(error) }));
    }
    const pending = this.requests.get(m.requestId);
    if (pending && (m.type === pending.expected || m.type === 'error')) {
      this.requests.delete(m.requestId);
      clearTimeout(pending.timer);
      if (m.type === 'error') pending.reject(new Error(String(m.message)));
      else pending.resolve(m);
    } else if (m.type === 'error' && m.requestId === undefined) {
      appStore.set({ statusMessage: String(m.message), speed: 0 });
    }
  }

  private request(msg: Message, expected: string, timeoutMs: number, transfer: Transferable[] = []): Promise<Message> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Worker is unavailable'));
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error(msg.type + ' timeout'));
      }, timeoutMs);
      this.requests.set(requestId, { expected, resolve, reject, timer });
      try {
        worker.postMessage({ ...msg, requestId }, transfer);
      } catch (err) {
        clearTimeout(timer);
        this.requests.delete(requestId);
        reject(err);
      }
    });
  }

  private send(msg: Message): void {
    this.worker?.postMessage(msg);
  }

  command(cmdType: string, p: Record<string, unknown>): void {
    if (!this.worker || this.loading) return;
    this.send({ type: 'command', cmdType, p });
    appStore.set({ pendingCommands: appStore.get().pendingCommands + 1 });
  }

  step(ticks = 1, sinceAlertId: number): void {
    if (!this.loading) this.send({ type: 'step', ticks, sinceAlertId });
  }

  requestSnapshot(sinceAlertId: number): void {
    if (!this.loading) this.send({ type: 'snapshot', sinceAlertId });
  }

  async save(): Promise<{ buf: Uint8Array; tick: number; dateStr: string }> {
    if (this.loading) throw new Error('Load in progress');
    const m = await this.request({ type: 'save' }, 'saved', 15000);
    return { buf: m.buf as Uint8Array, tick: m.tick as number, dateStr: m.dateStr as string };
  }

  async load(buf: Uint8Array): Promise<{ ok: boolean; violations?: string[] }> {
    if (this.loading) throw new Error('Load in progress');
    if (appStore.get().pendingCommands) throw new Error('Apply pending orders before loading');
    this.loading = true;
    appStore.set({ speed: 0 });
    try {
      const copy = buf.slice();
      const m = await this.request({ type: 'load', buf: copy }, 'loaded', 15000, [copy.buffer as ArrayBuffer]);
      if (m.ok) {
        const snap = m.snap as UiSnapshot;
        appStore.set({ snap, pendingCommands: 0, selection: { prov: null, unitId: null, country: null }, alertLog: snap.alerts ?? [], lastAlertId: snap.lastAlertId, meta: m.meta as UiMeta });
        this.onSnapshotHook?.();
      }
      return { ok: m.ok as boolean, violations: m.violations as string[] | undefined };
    } finally {
      this.loading = false;
    }
  }

  async trace(req: TraceRequest): Promise<TraceResult | null> {
    try {
      const m = await this.request({ type: 'trace', req }, 'traceResult', 8000);
      return (m.result as TraceResult) ?? null;
    } catch (error) {
      appStore.set({ statusMessage: String(error) });
      return null;
    }
  }

  async requestAiLog(country: number): Promise<{ tick: number; module: string; options: string[]; scores: number[]; chosen: string; reason: string }[]> {
    try {
      const m = await this.request({ type: 'aiLog', country }, 'aiLog', 8000);
      return m.logs ?? [];
    } catch (error) {
      appStore.set({ statusMessage: String(error) });
      return [];
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loading = false;
    for (const p of this.requests.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Worker disposed'));
    }
    this.requests.clear();
  }
}

export const engineClient = new EngineClient();
