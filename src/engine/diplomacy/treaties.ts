// 条約と多要素関係値（phase4-diplomacy-treaties）。
// 条約のライフサイクル・矛盾禁止・AI判断と、多要素関係値（D-040〜D-042）の計算を提供する。
// 全計算は決定論（乱数はコマンドapplyのAI判断でのみPCG32派生ストリームを使用）。
import { clamp } from '../core/num';
import { deriveStream } from '../core/rng';
import { activeWarBetween, addAlert, type LogEntry, type Treaty, type TreatyType, type WorldState } from '../core/state';

export const TREATY_TYPES: TreatyType[] = ['nonaggression', 'alliance', 'trade', 'access'];
/** 条約の既定有効期間（日）。-1は無期限 */
export const TREATY_DURATION_DAYS = 720;
/** 週次ドリフトの最大移動量（D-041） */
export const RELATION_DRIFT_PER_WEEK = 2;
/** 条約ボーナス（関係値目標への寄与） */
export const TREATY_RELATION_BONUS: Record<TreatyType, number> = {
  nonaggression: 15,
  alliance: 25,
  trade: 10,
  access: 12,
};
/** 戦争中ペナルティ */
export const WAR_RELATION_PENALTY = 80;
/** 外交スコアへの条約加算（phase4: 条約網） */
export const TREATY_SCORE_BONUS: Record<TreatyType, number> = {
  nonaggression: 3,
  alliance: 8,
  trade: 5,
  access: 4,
};

function pairOf(a: number, b: number): [number, number] {
  return [Math.min(a, b), Math.max(a, b)];
}

/** 2国間の有効な（activeな）条約を返す */
export function activeTreatyBetween(w: WorldState, a: number, b: number, type?: TreatyType): Treaty | undefined {
  const [lo, hi] = pairOf(a, b);
  return w.treaties.find(
    (t) => t.a === lo && t.b === hi && t.status === 'active' && (type === undefined || t.type === type),
  );
}

/** 2国間の提案待ち条約を返す */
export function proposedTreatyBetween(w: WorldState, a: number, b: number, type?: TreatyType): Treaty | undefined {
  const [lo, hi] = pairOf(a, b);
  return w.treaties.find(
    (t) => t.a === lo && t.b === hi && t.status === 'proposed' && (type === undefined || t.type === type),
  );
}

/** 同盟関係があるか */
export function isAllied(w: WorldState, a: number, b: number): boolean {
  return activeTreatyBetween(w, a, b, 'alliance') !== undefined;
}

/** 条約を解除する（アラート付）。已に解除済みなら何もしない */
export function annulTreaty(w: WorldState, treaty: Treaty, reason: 'breached' | 'annulled' | 'expired'): void {
  if (treaty.status !== 'active' && treaty.status !== 'proposed') return;
  treaty.status = 'annulled';
  const kind = reason === 'expired' ? 'treatyExpired' : 'treatyAnnulled';
  addAlert(w, {
    kind,
    priority: reason === 'expired' ? 2 : 3,
    msgKey: 'alert.' + kind,
    params: {
      a: w.countries.nameJa[treaty.a] || w.countries.nameEn[treaty.a],
      b: w.countries.nameJa[treaty.b] || w.countries.nameEn[treaty.b],
      type: treaty.type,
    },
    actor: treaty.a,
    target: treaty.b,
  });
}

/** 2国間の全条約を解除する（宣戦・戦争終結・国家消滅時） */
export function annulTreatiesBetween(w: WorldState, a: number, b: number, reason: 'breached' | 'annulled' | 'expired' = 'breached'): void {
  const [lo, hi] = pairOf(a, b);
  for (const t of w.treaties) {
    if (t.a === lo && t.b === hi && t.status !== 'annulled') annulTreaty(w, t, reason);
  }
}

/** 国が消滅した時の条約全解除 */
export function annulTreatiesOf(w: WorldState, country: number): void {
  for (const t of w.treaties) {
    if ((t.a === country || t.b === country) && t.status !== 'annulled') annulTreaty(w, t, 'annulled');
  }
}

// ── 多要素関係値（D-040〜D-042）──

export interface RelationContribs {
  ideologyDist: number;
  threat: number;
  interdependence: number;
  commonThreat: number;
  claimsConflict: number;
  treatyBonus: number;
  warPenalty: number;
}

