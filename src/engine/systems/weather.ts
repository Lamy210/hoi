// 天候・季節システム（phase2-terrain-weather）。
// 月→季節、週×州→天候（deriveStreamで決定論）。実行時キャッシュは週単位で再計算（セーブ対象外・再計算可能）。
import { civilFromDays } from '../clock/date';
import { deriveStream } from '../core/rng';
import type { WorldState } from '../core/state';

export type WeatherType = 'clear' | 'rain' | 'snow' | 'storm';

export const WEATHER_INDEX: Record<WeatherType, number> = { clear: 0, rain: 1, snow: 2, storm: 3 };

export function seasonOfMonth(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function isWinterMonth(month: number): boolean {
  return month === 12 || month <= 2;
}

/** 週開始時に全州の天候を再計算（決定論） */
export function refreshWeather(w: WorldState): void {
  const weekIdx = Math.floor(w.tick / 7);
  if (w.runtime.weatherWeek === weekIdx && w.runtime.weatherByProv.length === w.prov.count) return;
  const { m } = civilFromDays(w.epochDays + w.tick);
  const winter = isWinterMonth(m);
  const out = new Array<number>(w.prov.count).fill(0);
  for (let p = 0; p < w.prov.count; p++) {
    const rng = deriveStream(w.seed, 'weather', w.prov.id[p] + ':' + String(weekIdx));
    const roll = rng.nextFloat();
    if (roll < 0.05) out[p] = 3; // storm
    else if (roll < 0.20 && winter) out[p] = 2; // snow（冬季のみ）
    else if (roll < 0.35) out[p] = 1; // rain
    else out[p] = 0; // clear
  }
  w.runtime.weatherWeek = weekIdx;
  w.runtime.weatherByProv = out;
}

export function weatherOf(w: WorldState, prov: number): WeatherType {
  refreshWeather(w);
  const idx = w.runtime.weatherByProv[prov] ?? 0;
  return (['clear', 'rain', 'snow', 'storm'] as WeatherType[])[idx];
}

/** 攻撃側の天候係数。緯度40度以北の冬季は雪が強化される（spec） */
export function weatherAttackMod(w: WorldState, prov: number): number {
  const type = weatherOf(w, prov);
  const { m } = civilFromDays(w.epochDays + w.tick);
  const harshWinter = isWinterMonth(m) && w.prov.cy[prov] >= 40;
  switch (type) {
    case 'clear':
      return 1.0;
    case 'rain':
      return 0.92;
    case 'snow':
      return harshWinter ? 0.75 : 0.85;
    case 'storm':
      return 0.8;
  }
}

/** 移動速度の天候係数 */
export function weatherMoveMod(w: WorldState, prov: number): number {
  const type = weatherOf(w, prov);
  const { m } = civilFromDays(w.epochDays + w.tick);
  const harshWinter = isWinterMonth(m) && w.prov.cy[prov] >= 40;
  switch (type) {
    case 'clear':
      return 1.0;
    case 'rain':
      return 0.85;
    case 'snow':
      return harshWinter ? 0.65 : 0.75;
    case 'storm':
      return 0.7;
  }
}

/** 悪天候時の組織回復係数 */
export function weatherOrgMod(w: WorldState, prov: number): number {
  const type = weatherOf(w, prov);
  return type === 'clear' ? 1.0 : 0.8;
}
