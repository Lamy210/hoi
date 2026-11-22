// A one-for-one equipment exchange for an idle, friendly-controlled division.
// Warehouse and division two-goods totals remain unchanged; only model labels
// move between the existing v17 modelStock and v18 issuedEquipment ledgers.
import type {WorldState} from '../core/state';
import type {EquipmentModelDef} from '../scenario/types';
import {equipmentModels} from './equipmentCatalog';
import {creditModelWarehouse,withdrawModelWarehouse} from '../systems/modelWarehouse';
import {attributeEquipment} from '../systems/issuedEquipment';

export const UNCLASSIFIED_EQUIPMENT='unclassified';
export const MAX_MODEL_EXCHANGE=100000;

type ExchangeArgs={unitId:number;fromModelId:string;toModelId:string;quantity:number};
function catalogModels():Map<string,EquipmentModelDef>{
  return new Map(equipmentModels().map(m=>[m.id,m]));
}
export function validateModelExchange(w:WorldState,c:number,p:Record<string,unknown>):string|null {
  const {unitId,fromModelId,toModelId,quantity}=p;
  if(typeof unitId!=='number'||!Number.isSafeInteger(unitId)||unitId<1||
    typeof fromModelId!=='string'||typeof toModelId!=='string'||
    typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<1||
    quantity>MAX_MODEL_EXCHANGE)return 'badParams';
  if(fromModelId===toModelId)return 'sameModel';
  const u=w.units.find(x=>x.id===unitId&&!x.destroyed);
  if(!u||u.owner!==c)return 'notYourUnit';
  if(u.path.length||u.encircled||w.runtime.activeBattles.has(u.loc))return 'unitBusy';
  if(w.prov.controller[u.loc]!==c)return 'notControlledByYou';
  const models=catalogModels(),target=models.get(toModelId);
  if(!target)return 'badModel';
  const source=fromModelId===UNCLASSIFIED_EQUIPMENT?null:models.get(fromModelId);
  if(fromModelId!==UNCLASSIFIED_EQUIPMENT&&!source)return 'badModel';
  if(source&&source.category!==target.category)return 'incompatibleModel';
  const targetStock=w.modelStock.find(r=>r.country===c&&r.modelId===toModelId)?.quantity??0;
  if(targetStock<quantity)return 'insufficientModelStock';
  const actual=target.category==='infantry'?u.infEquipment:u.artEquipment;
  const typedByCategory=w.issuedEquipment.filter(r=>r.holder==='unit'&&r.holderId===unitId&&
    models.get(r.modelId)?.category===target.category);
  const available=source
    ? typedByCategory.find(r=>r.modelId===fromModelId)?.quantity??0
    : Math.max(0,actual-typedByCategory.reduce((sum,r)=>sum+r.quantity,0));
  if(available+1e-7<quantity)return 'insufficientUnitEquipment';
  return null;
}

export function applyModelExchange(w:WorldState,c:number,p:Record<string,unknown>):void {
  const problem=validateModelExchange(w,c,p);
  if(problem)throw new Error('invalid model exchange: '+problem);
  const {unitId,fromModelId,toModelId,quantity}=p as ExchangeArgs;
  // Physical exchange: remove new equipment from the warehouse, then return
  // the same number of old/unclassified pieces. No net two-goods movement.
  withdrawModelWarehouse(w,c,toModelId,quantity);
  const oldModel=fromModelId===UNCLASSIFIED_EQUIPMENT?null:fromModelId;
  const category=catalogModels().get(toModelId)!.category;
  const aggregate=category==='infantry'?w.countries.infEquipmentStock:w.countries.artEquipmentStock;
  aggregate[c]+=quantity;
  if(oldModel)creditModelWarehouse(w,c,oldModel,quantity);
  if(oldModel){
    const row=w.issuedEquipment.find(r=>r.holder==='unit'&&r.holderId===unitId&&r.modelId===oldModel)!;
    row.quantity-=quantity;
    w.issuedEquipment=w.issuedEquipment.filter(r=>r.quantity>0);
  }
  attributeEquipment(w,'unit',unitId,[{country:c,modelId:toModelId,quantity}]);
}

/**
 * Batch exchange is preflighted against the combined warehouse demand, not
 * validated independently per unit. Duplicate IDs are rejected and command
 * order is canonical. Minimum two divisions; single-unit callers retain the
 * original exchangeUnitEquipment command.
 */
export const MAX_BATCH_MODEL_EXCHANGE=100;
export interface BatchModelExchangePlan {
  unitIds:number[];
  fromModelId:string;
  toModelId:string;
  quantity:number;
  total:number;
}
export type BatchModelExchangeDecision=
  {reason:string;plan:null}|{reason:null;plan:BatchModelExchangePlan};

export function planBatchModelExchange(w:WorldState,c:number,p:Record<string,unknown>):
  BatchModelExchangeDecision {
  const ids=p.unitIds;
  const {fromModelId,toModelId,quantity}=p;
  if(!Array.isArray(ids)||ids.length<2||ids.length>MAX_BATCH_MODEL_EXCHANGE||
    ids.some(x=>typeof x!=='number'||!Number.isSafeInteger(x)||x<1)||
    new Set(ids).size!==ids.length||
    typeof fromModelId!=='string'||typeof toModelId!=='string'||
    typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<1||
    quantity>MAX_MODEL_EXCHANGE)return {reason:'badParams',plan:null};
  const sortedIds=(ids as number[]).slice().sort((a,b)=>a-b);
  for(const id of sortedIds){
    const problem=validateModelExchange(w,c,{
      unitId:id,fromModelId,toModelId,quantity,
    });
    if(problem)return {reason:problem,plan:null};
  }
  const total=quantity*sortedIds.length;
  if(!Number.isSafeInteger(total))return {reason:'badParams',plan:null};
  const targetStock=w.modelStock.find(r=>r.country===c&&r.modelId===toModelId)?.quantity??0;
  if(targetStock<total)return {reason:'insufficientModelStock',plan:null};
  return {reason:null,plan:{unitIds:sortedIds,fromModelId,toModelId,quantity,total}};
}

/** Copy-on-write: even if a later exchange throws, none of the live ledgers
 * are modified. Commit stock, typed warehouse, and issued ledger together.
 */
export function applyBatchModelExchange(w:WorldState,c:number,p:Record<string,unknown>):void {
  const decision=planBatchModelExchange(w,c,p);
  if(!decision.plan)throw new Error('invalid batch model exchange: '+decision.reason);
  const stockInf=w.countries.infEquipmentStock.slice();
  const stockArt=w.countries.artEquipmentStock.slice();
  const candidate:WorldState={
    ...w,
    countries:{...w.countries,infEquipmentStock:stockInf,artEquipmentStock:stockArt},
    modelStock:w.modelStock.map(row=>({...row})),
    issuedEquipment:w.issuedEquipment.map(row=>({...row})),
  };
  const {unitIds,fromModelId,toModelId,quantity}=decision.plan;
  for(const unitId of unitIds){
    applyModelExchange(candidate,c,{unitId,fromModelId,toModelId,quantity});
  }
  w.countries.infEquipmentStock=stockInf;
  w.countries.artEquipmentStock=stockArt;
  w.modelStock=candidate.modelStock;
  w.issuedEquipment=candidate.issuedEquipment;
}
