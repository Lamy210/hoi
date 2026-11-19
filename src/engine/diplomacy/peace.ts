// 講和会議ロジック（phase4-peace-conference）。
// 戦争貢献度スコア・講和要求の妥当性検証・要求価値・AI受諾判断（D-046〜D-049）。
// 全計算は決定論（乱数はコマンドapply内のAI判断でのみPCG32派生ストリームを使用）。
import { deriveStream } from '../core/rng';
import type { War, WorldState } from '../core/state';

/** 占領1州の貢献度加算 */
export const CONTRIB_OCCUPATION = 15;
/** 首都占領の追加加算 */
export const CONTRIB_CAPITAL = 20;
/** 講和要求の州あたり価値 */
export const DEMAND_VALUE_PER_PROV = 10;
/** 首都要求の追加価値 */
export const DEMAND_VALUE_CAPITAL = 20;
/** 長期戦ボーナス（360日超）: AIが追加の譲歩を受け入れる幅 */
export const LONG_WAR_BONUS = 40;

/** 戦争の参加者（aggressor/defender）ペアを返す */
export function warPartners(war: War): [number, number] {
  return [war.aggressor, war.defender];
}

/** 貢献度を記録する（war.contrib・参加国のみ・決定論） */
export function addContribution(war: War, country: number, amount: number): void {
  if (country !== war.aggressor && country !== war.defender) return;
  war.contrib[country] = (war.contrib[country] ?? 0) + amount;
}

/** 貢献度を取得する（未記録は0） */
export function contributionOf(war: War, country: number): number {
  return war.contrib[country] ?? 0;
}

/**
 * 講和要求の妥当性検証（D-048）。
 * 有効な要求: 提案者支配かつ相手領有（割譲）または提案者領有かつ相手支配（返還）。
 */
export function validateDemands(w: WorldState, war: War, proposer: number, demands: number[]): { valid: number[]; invalid: number[] } {
  const other = war.aggressor === proposer ? war.defender : war.aggressor;
  const valid: number[] = [];
  const invalid: number[] = [];
  for (const p of demands) {
    if (p < 0 || p >= w.prov.count) {
      invalid.push(p);
      continue;
    }
    const cession = w.prov.controller[p] === proposer && w.prov.owner[p] === other;
    const returnReq = w.prov.owner[p] === proposer && w.prov.controller[p] === other;
    if (cession || returnReq) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}

/** 要求価値（D-047）。返還要求は相手へ「返す」ため提案側の価値は0、相手の負担として計上 */
export function demandValue(w: WorldState, war: War, proposer: number, demands: number[]): number {
  const other = war.aggressor === proposer ? war.defender : war.aggressor;
  let value = 0;
  for (const p of validateDemands(w, war, proposer, demands).valid) {
    if (w.prov.controller[p] === proposer && w.prov.owner[p] === other) {
      value += DEMAND_VALUE_PER_PROV + (p === w.countries.capital[other] ? DEMAND_VALUE_CAPITAL : 0);
    } else {
      value -= DEMAND_VALUE_PER_PROV; // 返還は提案側のコスト（相手への譲歩）
    }
  }
  return value;
}

export interface PeaceDecision {
  accept: boolean;
  value: number;
  threshold: number;
  reason: string;
}

/** AIの講和受諾判断（D-047）。決定論: 派生ストリーム 'peace'。
 * 受諾側が劣勢（warScore<0）ほど譲歩を受け入れやすく、長期戦でさらに幅が広がる。 */
export function aiEvaluatePeace(w: WorldState, war: War, proposer: number, receiver: number, demands: number[]): PeaceDecision {
  const rng = deriveStream(w.seed, 'peace', war.id + ':' + proposer + ':' + String(w.tick));
  const noise = [1.0, 0.5, 0.15][w.difficulty];
  const value = demandValue(w, war, proposer, demands);
  const longWar = w.tick - war.startTick > 360;
  const scoreOf = receiverSideWarScore(w, war, receiver);
  const willingness = Math.max(0, -scoreOf) + (longWar ? LONG_WAR_BONUS : 0) + (rng.nextFloat() - 0.5) * noise;
  return {
    accept: value <= willingness,
    value,
    threshold: Math.round(willingness * 1000) / 1000,
    reason: 'value=' + value + ' willingness=' + willingness.toFixed(1) + ' warScore=' + scoreOf,
  };
}

/** warScoreForの循環回避ラッパ（war.tsからimportするとpeace.ts→war.ts→…の循環がないため直接importで良いが、
 * war.tsのendWarがpeace.tsを参照するため、ここでは国側スコアを簡易計算する） */
function receiverSideWarScore(w: WorldState, war: War, country: number): number {
  const enemy = war.aggressor === country ? war.defender : war.aggressor;
  let score = 0;
  for (let p = 0; p < w.prov.count; p++) {
    const owner = w.prov.owner[p];
    const ctrl = w.prov.controller[p];
    if (owner === enemy && ctrl === country) score += 10;
    if (owner === country && ctrl === enemy) score -= 10;
    if (owner === enemy && ctrl === country && p === w.countries.capital[enemy]) score += 30;
    if (owner === country && ctrl === enemy && p === w.countries.capital[country]) score -= 30;
  }
  return Math.max(-100, Math.min(100, score));
}
