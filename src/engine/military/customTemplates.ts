import { divisionTemplate, type DivisionTemplateId } from './templates';
import type { TrainingOrder } from './templates';
import type { WorldState } from '../core/state';
import {
  BATTALION_CATALOG_VERSION, previewTemplate, type TemplateComposition, type TemplateStats,
} from './templateStats';

export interface CustomTemplateRevision extends TemplateComposition {
  country: number;
  templateId: number;
  revision: number;
  name: string;
  catalogVersion: string;
}

export interface TrainingSpec {
  nameJa: string; nameEn: string;
  manpower: number; infantry: number; artillery: number; days: number;
  templateId?: DivisionTemplateId; customTemplateId?: number; customRevision?: number;
}
export function trainingSpec(w:WorldState,order:Pick<TrainingOrder,'country'|'templateId'|'customTemplateId'|'customRevision'>):TrainingSpec|null {
  if(order.customTemplateId!==undefined || order.customRevision!==undefined){
    if(order.templateId!==undefined || !Number.isSafeInteger(order.customTemplateId) ||
      !Number.isSafeInteger(order.customRevision))return null;
    const rev=w.customTemplates.find(t=>t.country===order.country && t.templateId===order.customTemplateId && t.revision===order.customRevision);
    if(!rev)return null;
    const stats=customTemplateStats(rev);
    return {nameJa:rev.name,nameEn:rev.name,manpower:stats.manpower,infantry:stats.infantry,
      artillery:stats.artillery,days:stats.days,customTemplateId:rev.templateId,customRevision:rev.revision};
  }
  const legacy=divisionTemplate(order.templateId);
  return legacy?{...legacy}:null;
}
export const MAX_CUSTOM_TEMPLATES = 128;
export const MAX_CUSTOM_REVISIONS = 256;

export function validTemplateName(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() &&
    [...value].length >= 1 && [...value].length <= 64 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export function customTemplateStats(revision: CustomTemplateRevision): TemplateStats {
  const preview = previewTemplate({
    battalionIds: revision.battalionIds, supportIds: revision.supportIds,
  });
  if (!preview.ok) throw new Error('invalid custom template');
  return preview.stats;
}

export function latestTemplates(w: WorldState, country: number): CustomTemplateRevision[] {
  const byId = new Map<number, CustomTemplateRevision>();
  for (const rev of w.customTemplates) {
    if (rev.country !== country) continue;
    const current = byId.get(rev.templateId);
    if (!current || current.revision < rev.revision) byId.set(rev.templateId, rev);
  }
  return [...byId.values()].sort((a, b) => a.templateId - b.templateId);
}

export function latestTemplate(w: WorldState, country: number, id: number): CustomTemplateRevision | null {
  return latestTemplates(w, country).find(t => t.templateId === id) ?? null;
}

export function validateCustomTemplates(w: WorldState): string[] {
  if (!Number.isSafeInteger(w.nextCustomTemplateId) || w.nextCustomTemplateId < 1)
    return ['invalid custom template counter'];
  const violations: string[] = [];
  const count = new Map<number, number>();
  const perId = new Map<string, number[]>();
  for (const t of w.customTemplates) {
    if (!t || !Number.isInteger(t.country) || t.country < 0 || t.country >= w.countries.count ||
      !Number.isSafeInteger(t.templateId) || t.templateId < 1 || t.templateId >= w.nextCustomTemplateId ||
      !Number.isSafeInteger(t.revision) || t.revision < 1 ||
      !validTemplateName(t.name) || t.catalogVersion !== BATTALION_CATALOG_VERSION) {
      violations.push('invalid custom template metadata');
      continue;
    }
    const preview = previewTemplate({ battalionIds: t.battalionIds, supportIds: t.supportIds });
    if (!preview.ok) violations.push('invalid custom template composition');
    const key = t.country + ':' + t.templateId;
    const revisions = perId.get(key) ?? [];
    if (revisions.includes(t.revision)) violations.push('duplicate custom template revision');
    revisions.push(t.revision);
    perId.set(key, revisions);
    count.set(t.country, (count.get(t.country) ?? 0) + 1);
    if (count.get(t.country)! > MAX_CUSTOM_REVISIONS) violations.push('custom template revision limit');
  }
  const uniqueCounts = new Map<number, number>();
  for (const [key, revisions] of perId) {
    const country = Number(key.split(':')[0]);
    uniqueCounts.set(country, (uniqueCounts.get(country) ?? 0) + 1);
    revisions.sort((a, b) => a - b);
    // History is contiguous unless a whole unused template was deleted.
    if (revisions[0] !== 1 || revisions.some((revision, index) => revision !== index + 1))
      violations.push('custom template revision gap');
  }
  if ([...uniqueCounts.values()].some(n => n > MAX_CUSTOM_TEMPLATES))
    violations.push('custom template count limit');
  return violations;
}
