// システムスケジューラ — cadence/offsetによる更新制御（game-core仕様）。
// 実行順は登録順で固定（決定論）。週次・月次は名前ハッシュでオフストリームに分散する。

import { fnv1a32 } from './rng';
import type { WorldState } from './state';

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface SystemDef {
  name: string;
  cadence: Cadence;
  fn: (w: WorldState) => void;
}

const systems: SystemDef[] = [];

export function registerSystem(def: SystemDef): void {
  if (systems.some((s) => s.name === def.name)) throw new Error('system already registered: ' + def.name);
  systems.push(def);
}

export function getSystems(): readonly SystemDef[] {
  return systems;
}

/** 週次オフセット（0..6）: 名前ハッシュから決定論的に派生 */
export function weeklyOffset(name: string): number {
  return fnv1a32('weekly\x1f' + name) % 7;
}

/** 月次オフセット（0..N-1） */
export function monthlyOffset(name: string, daysPerMonth: number): number {
  return fnv1a32('monthly\x1f' + name) % daysPerMonth;
}

function runCadence(w: WorldState, cadence: Cadence): void {
  for (const sys of systems) {
    if (sys.cadence !== cadence) continue;
    if (cadence === 'weekly') {
      if ((w.tick % 7) !== weeklyOffset(sys.name)) continue;
    } else if (cadence === 'monthly') {
      if ((w.tick % w.daysPerMonth) !== monthlyOffset(sys.name, w.daysPerMonth)) continue;
    }
    sys.fn(w);
  }
}

export function runDailySystems(w: WorldState): void {
  runCadence(w, 'daily');
}

export function runWeeklySystems(w: WorldState): void {
  runCadence(w, 'weekly');
}

export function runMonthlySystems(w: WorldState): void {
  runCadence(w, 'monthly');
}