/** イデオロギー距離（D-040: 法体系の距離で代理） */
export function ideologyDistance(w: WorldState, a: number, b: number): number {
  return Math.abs(w.laws[a].economy - w.laws[b].economy) * 10
    + Math.abs(w.laws[a].conscription - w.laws[b].conscription) * 5;
}

/** 国境接続州数（a→bの隣接ペアのうち、領有者がa/bで分かれるもの） */
export function borderProvinceCount(w: WorldState, a: number, b: number): number {
  let count = 0;
  for (let p = 0; p < w.prov.count; p++) {
    if (w.prov.owner[p] !== a) continue;
    for (let i = w.adj.offsets[p]; i < w.adj.offsets[p + 1]; i++) {
      if (w.prov.owner[w.adj.targets[i]] === b) {
        count++;
        break;
      }
    }
  }
  return count;
}

/** 脅威認知（D-042: 軍事力比 × 国境近接度 × 40） */
export function threatPerception(w: WorldState, observer: number, other: number): number {
  const myDivs = w.units.filter((u) => u.owner === observer && !u.destroyed).length;
  const theirDivs = w.units.filter((u) => u.owner === other && !u.destroyed).length;
  const myBorders = borderProvinceCount(w, observer, other);
  let myBorderTotal = 0;
  for (let p = 0; p < w.prov.count; p++) {
    if (w.prov.owner[p] !== observer) continue;
    for (let i = w.adj.offsets[p]; i < w.adj.offsets[p + 1]; i++) {
      const o = w.prov.owner[w.adj.targets[i]];
      if (o !== observer && o >= 0) {
        myBorderTotal++;
        break;
      }
    }
  }
  const powerRatio = theirDivs / Math.max(1, myDivs);
  const proximity = myBorderTotal > 0 ? myBorders / myBorderTotal : 0;
  return Math.min(1, powerRatio) * Math.min(1, proximity) * 40;
}

/** 共通の敵（両国が戦争中の第三国）がいるか */
function hasCommonThreat(w: WorldState, a: number, b: number): boolean {
  const enemiesOf = (c: number) => {
    const set = new Set<number>();
    for (const war of w.wars) {
      if (war.status === 'ended') continue;
      if (war.aggressor === c && war.defender !== b) set.add(war.defender);
      if (war.defender === c && war.aggressor !== b) set.add(war.aggressor);
    }
    return set;
  };
  const ea = enemiesOf(a);
  for (const e of enemiesOf(b)) if (ea.has(e)) return true;
  return false;
}

/** 2国間の領土紛争（領有主張の数・上限-30） */
function claimsConflict(w: WorldState, a: number, b: number): number {
  let n = 0;
  for (const cl of w.claims) {
    if (cl.country === a && w.prov.owner[cl.province] === b) n++;
    if (cl.country === b && w.prov.owner[cl.province] === a) n++;
  }
  return Math.min(30, n * 10);
}

/** 多要素関係値のcontributors（トレースAPI・週次ドリフト共用。全て決定論） */
export function relationContributors(w: WorldState, a: number, b: number): { contribs: RelationContribs; target: number } {
  let ideologyDist = ideologyDistance(w, a, b);
  let threat = threatPerception(w, a, b) + threatPerception(w, b, a);
  threat /= 2;
  const interdependence = activeTreatyBetween(w, a, b, 'trade') ? 15 : 0;
  const commonThreat = hasCommonThreat(w, a, b) ? 10 : 0;
  const claims = claimsConflict(w, a, b);
  let treatyBonus = 0;
  for (const t of w.treaties) {
    const [lo, hi] = pairOf(a, b);
    if (t.a === lo && t.b === hi && t.status === 'active') treatyBonus += TREATY_RELATION_BONUS[t.type];
  }
  const warPenalty = (a !== b && activeWarBetween(w, a, b)) ? WAR_RELATION_PENALTY : 0;
  if (a === b) {
    // 自己ペアは計算対象外（呼び出し側で除外）
    ideologyDist = 0;
    threat = 0;
  }
  const target = clamp(
    0 - ideologyDist - threat + interdependence + commonThreat - claims + treatyBonus - warPenalty,
    -100,
    100,
  );
  return {
    contribs: { ideologyDist, threat: Math.round(threat * 1000) / 1000, interdependence, commonThreat, claimsConflict: claims, treatyBonus, warPenalty },
    target,
  };
}

