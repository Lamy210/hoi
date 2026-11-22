// Canvas2D地図レンダラ — フォールバック実装（WebGL不可環境・E2E検証用）。
// LOD 2段階: ズーム閾値で簡略化ジオメトリへ切替（プロヴィンスID集合は不変）。
// ホバー/選択はポイント-in-ポリゴン（Path2D）で解決する。
import { createUnitOverlay } from './unitOverlay';
import type { MapDataSource, MapRenderer } from './types';
import { TERRAIN_COLORS, terrainOf } from './terrainColors';
import { mercatorY, fitMercator, zoomCamera } from './camera';

interface FeatureRec {
  provIdx: number;
  path2d: Path2D;
  projected: Path2D;
  bbox: [number, number, number, number];
}

export function createCanvasRenderer(
  container: HTMLElement,
  ds: MapDataSource,
  terrainArr: number[],
): MapRenderer & { setMode: (m: 'political' | 'terrain' | 'supply', colors: string[]) => void } {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const units = createUnitOverlay(container, p => toPixel(ds.provLabelX[p], ds.provLabelY[p]));

  let features: FeatureRec[] = [];
  let featuresLod2: FeatureRec[] | null = null;
  let colors: string[] = [];
  let mode: 'political' | 'terrain' | 'supply' = 'political';
  let selected: number | null = null;
  let disposed = false;
  let baseScale = 1;
  let readyForInput = false;

  // 北が上のWeb Mercator。投影座標のPath2Dを保持し、カメラ変更時だけ変換する。
  let camera = { scale: 1, offsetX: 0, offsetY: 0 };
  let decorProjected: Path2D[] = [];
  let decorPaths: Path2D[] = [];

  function rebuildPaths(): void {
    const matrix = new DOMMatrix([camera.scale, 0, 0, -camera.scale, camera.offsetX, camera.offsetY]);
    const transform = (source: Path2D) => { const path = new Path2D(); path.addPath(source, matrix); return path; };
    for (const feature of [...features, ...(featuresLod2 ?? [])]) feature.path2d = transform(feature.projected);
    decorPaths = decorProjected.map(transform);
    canvas.dataset.zoom = String(camera.scale / baseScale);
    canvas.dataset.cameraX = String(camera.offsetX);
    canvas.dataset.cameraY = String(camera.offsetY);
    canvas.dataset.lod = camera.scale / baseScale < 1.4 ? '2' : '1';
    units.refresh();
  }

  function fitBounds(): void {
    camera = fitMercator(ds.viewBbox, container.clientWidth || 800, container.clientHeight || 600);
    baseScale = camera.scale;
    rebuildPaths();
  }

  function toPixel(lng: number, lat: number): [number, number] {
    return [lng * camera.scale + camera.offsetX, -mercatorY(lat) * camera.scale + camera.offsetY];
  }

  function buildPath(geom: any): { path: Path2D; bbox: [number, number, number, number] } {
    const path = new Path2D();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const polys: number[][][][] =
      geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const [lng, lat] = ring[i];
          if (lng < minX) minX = lng;
          if (lng > maxX) maxX = lng;
          if (lat < minY) minY = lat;
          if (lat > maxY) maxY = lat;
        }
        const [x0, y0] = [ring[0][0], mercatorY(ring[0][1])];
        path.moveTo(x0, y0);
        for (let i = 1; i < ring.length; i++) {
          const [x, y] = [ring[i][0], mercatorY(ring[i][1])];
          path.lineTo(x, y);
        }
        path.closePath();
      }
    }
    return { path, bbox: [minX, minY, maxX, maxY] };
  }

  async function init(): Promise<void> {
    fitBounds();
    // LOD2（簡略）を先に描画可能にし、LOD1を後から差し替え
    const lod2fc = (await ds.loadGeometry(2)) as any;
    featuresLod2 = lod2fc.features.map((f: any, i: number) => {
      const built = buildPath(f.geometry);
      return { provIdx: i, path2d: new Path2D(), projected: built.path, bbox: built.bbox };
    });
    const decor = (await ds.loadDecoration()) as any;
    decorProjected = decor.features.map((f: any) => buildPath(f.geometry).path);
    const lod1fc = (await ds.loadGeometry(1)) as any;
    features = lod1fc.features.map((f: any, i: number) => {
      const built = buildPath(f.geometry);
      return { provIdx: i, path2d: new Path2D(), projected: built.path, bbox: built.bbox };
    });
    if (disposed) return;
    readyForInput = true;
    rebuildPaths();
    draw();
  }

  function currentFeatures(): FeatureRec[] {
    // LOD切替: ズーム倍率が小さい（広域）ときは簡略ジオメトリ
    const zoomFrac = camera.scale / baseScale;
    return zoomFrac < 1.4 && featuresLod2 ? featuresLod2 : features;
  }

  function draw(): void {
    if (disposed) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 海
    ctx.fillStyle = '#2c3444';
    ctx.fillRect(0, 0, w, h);
    // 装飾（非参加国）
    ctx.fillStyle = '#3a4050';
    ctx.strokeStyle = '#4a5164';
    ctx.lineWidth = 1;
    for (const p of decorPaths) {
      ctx.fill(p);
      ctx.stroke(p);
    }
    const feats = currentFeatures();
    for (const f of feats) {
      ctx.fillStyle = colors[f.provIdx] ?? '#5a5f6b';
      ctx.fill(f.path2d);
    }
    // 境界（まとめて一回のストロークで高速化）
    ctx.strokeStyle = 'rgba(16,18,26,0.85)';
    ctx.lineWidth = 1;
    for (const f of feats) ctx.stroke(f.path2d);
    // 占領地パターン（色覚サポート: 色＋パターンの冗長化）
    if (mode === 'political') {
      for (const f of feats) {
        const owner = ds.owner[f.provIdx];
        const ctrl = ds.controller[f.provIdx];
        if (owner === ctrl || owner < 0 || ctrl < 0) continue;
        ctx.save();
        ctx.clip(f.path2d);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        const [minX, minY, maxX, maxY] = f.bbox;
        const [px0, py0] = toPixel(minX, maxY);
        const [px1, py1] = toPixel(maxX, minY);
        const step = Math.max(6, camera.scale * 0.5);
        for (let x = px0 - (py1 - py0); x < px1; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, py1);
          ctx.lineTo(x + (py1 - py0), py0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // ラベル（広域では都市ラベルは省略、州名は表示）
    if (camera.scale * 5 > 12) {
      ctx.fillStyle = 'rgba(240,238,232,0.9)';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      for (const f of feats) {
        if (f.provIdx % 1 !== 0) continue;
        const [cx, cy] = toPixel(ds.provLabelX[f.provIdx], ds.provLabelY[f.provIdx]);
        const name = ds.provNameJa[f.provIdx] || ds.provNameEn[f.provIdx];
        if (cx < -40 || cx > w + 40 || cy < -10 || cy > h + 10) continue;
        ctx.strokeText(name, cx, cy);
        ctx.fillText(name, cx, cy);
      }
    }
    // 選択ハイライト
    if (selected !== null) {
      const f = feats.find((x) => x.provIdx === selected);
      if (f) {
        ctx.strokeStyle = '#f2c94c';
        ctx.lineWidth = 3;
        ctx.stroke(f.path2d);
      }
    }
    // 補給モードの凡例
    if (mode === 'supply') {
      ctx.fillStyle = 'rgba(16,18,26,0.8)';
      ctx.fillRect(w - 210, h - 84, 200, 74);
      ctx.fillStyle = '#f0eee8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      const items: [string, string][] = [
        ['#439a60', '0.7+'],
        ['#7d8a5a', '0.4-0.7'],
        ['#96773b', '0.1-0.4'],
        ['#8c4d47', '<0.1 警告'],
      ];
      items.forEach(([c, label], i) => {
        ctx.fillStyle = c;
        ctx.fillRect(w - 200, h - 72 + i * 16, 12, 10);
        ctx.fillStyle = '#f0eee8';
        ctx.fillText(label, w - 184, h - 63 + i * 16);
      });
    }
  }

  function pickAt(clientX: number, clientY: number): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const feats = currentFeatures();
    for (const f of feats) {
      const [minX, minY, maxX, maxY] = f.bbox;
      const [px0, py0] = toPixel(minX, maxY);
      const [px1, py1] = toPixel(maxX, minY);
      if (x < Math.min(px0, px1) || x > Math.max(px0, px1) || y < Math.min(py0, py1) || y > Math.max(py0, py1))
        continue;
      if (ctx.isPointInPath(f.path2d, x * (window.devicePixelRatio || 1), y * (window.devicePixelRatio || 1))) {
        return f.provIdx;
      }
    }
    return null;
  }

  // パン・ズーム。ポインタを捕捉し、ドラッグ完了を州クリックとして扱わない。
  let pointer: number | null = null;
  let startX = 0, startY = 0, lastX = 0, lastY = 0;
  let dragged = false;
  let suppressClick = false;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (!readyForInput || e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    dragged = false;
    suppressClick = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointer !== e.pointerId) return;
    if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
    dragged = true;
    canvas.style.cursor = 'grabbing';
    camera.offsetX += e.clientX - lastX;
    camera.offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    rebuildPaths();
    draw();
  });
  const endDrag = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    suppressClick = dragged;
    canvas.style.cursor = 'pointer';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); suppressClick = false; }
  });
  function zoom(factor: number, x = container.clientWidth / 2, y = container.clientHeight / 2): void {
    if (!readyForInput) return;
    camera = zoomCamera(camera, baseScale, factor, x, y);
    rebuildPaths();
    draw();
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!e.deltaY) return;
    const rect = canvas.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  let lastWidth = container.clientWidth, lastHeight = container.clientHeight;
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w === lastWidth && h === lastHeight) return;
    if (readyForInput) {
      camera.offsetX += (w - lastWidth) / 2;
      camera.offsetY += (h - lastHeight) / 2;
      rebuildPaths();
    }
    lastWidth = w; lastHeight = h;
    draw();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const ready = init();

  const renderer = {
    whenReady: () => ready,
    setUnitOverlay: units.set,
    setFrontOverlay: units.setFronts,
    setColors(next: string[], dirty: Set<number>) {
      colors = next;
      if (dirty.size === 0) return;
      draw();
      void dirty;
    },
    setSelected(prov: number | null) {
      selected = prov;
      draw();
    },
    pickAt,
    projectProvince(prov: number) {
      if (!readyForInput || !Number.isInteger(prov) || prov<0 || prov>=ds.provIds.length) return null;
      const [x,y]=toPixel(ds.provLabelX[prov],ds.provLabelY[prov]);
      return {x,y};
    },
    rebuildAll(next: string[]) {
      colors = next;
      draw();
    },
    zoomBy: (factor: number) => zoom(factor),
    resetView() { fitBounds(); draw(); },
    focusProvince(prov: number) {
      if (!readyForInput || !Number.isInteger(prov) || prov < 0 || prov >= ds.provIds.length) return;
      const scale = Math.max(camera.scale, baseScale * 4);
      camera = { scale, offsetX: container.clientWidth / 2 - ds.provLabelX[prov] * scale,
        offsetY: container.clientHeight / 2 + mercatorY(ds.provLabelY[prov]) * scale };
      rebuildPaths();
      draw();
    },
    resize,
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      units.dispose();
      canvas.remove();
    },
    setMode(m: 'political' | 'terrain' | 'supply', nextColors: string[]) {
      mode = m;
      colors = nextColors;
      // terrainモードでは州ごとの地形色を使用
      if (m === 'terrain') {
        colors = nextColors.map((_, i) => TERRAIN_COLORS[terrainOf(terrainArr[i])]);
      }
      draw();
    },
  } as MapRenderer & { setMode: (m: 'political' | 'terrain' | 'supply', colors: string[]) => void };
  return renderer;
}
