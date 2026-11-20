// 初期テンプレートの定義。v5互換のため既存IDのコストは変更せず、新版IDを追加する。
export const DIVISION_TEMPLATES = [
  { id: 'light-v1', nameJa: '軽歩兵師団', nameEn: 'Light infantry', manpower: 5000, infantry: 500, artillery: 100, days: 30, attack: 1 },
  { id: 'standard-v1', nameJa: '標準歩兵師団', nameEn: 'Infantry division', manpower: 10000, infantry: 1000, artillery: 200, days: 45, attack: 1 },
  { id: 'artillery-v1', nameJa: '重砲兵師団', nameEn: 'Artillery division', manpower: 10000, infantry: 1000, artillery: 400, days: 60, attack: 1.25 },
] as const;
export type DivisionTemplateId = typeof DIVISION_TEMPLATES[number]['id'];
export function divisionTemplate(id: unknown) { return DIVISION_TEMPLATES.find(t => t.id === id); }
export const MAX_TRAINING = 20;
export interface TrainingOrder {
  id: number;
  country: number;
  province: number;
  templateId?: DivisionTemplateId;
  /** Frozen reference to one immutable custom revision; legacy orders keep templateId. */
  customTemplateId?: number;
  customRevision?: number;
  readyTick: number;
}
