// Phase 5B preview: provisional game-only definitions. No mutation of WorldState.
// Keep legacy saved template IDs and costs unchanged until the versioned catalog migration.
export const BATTALION_CATALOG_VERSION = 'builtin-v1';
export const MAX_BATTALIONS = 25;
export const MAX_SUPPORT_COMPANIES = 5;

export interface BattalionDef {
  readonly id: string;
  readonly category: 'battalion' | 'support';
  readonly nameJa: string;
  readonly nameEn: string;
  readonly manpower: number;
  readonly infantry: number;
  readonly artillery: number;
  readonly width: number;
  readonly attack: number;
  readonly defense: number;
  readonly org: number;
  readonly speed: number;
  /** Integer tenths to avoid rounding drift across equivalent compositions. */
  readonly supplyTenths: number;
  /** Extra training time in half-days. */
  readonly trainingHalfDays: number;
}

export const BUILTIN_BATTALIONS: readonly BattalionDef[] = Object.freeze([
  { id: 'infantry-v1', category: 'battalion', nameJa: '歩兵大隊', nameEn: 'Infantry battalion', manpower: 1000, infantry: 100, artillery: 20, width: 2, attack: 4, defense: 4, org: 60, speed: 1, supplyTenths: 10, trainingHalfDays: 6 },
  { id: 'artillery-heavy-v1', category: 'battalion', nameJa: '重砲兵大隊', nameEn: 'Heavy artillery battalion', manpower: 1000, infantry: 100, artillery: 40, width: 2, attack: 5, defense: 4, org: 50, speed: 1, supplyTenths: 15, trainingHalfDays: 9 },
  { id: 'engineer-v1', category: 'support', nameJa: '工兵中隊', nameEn: 'Engineer company', manpower: 200, infantry: 20, artillery: 0, width: 0, attack: 0.5, defense: 2, org: 60, speed: 1, supplyTenths: 2, trainingHalfDays: 4 },
  { id: 'recon-v1', category: 'support', nameJa: '偵察中隊', nameEn: 'Recon company', manpower: 100, infantry: 10, artillery: 0, width: 0, attack: 0.5, defense: 0.5, org: 60, speed: 1, supplyTenths: 1, trainingHalfDays: 4 },
].map(d => Object.freeze(d as BattalionDef)));

export interface TemplateComposition {
  battalionIds: string[];
  supportIds: string[];
}
export interface TemplateStats {
  manpower: number;
  infantry: number;
  artillery: number;
  width: number;
  attack: number;
  defense: number;
  org: number;
  speed: number;
  supply: number;
  days: number;
}
export type TemplatePreview =
  | { ok: true; catalogVersion: string; stats: TemplateStats }
  | { ok: false; reason: 'badParams' | 'limitExceeded' | 'duplicateSupport' | 'unknownReference' };

export function previewTemplate(value: unknown): TemplatePreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'badParams' };
  const p = value as Record<string, unknown>;
  if (Object.keys(p).length !== 2 || !Object.hasOwn(p, 'battalionIds') || !Object.hasOwn(p, 'supportIds')) return { ok: false, reason: 'badParams' };
  if (!Array.isArray(p.battalionIds) || !Array.isArray(p.supportIds)) return { ok: false, reason: 'badParams' };
  const battalions: unknown[] = p.battalionIds;
  const supports: unknown[] = p.supportIds;
  if (!battalions.length || battalions.length > MAX_BATTALIONS || supports.length > MAX_SUPPORT_COMPANIES) return { ok: false, reason: 'limitExceeded' };
  if (new Set(supports).size !== supports.length) return { ok: false, reason: 'duplicateSupport' };
  const counts = new Map<string, number>();
  for (const [ids, category] of [[battalions, 'battalion'], [supports, 'support']] as const) {
    for (const id of ids) {
      const d = BUILTIN_BATTALIONS.find(x => x.id === id && x.category === category);
      if (!d) return { ok: false, reason: 'unknownReference' };
      counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    }
  }
  let manpower = 0, infantry = 0, artillery = 0, width = 0, attack = 0, defense = 0, orgWeight = 0;
  let speed = Infinity, supplyTenths = 0, trainingHalfDays = 30;
  // Stable catalog order: identical multisets produce identical numbers regardless of UI ordering.
  for (const d of BUILTIN_BATTALIONS) {
    const n = counts.get(d.id) ?? 0;
    if (!n) continue;
    manpower += d.manpower * n;
    infantry += d.infantry * n;
    artillery += d.artillery * n;
    width += d.width * n;
    attack += d.attack * n;
    defense += d.defense * n;
    orgWeight += d.org * d.manpower * n;
    if (d.category === 'battalion') speed = Math.min(speed, d.speed);
    supplyTenths += d.supplyTenths * n;
    trainingHalfDays += d.trainingHalfDays * n;
  }
  return { ok: true, catalogVersion: BATTALION_CATALOG_VERSION,
    stats: { manpower, infantry, artillery, width, attack, defense, org: orgWeight / manpower, speed,
      supply: supplyTenths / 10, days: Math.min(180, Math.max(30, Math.ceil(trainingHalfDays / 2))) } };
}
