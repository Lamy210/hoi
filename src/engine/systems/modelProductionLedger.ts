// 型番別「累計製造量」の履歴台帳。これは在庫・保有装備の台帳ではない。
// v16で新設。旧版セーブは空配列に移行し、legacy方式の出力は型番未分類とする。
import type { WorldState } from '../core/state';
import type { EquipmentModelDef } from '../scenario/types';

export interface ModelProductionRecord {
  country: number;
  modelId: string;
  produced: number;
}

export interface ProducedModelLine {
  modelId: string;
  estimatedDailyOutput: number;
}

/** Actual line production only. Pure forecasts and legacy shares never write this ledger. */
export function recordModelProduction(
  w: WorldState, country: number, lines: readonly ProducedModelLine[],
): void {
  if (!Number.isSafeInteger(country) || country < 0 || country >= w.countries.count)
    throw new RangeError('invalid production ledger country');
  if (w.productionMode[country] !== 'lines') throw new Error('ledger requires line mode');

  for (const line of lines) {
    const amount = line.estimatedDailyOutput;
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('invalid production amount');
    if (amount === 0) continue;
    const entry = w.modelProduction.find(r=>r.country === country && r.modelId === line.modelId);
    if (entry) {
      const total=entry.produced + amount;
      if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new RangeError('production total overflow');
      entry.produced=total;
    } else {
      if (amount > Number.MAX_SAFE_INTEGER) throw new RangeError('production amount overflow');
      w.modelProduction.push({ country, modelId:line.modelId, produced:amount });
    }
  }
  // Canonical order also makes manual load assertions, save bytes and hashes stable.
  w.modelProduction.sort((a,b)=>a.country-b.country || (a.modelId<b.modelId?-1:a.modelId>b.modelId?1:0));
}

/** Validate against a pinned pack catalog before constructing a WorldState. */
export function validateModelProductionLedger(
  records: unknown, models: readonly EquipmentModelDef[], countryCount: number,
): string[] {
  if (!Array.isArray(records) || records.length > countryCount * models.length)
    return ['invalid model production ledger size'];
  const known=new Set(models.map(m=>m.id));
  const seen=new Set<string>();
  const problems:string[]=[];
  for (const value of records) {
    if (!value || typeof value!=='object' || Array.isArray(value)) {
      problems.push('invalid production ledger entry');
      continue;
    }
    const row=value as Partial<ModelProductionRecord>;
    if (!Number.isSafeInteger(row.country) || row.country! < 0 || row.country! >= countryCount)
      problems.push('invalid production ledger country');
    if (typeof row.modelId!=='string' || !known.has(row.modelId))
      problems.push('invalid production ledger model');
    if (typeof row.produced!=='number' || !Number.isFinite(row.produced) ||
      row.produced < 0 || row.produced > Number.MAX_SAFE_INTEGER)
      problems.push('invalid production ledger quantity');
    if (typeof row.modelId==='string' && Number.isSafeInteger(row.country)) {
      const id=row.country + ':' + row.modelId;
      if (seen.has(id)) problems.push('duplicate production ledger entry');
      seen.add(id);
    }
  }
  return problems;
}
