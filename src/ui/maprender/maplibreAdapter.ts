// MapLibre GL JSアダプタ — world-map仕様の第一実装（WebGL利用可能環境）。
// タイルサーバ不要: パック同梱GeoJSONをinline sourceとして使用（オフライン描画）。
// ラベルはフォントグリフサーバが不要なCanvasアダプタ側で描画（本アダプタはホバー/選択を提供）。
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createUnitOverlay } from './unitOverlay';
import {createPortOverlay} from './portOverlay';
import type { MapDataSource, MapRenderer } from './types';

interface FCFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: unknown;
}
interface FC {
  type: 'FeatureCollection';
  features: FCFeature[];
}

export function createMaplibreRenderer(container: HTMLElement, ds: MapDataSource): MapRenderer {
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: unknown) => void) | null = null;
  const ready = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });
  let featuresLod1: FCFeature[] = [];
  let featuresLod2: FCFeature[] = [];
  let currentLod: 1 | 2 = 2;
  let colors: string[] = [];
  let selected: number | null = null;
  let onPick: ((prov: number | null) => void) | null = null;

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: undefined as unknown as string, // テキストレイヤ不使用のため不要
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2c3444' } }],
    },
    center: [(ds.viewBbox[0] + ds.viewBbox[2]) / 2, (ds.viewBbox[1] + ds.viewBbox[3]) / 2],
    zoom: 3,
    interactive: true,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  });
  map.fitBounds(
    [
      [ds.viewBbox[0], ds.viewBbox[1]],
      [ds.viewBbox[2], ds.viewBbox[3]],
    ],
    { padding: 24, duration: 0 },
  );
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const units = createUnitOverlay(container, p => { const pt = map.project([ds.provLabelX[p], ds.provLabelY[p]]); return [pt.x, pt.y]; });
  const ports=createPortOverlay(container,p=>{const xy=map.project([ds.provLabelX[p],ds.provLabelY[p]]);return [xy.x,xy.y];});
  map.on('move', units.refresh);
  map.on('resize', units.refresh);
  map.on('move', ports.refresh);
  map.on('resize', ports.refresh);

  async function init(): Promise<void> {
    const lod1fc = (await ds.loadGeometry(1)) as unknown as FC;
    const lod2fc = (await ds.loadGeometry(2)) as unknown as FC;
    const decor = (await ds.loadDecoration()) as unknown as FC;
    featuresLod1 = lod1fc.features;
    featuresLod2 = lod2fc.features;

    map.addSource('decor', { type: 'geojson', data: decor as any });
    map.addLayer({
      id: 'decor-fill',
      type: 'fill',
      source: 'decor',
      paint: { 'fill-color': '#3a4050', 'fill-outline-color': '#4a5164' },
    });
    map.addSource('prov', { type: 'geojson', data: { type: 'FeatureCollection', features: featuresLod2 } as any });
    map.addLayer({
      id: 'prov-fill',
      type: 'fill',
      source: 'prov',
      paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 1 },
    });
    map.addLayer({
      id: 'prov-outline',
      type: 'line',
      source: 'prov',
      paint: { 'line-color': 'rgba(16,18,26,0.85)', 'line-width': 1 },
    });
    // 選択ハイライト
    map.addSource('sel', { type: 'geojson', data: emptySel() as any });
    map.addLayer({
      id: 'sel-line',
      type: 'line',
      source: 'sel',
      paint: { 'line-color': '#f2c94c', 'line-width': 3 },
    });

    // LOD切替（ズーム帯）
    const applyLod = () => {
      const z = map.getZoom();
      const want: 1 | 2 = z >= 4.5 ? 1 : 2;
      if (want !== currentLod) {
        currentLod = want;
        (map.getSource('prov') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: currentFC().features,
        } as any);
      }
    };
    map.on('zoomend', applyLod);

    // ホバー/クリック（Picking）
    map.on('mousemove', 'prov-fill', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (f) onPick?.(Number(f.properties?.pidIdx));
    });
    map.on('mouseleave', 'prov-fill', () => {
      map.getCanvas().style.cursor = '';
      onPick?.(null);
    });
    map.on('click', 'prov-fill', (e) => {
      const f = e.features?.[0];
      if (f) onPick?.(Number(f.properties?.pidIdx));
    });

    // 初期配色
    (map.getSource('prov') as maplibregl.GeoJSONSource).setData(currentFC() as any);
    readyResolve?.();
  }

  function currentFC(): FC {
    const feats = currentLod === 1 ? featuresLod1 : featuresLod2;
    return {
      type: 'FeatureCollection',
      features: feats.map((f, i) => ({
        ...f,
        properties: { ...f.properties, pidIdx: i, fill: colors[i] ?? '#5a5f6b' },
      })),
    };
  }

  function emptySel(): FC {
    return { type: 'FeatureCollection', features: [] };
  }

  map.on('load', () => {
    void init().catch(error => readyReject?.(error));
  });

  return {
    whenReady: () => ready,
    setUnitOverlay: units.set,
    setFrontOverlay: units.setFronts,
    setPortOverlay: ports.set,
    setColors(next: string[], dirty: Set<number>) {
      colors = next;
      if (dirty.size === 0) return;
      if (map.getSource('prov')) {
        (map.getSource('prov') as maplibregl.GeoJSONSource).setData(currentFC() as any);
      }
    },
    setSelected(prov: number | null) {
      selected = prov;
      const src = map.getSource('sel') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (selected === null) {
        src.setData(emptySel() as any);
      } else {
        const feats = currentLod === 1 ? featuresLod1 : featuresLod2;
        const f = feats[selected];
        if (f) src.setData({ type: 'FeatureCollection', features: [f] } as any);
      }
    },
    pickAt(clientX: number, clientY: number): number | null {
      if (!map.getLayer('prov-fill')) return null;
      const rect = map.getCanvas().getBoundingClientRect();
      const feats = map.queryRenderedFeatures([clientX - rect.left, clientY - rect.top], { layers: ['prov-fill'] });
      const f = feats[0];
      return f ? Number(f.properties?.pidIdx) : null;
    },
    projectProvince(prov: number) {
      if (!Number.isInteger(prov) || prov<0 || prov>=ds.provIds.length) return null;
      const point=map.project([ds.provLabelX[prov],ds.provLabelY[prov]]);
      return {x:point.x,y:point.y};
    },
    rebuildAll(next: string[]) {
      colors = next;
      if (map.getSource('prov')) {
        (map.getSource('prov') as maplibregl.GeoJSONSource).setData(currentFC() as any);
      }
    },
    zoomBy(factor: number) { map.zoomTo(map.getZoom() + Math.log2(factor), { duration: 0 }); },
    resetView() { map.fitBounds([[ds.viewBbox[0], ds.viewBbox[1]], [ds.viewBbox[2], ds.viewBbox[3]]], { padding: 24, duration: 0, bearing: 0, pitch: 0 }); },
    focusProvince(prov: number) {
      if (!Number.isInteger(prov) || prov < 0 || prov >= ds.provIds.length) return;
      map.jumpTo({ center: [ds.provLabelX[prov], ds.provLabelY[prov]], zoom: Math.max(map.getZoom(), 6) });
    },
    resize() {
      map.resize();
    },
    dispose() {
      map.off('move', units.refresh);
      map.off('resize', units.refresh);
      map.off('move', ports.refresh);
      map.off('resize', ports.refresh);
      ports.dispose();
      units.dispose();
      map.remove();
    },
  } as MapRenderer & { setPickHandler: (h: (prov: number | null) => void) => void };
}

// setPickHandlerを型に追加するためのヘルパ
declare module './maplibreAdapter' {}
