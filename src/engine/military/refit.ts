// 共通の師団再編契約。検証完了までは WorldState を一切変更しない。
// 再編では現有装備の損傷を維持し、保有可能数の増加分のみ購買する。
import type { Unit, WorldState } from '../core/state';
import { customTemplateStats, type CustomTemplateRevision } from './customTemplates';
import type { TemplateStats } from './templateStats';
import { adjustWarehouse } from '../systems/modelWarehouse';

export const MAX_BATCH_REFIT = 100;
export type ResourceAmounts = [manpower: number, infantry: number, artillery: number];

type RefitCapacity = Pick<Unit, 'manpower' | 'maxManpower' |
  'infEquipment' | 'maxInfEquipment' | 'artEquipment' | 'maxArtEquipment'>;
type TargetCapacity = Pick<TemplateStats, 'manpower' | 'infantry' | 'artillery'>;

export function calculateRefitResources(units: readonly RefitCapacity[], target: TargetCapacity):
  { purchase: ResourceAmounts; refund: ResourceAmounts; net: ResourceAmounts } {
  const purchase: ResourceAmounts = [0, 0, 0], refund: ResourceAmounts = [0, 0, 0];
  const newMax = [target.manpower, target.infantry, target.artillery];
  for (const u of units) {
    const oldMax = [u.maxManpower, u.maxInfEquipment, u.maxArtEquipment];
    const oldHeld = [u.manpower, u.infEquipment, u.artEquipment];
    for (let i = 0; i < 3; i++) {
      purchase[i] += Math.max(0, newMax[i] - oldMax[i]);
      refund[i] += Math.max(0, oldHeld[i] - newMax[i]);
    }
  }
  return { purchase, refund, net: purchase.map((v, i) => v - refund[i]) as ResourceAmounts };
}

export interface RefitBatch {
  units: Unit[];
  revision: CustomTemplateRevision;
  stats: TemplateStats;
  amounts: ReturnType<typeof calculateRefitResources>;
}

/** 同一ターンの validate と apply の間では別命令の割り込みはない。 */
export function planBatchRefit(w: WorldState, country: number, unitIds: unknown, templateId: unknown, revision: unknown):
  { reason: string; plan?: never } | { reason: null; plan: RefitBatch } {
  if (!Array.isArray(unitIds) || unitIds.length < 1 ||
    unitIds.some(id => !Number.isSafeInteger(id) || id < 0) ||
    !Number.isSafeInteger(templateId) || !Number.isSafeInteger(revision)) return { reason: 'badParams' };
  if (unitIds.length > MAX_BATCH_REFIT) return { reason: 'limitExceeded' };
  if (new Set(unitIds).size !== unitIds.length) return { reason: 'badParams' };
  const units = unitIds.map(id => w.units.find(u => u.id === id && !u.destroyed));
  if (units.some(u => !u || u.owner !== country)) return { reason: 'notYourUnit' };
  const rev = w.customTemplates.find(t => t.country === country &&
    t.templateId === templateId && t.revision === revision);
  if (!rev) return { reason: 'notYourTemplate' };
  const selected = units as Unit[];
  if (selected.some(u => u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc)))
    return { reason: 'unitBusy' };
  if (selected.some(u => w.prov.controller[u.loc] !== country)) return { reason: 'notControlledByYou' };
  const stats = customTemplateStats(rev);
  const amounts = calculateRefitResources(selected, stats);
  const stock: ResourceAmounts = [
    w.countries.manpowerPool[country],
    w.countries.infEquipmentStock[country],
    w.countries.artEquipmentStock[country],
  ];
  if (stock[0] < amounts.net[0]) return { reason: 'insufficientManpower' };
  if (stock[1] < amounts.net[1]) return { reason: 'insufficientEquipment' };
  if (stock[2] < amounts.net[2]) return { reason: 'insufficientArtillery' };
  return { reason: null, plan: { units: selected, revision: rev, stats, amounts } };
}

/** チェック済み計画を一括で適用する。資源台帳は全師団変更後に1度だけ更新。 */
export function applyBatchRefit(w: WorldState, country: number, plan: RefitBatch): void {
  const { units, stats, revision, amounts } = plan;
  const capacity: ResourceAmounts = [stats.manpower, stats.infantry, stats.artillery];
  for (const u of units) {
    const held: ResourceAmounts = [u.manpower, u.infEquipment, u.artEquipment];
    const oldMax: ResourceAmounts = [u.maxManpower, u.maxInfEquipment, u.maxArtEquipment];
    const next = capacity.map((v, i) => Math.min(held[i], v) + Math.max(0, v - oldMax[i])) as ResourceAmounts;
    [u.manpower, u.infEquipment, u.artEquipment] = next;
    [u.maxManpower, u.maxInfEquipment, u.maxArtEquipment] = capacity;
    u.org = Math.min(u.org, Math.min(100, stats.org)) * 0.5;
    u.customTemplateId = revision.templateId;
    u.customRevision = revision.revision;
    delete u.templateId;
  }
  w.countries.manpowerPool[country] -= amounts.net[0];
  adjustWarehouse(w,country,'infantry',-amounts.net[1]);
  adjustWarehouse(w,country,'artillery',-amounts.net[2]);
}