/** 戦争中か（state.tsのactiveWarBetweenを利用） */

/** ペアが週次更新の対象（activeペア）か: 隣接・条約・戦争・領有主張・既存関係値あり */
export function isActivePair(w: WorldState, a: number, b: number): boolean {
  if (!w.countries.alive[a] || !w.countries.alive[b]) return false;
  if (borderProvinceCount(w, a, b) > 0) return true;
  if (activeWarBetween(w, a, b)) return true;
  const [lo, hi] = pairOf(a, b);
  if (w.treaties.some((t) => t.a === lo && t.b === hi && t.status !== 'annulled')) return true;
  if (w.relations.some((r) => r.a === lo && r.b === hi)) return true;
  for (const cl of w.claims) {
    if (cl.country === a && w.prov.owner[cl.province] === b) return true;
    if (cl.country === b && w.prov.owner[cl.province] === a) return true;
  }
  return false;
}

// ── AI判断（コマンドapply内から呼ぶ。乱数は派生ストリーム）──

/** 外交判断のdecisionLog記録（ai.ts・commands.ts共用。ai.tsとの循環回避のためここに置く） */
export function logDiplomacyDecision(
  w: WorldState,
  country: number,
  module: string,
  options: string[],
  scores: number[],
  chosen: string,
  reason: string,
): void {
  const entry: LogEntry = {
    tick: w.tick,
    module,
    options,
    scores: scores.map((s) => Math.round(s * 1000) / 1000),
    chosen,
    reason,
  };
  const arr = (w.runtime.decisionLog[String(country)] ||= []);
  arr.push(entry);
  if (arr.length > 100) arr.shift();
}

export interface TreatyDecision {
  accept: boolean;
  score: number;
  reason: string;
}

/** AIの条約受諾判断（D-043）。決定論: 派生ストリーム 'diplomacy' */
export function aiEvaluateTreaty(w: WorldState, receiver: number, proposer: number, type: TreatyType): TreatyDecision {
  const rng = deriveStream(w.seed, 'diplomacy', receiver + ':' + proposer + ':' + type + ':' + String(w.tick));
  const noise = [1.0, 0.5, 0.15][w.difficulty];
  const { contribs } = relationContributors(w, receiver, proposer);
  const rel = w.relations.find((r) => r.a === Math.min(receiver, proposer) && r.b === Math.max(receiver, proposer))?.v ?? 0;
  const typeBonus = type === 'trade' ? 10 : type === 'nonaggression' ? 5 : type === 'access' ? 3 : -5;
  const score = rel * 0.6 - contribs.threat * 0.3 + typeBonus - contribs.ideologyDist * 0.5
    + (rng.nextFloat() - 0.5) * noise;
  return {
    accept: score > 0,
    score: Math.round(score * 1000) / 1000,
    reason: 'relation=' + rel + ' threat=' + contribs.threat + ' type=' + type,
  };
}

/** 週次外交システム本体: 条約期限切れ→関係値ドリフト */
export function tickDiplomacyWeekly(w: WorldState): void {
  // 1) 条約の期限切れ
  for (const t of w.treaties) {
    if (t.status === 'active' && t.expiryTick > 0 && w.tick >= t.expiryTick) {
      annulTreaty(w, t, 'expired');
    }
  }
  // 2) 関係値ドリフト（activeペアのみ・国順で決定論）
  for (let a = 0; a < w.countries.count; a++) {
    for (let b = a + 1; b < w.countries.count; b++) {
      if (!isActivePair(w, a, b)) continue;
      const { target } = relationContributors(w, a, b);
      const r = w.relations.find((rel) => rel.a === a && rel.b === b);
      if (r) {
        const d = target - r.v;
        r.v = clamp(r.v + clamp(d, -RELATION_DRIFT_PER_WEEK, RELATION_DRIFT_PER_WEEK), -100, 100);
      } else if (target !== 0) {
        // 新規ペアは目標の初期寄与分だけ関係値を開始（ドリフトで漸近）
        const v0 = clamp(target, -100, 100);
        if (Math.abs(v0) > 0.5) w.relations.push({ a, b, v: v0 * 0.5 });
      }
    }
  }
}
