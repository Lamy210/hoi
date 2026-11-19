// Canvas2D地図レンダラ — フォールバック実装（WebGL不可環境・E2E検証用）。
// LOD 2段階: ズーム閾値で簡略化ジオメトリへ切替（プロヴィンスID集合は不変）。
// ホバー/選択はポイント-in-ポリゴン（Path2D）で解決する。
import type { MapDataSource, MapRenderer } from './types';
import { TERRAIN_COLORS, terrainOf } from './terrainColors';

interface FeatureRec {
  provIdx: number;
  path2d: Path2D;
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

  let features: FeatureRec[] = [];
  let featuresLod2: FeatureRec[] | null = null;
  let colors: string[] = [];
  let mode: 'political' | 'terrain' | 'supply' = 'political';
  let selected: number | null = null;
  let fronts: { provinces: number[]; owner: number; stance: string }[] = [];
  let readyResolve: (() => void) | null = null;
  const ready = new Promise<void>((res) => (readyResolve = res));

  // ビュー変換（経度緯度→ピクセル）。メルカトルではなくシンプルな線形投影（MVP・決定論的）
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  const [bx0, by0, bx1, by1] = ds.viewBbox;

  function fitBounds(): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const sx = w / (bx1 - bx0);
    const sy = h / (by1 - by0);
    scale = Math.min(sx, sy);
    offsetX = w / 2 - ((bx0 + bx1) / 2) * scale;
    offsetY = h / 2 - ((by0 + by1) / 2) * scale;
  }

  function toPixel(lng: number, lat: number): [number, number] {
    return [lng * scale + offsetX, lat * scale + offsetY];
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
        const [x0, y0] = toPixel(ring[0][0], ring[0][1]);
        path.moveTo(x0, y0);
        for (let i = 1; i < ring.length; i++) {
          const [x, y] = toPixel(ring[i][0], ring[i][1]);
          path.lineTo(x, y);
        }
        path.closePath();
      }
    }
    return { path, bbox: [minX, minY, maxX, maxY] };
  }

  let decorPaths: Path2D[] = [];

  async function init(): Promise<void> {
    const { loadGeometry, loadDecoration } = await import('../engineClient');
    fitBounds();
    // LOD2（簡略）を先に描画可能にし、LOD1を後から差し替え
    const lod2fc = (await loadGeometry(2)) as any;
    featuresLod2 = lod2fc.features.map((f: any, i: number) => {
      const built = buildPath(f.geometry);
      return { provIdx: i, path2d: built.path, bbox: built.bbox };
    });
    const decor = (await loadDecoration()) as any;
    decorPaths = decor.features.map((f: any) => buildPath(f.geometry).path);
    const lod1fc = (await loadGeometry(1)) as any;
    features = lod1fc.features.map((f: any, i: number) => {
      const built = buildPath(f.geometry);
      return { provIdx: i, path2d: built.path, bbox: built.bbox };
    });
    readyResolve?.();
    draw();
  }

  function currentFeatures(): FeatureRec[] {
    // LOD切替: ズーム倍率が小さい（広域）ときは簡略ジオメトリ
    const w = container.clientWidth || 800;
    const zoomFrac = scale / (w / (bx1 - bx0));
    return zoomFrac < 1.4 && featuresLod2 ? featuresLod2 : features;
  }

  function draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
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
        const step = Math.max(6, scale * 0.5);
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
    if (scale * 5 > 12) {
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
    // 戦線ハイライト（phase2-fronts-logistics: 太枠＋スタンス別の破線）
    for (const front of fronts) {
      ctx.save();
      ctx.strokeStyle = ds.countryColors[front.owner] ?? '#f2c94c';
      ctx.lineWidth = front.stance === 'attack' ? 4 : 3;
      if (front.stance === 'attack') ctx.setLineDash([8, 5]);
      for (const f of feats) {
        if (front.provinces.includes(f.provIdx)) ctx.stroke(f.path2d);
      }
      ctx.restore();
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

  // パン・ズーム
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => (dragging = false));
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      offsetX += e.clientX - lastX;
      offsetY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    const lng = (mx - offsetX) / scale;
    const lat = (my - offsetY) / scale;
    scale *= factor;
    offsetX = mx - lng * scale;
    offsetY = my - lat * scale;
    draw();
  });
  const resizeObserver = new ResizeObserver(() => {
    fitBounds();
    draw();
  });
  resizeObserver.observe(container);

  void init();

  const renderer = {
    whenReady: () => ready,
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
    rebuildAll(next: string[]) {
      colors = next;
      draw();
    },
    resize() {
      fitBounds();
      draw();
    },
    dispose() {
      resizeObserver.disconnect();
      canvas.remove();
    },
    setMode(m: 'political' | 'terrain' | 'supply', nextColors: string[]) {
      mode = m;
      colors = m === 'terrain' ? nextColors : nextColors;
      // terrainモードでは州ごとの地形色を使用
      if (m === 'terrain') {
        colors = nextColors.map((_, i) => TERRAIN_COLORS[terrainOf(terrainArr[i])]);
      }
      draw();
    },
  } as MapRenderer & { setMode: (m: 'political' | 'terrain' | 'supply', colors: string[]) => void };
  (renderer as unknown as { setFronts: (next: { provinces: number[]; owner: number; stance: string }[]) => void }).setFronts = (next) => {
    fronts = next;
    draw();
  };
  return renderer;
}
