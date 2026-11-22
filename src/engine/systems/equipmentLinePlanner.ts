// Phase 6A: deterministic, side-effect-free production-line calculations.
// This is NOT yet wired to production, inventory, recruitment, combat or save state.
import type { EquipmentModelDef } from '../scenario/types';

export const MAX_EQUIPMENT_LINES = 128;
export const MAX_REQUESTED_FACTORIES = 100_000;
export const MAX_PRODUCTION_EFFICIENCY = 0.8;
export const MIN_PRODUCTION_EFFICIENCY = 0.1;
export const PRODUCTION_EFFICIENCY_GAIN_PER_DAY = 0.005;

/** Requested allocation is persistent; actual allocation is computed from factories available today. */
export interface ProductionLinePlan {
  country: number;
  id: number;
  modelId: string;
  requestedFactories: number;
  priority: number;
  efficiency: number;
  active: boolean;
}

export interface AllocatedLine extends ProductionLinePlan {
  allocatedFactories: number;
}
export interface FactoryPlan {
  lines: AllocatedLine[];
  totalAllocated: number;
  unusedFactories: number;
}

export function validateProductionLines(
  lines: readonly ProductionLinePlan[],
  models: readonly EquipmentModelDef[],
): string[] {
  const failures: string[]=[];
  if(lines.length>MAX_EQUIPMENT_LINES)failures.push('lineLimitExceeded');
  const ids=new Set<number>();
  const catalog=new Set(models.map(m=>m.id));
  for(const l of lines){
    if(!Number.isSafeInteger(l.id)||l.id<1||ids.has(l.id)){
      failures.push('invalidLineId');
    }
    ids.add(l.id);
    if(!Number.isSafeInteger(l.country)||l.country<0)failures.push('invalidCountry');
    if(!catalog.has(l.modelId))failures.push('unknownModel');
    if(!Number.isInteger(l.requestedFactories)||l.requestedFactories<0||
      l.requestedFactories>MAX_REQUESTED_FACTORIES)failures.push('invalidFactories');
    if(!Number.isInteger(l.priority)||l.priority<0||l.priority>9)failures.push('invalidPriority');
    if(typeof l.active!=='boolean')failures.push('invalidActive');
    if(!Number.isFinite(l.efficiency)||l.efficiency<MIN_PRODUCTION_EFFICIENCY||
      l.efficiency>MAX_PRODUCTION_EFFICIENCY)failures.push('invalidEfficiency');
  }
  return failures;
}

/** Priority desc, stable line ID asc. Never changes requested factories when capacity shrinks. */
export function allocateProductionLines(
  lines: readonly ProductionLinePlan[],
  availableFactories: number,
): FactoryPlan {
  if(!Number.isSafeInteger(availableFactories)||availableFactories<0)
    throw new RangeError('invalid factory capacity');
  if(lines.length>MAX_EQUIPMENT_LINES)throw new RangeError('line limit exceeded');
  const seen=new Set<number>();
  const country=lines[0]?.country;
  for(const l of lines){
    if(!Number.isSafeInteger(l.country)||l.country<0||l.country!==country||
      !Number.isFinite(l.efficiency)||l.efficiency<MIN_PRODUCTION_EFFICIENCY||
      l.efficiency>MAX_PRODUCTION_EFFICIENCY||
      !Number.isSafeInteger(l.id)||l.id<1||seen.has(l.id)||
      !Number.isSafeInteger(l.requestedFactories)||l.requestedFactories<0||
      l.requestedFactories>MAX_REQUESTED_FACTORIES||
      !Number.isInteger(l.priority)||l.priority<0||l.priority>9||
      typeof l.active!=='boolean')throw new RangeError('invalid production line');
    seen.add(l.id);
  }
  let left=availableFactories;
  const allocations=new Map<number,number>();
  for(const line of [...lines].sort((a,b)=>b.priority-a.priority||a.id-b.id)){
    const assigned=line.active?Math.min(line.requestedFactories,left):0;
    allocations.set(line.id,assigned);
    left-=assigned;
  }
  // Preserve caller order for UI identity; priority decides allocation, not rendering order.
  return {
    lines:lines.map(line=>({...line,allocatedFactories:allocations.get(line.id)??0})),
    totalAllocated:availableFactories-left,
    unusedFactories:left,
  };
}

