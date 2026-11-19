import { describe, expect, it } from 'vitest';
import { fitMercator, mercatorY, zoomCamera } from '../../src/ui/maprender/camera';

describe('Web Mercator camera', () => {
  it('北が上で極にも有限な座標を返す', () => {
    const camera = fitMercator([98, 18, 152, 62], 1100, 700);
    const screenY = (lat: number) => camera.offsetY - camera.scale * mercatorY(lat);
    expect(screenY(45)).toBeLessThan(screenY(30));
    expect(screenY(62)).toBeGreaterThanOrEqual(23.99);
    expect(screenY(18)).toBeLessThanOrEqual(676.01);
    expect(Number.isFinite(mercatorY(90))).toBe(true);
    expect(Number.isFinite(mercatorY(-90))).toBe(true);
  });
  it('カーソル位置の地理座標を維持して拡大し上限を守る', () => {
    const c = fitMercator([98, 18, 152, 62], 1100, 700);
    const x = 400, y = 300;
    const next = zoomCamera(c, c.scale, 2, x, y);
    expect((x - next.offsetX) / next.scale).toBeCloseTo((x - c.offsetX) / c.scale);
    expect((y - next.offsetY) / next.scale).toBeCloseTo((y - c.offsetY) / c.scale);
    expect(zoomCamera(c, c.scale, 100, x, y).scale).toBe(c.scale * 32);
  });
});
