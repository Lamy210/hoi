// 数値ヘルパ — シミュレーション内で許可される演算のみを使用する。
// 禁止: Math.random / Math.sin / Math.cos / Math.exp / Math.log / Math.pow 等の実装依存関数
//       （ECMAScript仕様で implementation-approximated のため。docs/08 §1）。
// 許可: + - * / 比較、Math.floor/ceil/round/abs/min/max/trunc/sign/sqrt（IEEE正確丸め）。
// 距離計算に必要なcos(lat)等はパイプライン（ビルド時）が計算し、パックデータに焼き込む。

export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 焼き込まれたcos(lat)値（A・B地点）から球面近似距離(km)を求める。超越関数は不使用。 */
export function bakedDistanceKm(
  lon1: number,
  lat1: number,
  cosLat1: number,
  lon2: number,
  lat2: number,
  cosLat2: number,
  kmPerDegLat: number,
): number {
  const dLat = lat2 - lat1;
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const cosMid = lerp(cosLat1, cosLat2, 0.5);
  const x = dLon * cosMid * kmPerDegLat;
  const y = dLat * kmPerDegLat;
  return Math.sqrt(x * x + y * y);
}