export function efficiencyAfterSwitch(
  oldModel: EquipmentModelDef,newModel: EquipmentModelDef,oldEfficiency: number,
): number {
  if(!Number.isFinite(oldEfficiency)||oldEfficiency<MIN_PRODUCTION_EFFICIENCY||
    oldEfficiency>MAX_PRODUCTION_EFFICIENCY)throw new RangeError('invalid efficiency');
  if(oldModel.id===newModel.id)return oldEfficiency;
  // Existing catalog category is the first compatibility family: rifle vs artillery.
  if(oldModel.category===newModel.category)
    return Math.max(MIN_PRODUCTION_EFFICIENCY,Math.min(0.5,oldEfficiency*0.5));
  return MIN_PRODUCTION_EFFICIENCY;
}

export function efficiencyAfterDay(efficiency:number,allocatedFactories:number):number {
  if(!Number.isFinite(efficiency)||efficiency<MIN_PRODUCTION_EFFICIENCY||
    efficiency>MAX_PRODUCTION_EFFICIENCY||!Number.isSafeInteger(allocatedFactories)||
    allocatedFactories<0)throw new RangeError('invalid efficiency update');
  if(allocatedFactories===0)return efficiency;
  return Math.min(MAX_PRODUCTION_EFFICIENCY,efficiency+PRODUCTION_EFFICIENCY_GAIN_PER_DAY);
}

/** Candidate output formula; NOT applied to the current two-goods stocks. */
export function modelDailyOutput(
  allocation:AllocatedLine,model:EquipmentModelDef,outputMultiplier:number,
):number {
  if(allocation.modelId!==model.id||
    !Number.isSafeInteger(allocation.allocatedFactories)||allocation.allocatedFactories<0||
    allocation.allocatedFactories>allocation.requestedFactories||
    !Number.isFinite(outputMultiplier)||outputMultiplier<0)throw new RangeError('invalid model output');
  const base = model.category==='infantry'?2:1.2;
  return allocation.allocatedFactories*base*model.outputFactor*
    allocation.efficiency*outputMultiplier;
}

export interface ModelOutput {
  modelId: string;
  produced: number;
  fractional: number;
}

/** Fractional carry is bound to modelId, never silently transferred to another model. */
export function settleModelOutputs(
  allocations:readonly AllocatedLine[],models:readonly EquipmentModelDef[],
  previousFractional:Readonly<Record<string,number>>,outputMultiplier:number,
):ModelOutput[] {
  const catalog=new Map(models.map(m=>[m.id,m]));
  const totals=new Map<string,number>();
  for(const line of [...allocations].sort((a,b)=>a.id-b.id)){
    const model=catalog.get(line.modelId);
    if(!model)throw new RangeError('unknown equipment model');
    if(line.allocatedFactories===0)continue;
    const output=modelDailyOutput(line,model,outputMultiplier);
    totals.set(model.id,(totals.get(model.id)??0)+output);
  }
  const keys=new Set([...Object.keys(previousFractional),...totals.keys()]);
  return [...keys].sort().map(modelId=>{
    const carry=previousFractional[modelId]??0;
    if(!Number.isFinite(carry)||carry<0||carry>=1)throw new RangeError('invalid fractional carry');
    if(!catalog.has(modelId))throw new RangeError('unknown equipment model carry');
    if(!totals.has(modelId))return {modelId,produced:0,fractional:carry};
    const output=carry+totals.get(modelId)!;
    if(!Number.isFinite(output)||output<0)throw new RangeError('invalid daily model output');
    const produced=Math.floor(output+1e-10);
    const fractional=Math.max(0,output-produced);
    return {modelId,produced,fractional};
  });
}
