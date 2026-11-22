import type { EquipmentModelDef } from '../scenario/types';

let registeredModels: EquipmentModelDef[] = [];
/** Pack-local model definitions; no effect on existing two-goods production/supply ledger. */
export function setEquipmentModels(models: EquipmentModelDef[]): void {
  registeredModels = models.map(m=>({...m}));
}
export function equipmentModels(): EquipmentModelDef[] {
  return registeredModels;
}
export function availableEquipmentModels(models: readonly EquipmentModelDef[], researched: readonly string[]): EquipmentModelDef[] {
  const done = new Set(researched);
  return models.filter(m => !m.unlockTechId || done.has(m.unlockTechId));
}
