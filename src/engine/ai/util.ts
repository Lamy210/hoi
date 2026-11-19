// AIユーティリティ（combat.tsの係数積算を共有）
import type { PowerContrib } from '../systems/combat';

export function factorProductOf(cs: PowerContrib[]): number {
  let p = 1;
  for (const c of cs) p *= c.value;
  return p;
}
