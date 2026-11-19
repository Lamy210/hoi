export interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Web Mercator（経度と同じ度単位、北が正）。極で発散しないよう上限を設ける。
export function mercatorY(lat: number): number {
  const rad = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180 / Math.PI;
}

export function fitMercator(bounds: [number, number, number, number], width: number, height: number): Camera {
  const [west, south, east, north] = bounds;
  const minY = mercatorY(south), maxY = mercatorY(north);
  const scale = Math.min(Math.max(1, width - 48) / Math.max(1, east - west),
    Math.max(1, height - 48) / Math.max(1, maxY - minY));
  return { scale, offsetX: width / 2 - (west + east) / 2 * scale,
    offsetY: height / 2 + (minY + maxY) / 2 * scale };
}

export function zoomCamera(camera: Camera, baseScale: number, factor: number, x: number, y: number): Camera {
  const scale = Math.min(baseScale * 32, Math.max(baseScale * 0.5, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { scale, offsetX: x - (x - camera.offsetX) * ratio,
    offsetY: y - (y - camera.offsetY) * ratio };
}
