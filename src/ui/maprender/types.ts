// MapRenderer抽象（world-map仕様）＋地図モードの配色定義
export interface MapRenderer {
  /** 準備完了まで待機（初回描画可能になったらresolve） */
  whenReady(): Promise<void>;
  /** プロヴィンス配色を差分更新（dirtyのみ。spec: 差分再描画） */
  setColors(colors: string[], dirty: Set<number>): void;
  /** 選択ハイライト（単一プロヴィンス） */
  setSelected(prov: number | null): void;
  /** プロヴィンスPicking（画面座標→州インデックス。非該当はnull） */
  pickAt(clientX: number, clientY: number): number | null;
  /** 状態ハッシュから決定論的に全配色を再構築（モード切替時） */
  rebuildAll(colors: string[]): void;
  resize(): void;
  dispose(): void;
}

export interface MapDataSource {
  loadGeometry(lod: 1 | 2): Promise<unknown>; // GeoJSON FeatureCollection
  loadDecoration(): Promise<unknown>;
  provIds: string[]; // meta.provIdsと同順（パイプラインのFC feature順と一致）
  owner: number[];
  controller: number[];
  countryColors: string[];
  viewBbox: [number, number, number, number];
  provLabelX: number[];
  provLabelY: number[];
  provNameJa: string[];
  provNameEn: string[];
  supplyEff: number[];
}

export type MapModeId = 'political' | 'terrain' | 'supply';

export function colorsForMode(
  mode: MapModeId,
  ds: MapDataSource,
): { colors: string[]; patterns?: boolean } {
  const n = ds.provIds.length;
  const out = new Array<string>(n);
  if (mode === 'political') {
    for (let i = 0; i < n; i++) {
      const c = ds.controller[i];
      out[i] = c >= 0 && c < ds.countryColors.length ? ds.countryColors[c] : '#5a5f6b';
    }
    return { colors: out };
  }
  if (mode === 'terrain') {
    // 補助データ（terrain）はUIで別途渡す形式だが、ここでは供給値から陰影は行わない
    // → terrain配色はCanvasアダプタでTERRAIN色テーブルを直接使用するため、政治色を返す
    for (let i = 0; i < n; i++) {
      const c = ds.controller[i];
      out[i] = c >= 0 ? ds.countryColors[c] : '#5a5f6b';
    }
    return { colors: out };
  }
  // supply: 二色発散＋警告
  for (let i = 0; i < n; i++) {
    const e = ds.supplyEff[i] ?? 0;
    if (e < 0.1) out[i] = '#8c4d47';
    else if (e < 0.4) out[i] = '#96773b';
    else if (e < 0.7) out[i] = '#7d8a5a';
    else out[i] = '#439a60';
  }
  return { colors: out, patterns: true };
}

/** 差分dirty集合の計算（配列の変化箇所のみ） */
export function diffIndices(prev: number[], next: number[]): Set<number> {
  const dirty = new Set<number>();
  const n = Math.min(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    if (prev[i] !== next[i]) dirty.add(i);
  }
  return dirty;
}
