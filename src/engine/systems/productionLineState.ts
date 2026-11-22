// Phase6A persistent production-line planning (v14).
// These plans are deliberately not an inventory ledger: the legacy two-goods
// production system remains authoritative until the model-stock migration.
import type { WorldState } from '../core/state';
import type { EquipmentModelDef } from '../scenario/types';
import { MAX_EQUIPMENT_LINES, MAX_REQUESTED_FACTORIES, validateProductionLines,
  type ProductionLinePlan } from './equipmentLinePlanner';

export interface ProductionLineState {
  productionLines: ProductionLinePlan[];
  nextProductionLineId: number;
}

export function legacyProductionLineState(
  countryFactories: readonly number[], shares: readonly number[],
  models: readonly EquipmentModelDef[],
): ProductionLineState {
  const hasInf=models.some(m=>m.id==='infantry-rifle-1990');
  const hasArt=models.some(m=>m.id==='artillery-towed-2000');
  const productionLines:ProductionLinePlan[]=[];
  let nextProductionLineId=1;
  for(let country=0;country<countryFactories.length;country++){
    const factories=countryFactories[country],share=shares[country]??0.2;
    if(!Number.isSafeInteger(factories)||factories<0||
      factories>MAX_REQUESTED_FACTORIES||!Number.isFinite(share)||share<0||share>0.5)
      throw new RangeError('invalid legacy production allocation');
    const artFactories=Math.floor(factories*share),infFactories=factories-artFactories;
    if(hasInf)productionLines.push({country,id:nextProductionLineId++,modelId:'infantry-rifle-1990',
      requestedFactories:infFactories,priority:5,efficiency:0.8,active:true});
    if(hasArt)productionLines.push({country,id:nextProductionLineId++,modelId:'artillery-towed-2000',
      requestedFactories:artFactories,priority:5,efficiency:0.8,active:true});
  }
  return {productionLines,nextProductionLineId};
}

export function validateProductionLineState(
  state:ProductionLineState,models:readonly EquipmentModelDef[],countryCount:number,
):string[]{
  if(!state||!Array.isArray(state.productionLines)||
    !Number.isSafeInteger(state.nextProductionLineId)||state.nextProductionLineId<1)
    return ['invalid production line state'];
  const problems:string[]=[];
  const ids=new Set<number>();
  const byCountry=new Map<number,ProductionLinePlan[]>();
  for(const line of state.productionLines){
    if(!line||typeof line!=='object') { problems.push('invalid production line entry'); continue; }
    if(!Number.isSafeInteger(line.country)||line.country<0||line.country>=countryCount){
      problems.push('production line country out of range');continue;
    }
    if(ids.has(line.id)||!Number.isSafeInteger(line.id)||line.id<1||
      line.id>=state.nextProductionLineId)problems.push('invalid global production line id');
    ids.add(line.id);
    const list=byCountry.get(line.country)??[];
    list.push(line);byCountry.set(line.country,list);
  }
  for(const lines of byCountry.values()){
    if(lines.length>MAX_EQUIPMENT_LINES)problems.push('production line per-country limit');
    problems.push(...validateProductionLines(lines,models));
  }
  return problems;
}

export function modelUnlocked(w:WorldState,country:number,model:EquipmentModelDef):boolean {
  return !model.unlockTechId || w.research[country]?.done.includes(model.unlockTechId)===true;
}

export function countryProductionLines(w:WorldState,country:number):ProductionLinePlan[] {
  return w.productionLines.filter(l=>l.country===country);
}
