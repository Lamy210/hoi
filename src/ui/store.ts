// アプリ状態ストア（Zustand相当の軽量実装・依存最小化）
import type { UiMeta, UiSnapshot } from '../engine/ui';
import type { Lang } from './i18n';

export type Screen = 'title' | 'scenario' | 'country' | 'game';
export type MapMode = 'political' | 'terrain' | 'supply';
export type PanelId = 'overview' | 'wars' | 'aiLog' | 'saveLoad' | 'settings' | 'fronts' | 'budget' | 'diplomacy' | null;

export interface Selection {
  prov: number | null;
  unitId: number | null;
  country: number | null;
}

export interface TraceView {
  title: string;
  contribs: { label: string; value: number; formula: string }[];
  note?: string;
}

export interface AppState {
  screen: Screen;
  lang: Lang;
  colorAssist: boolean;
  devMode: boolean;
  revealAll: boolean;
  packBaseUrl: string;
  meta: UiMeta | null;
  snap: UiSnapshot | null;
  lastAlertId: number;
  alertLog: import('../engine/core/state').Alert[];
  selection: Selection;
  panel: PanelId;
  mapMode: MapMode;
  speed: number; // 0=一時停止, 1,2,4,8
  perfWarn: boolean;
  aiLogCountry: number | null;
  trace: TraceView | null;
  statusMessage: string | null;
  gameOpts: { seed: number; playerCountryId: string; difficulty: 0 | 1 | 2 } | null;
  fileMode: boolean;
  scenarioNote: string | null;
}

type Listener = () => void;

const state: AppState = {
  screen: 'title',
  lang: 'ja',
  colorAssist: false,
  devMode: false,
  revealAll: false,
  packBaseUrl: '',
  meta: null,
  snap: null,
  lastAlertId: 0,
  alertLog: [],
  selection: { prov: null, unitId: null, country: null },
  panel: null,
  mapMode: 'political',
  speed: 0,
  perfWarn: false,
  aiLogCountry: null,
  trace: null,
  statusMessage: null,
  gameOpts: null,
  fileMode: typeof location !== 'undefined' && location.protocol === 'file:',
  scenarioNote: null,
};

// useSyncExternalStoreは参照比較で変更を検出するため、set時に新しいスナップショットを作る
let snapshot: AppState;

const listeners = new Set<Listener>();

export const appStore = {
  get(): AppState {
    return snapshot;
  },
  set(patch: Partial<AppState>): void {
    Object.assign(state, patch);
    snapshot = { ...state };
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

// 初期スナップショット
appStore.set({});

export function fmtNumber(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US').format(n);
}

export function fmtPercent(lang: Lang, x: number): string {
  return new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', { style: 'percent', maximumFractionDigits: 0 }).format(x);
}
