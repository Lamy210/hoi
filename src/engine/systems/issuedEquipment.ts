// v18: Identifiable equipment issued from the national warehouse to a
// training reservation or a deployed unit. Subsets of the existing two-goods
// equipment amounts, NOT extra goods or battle multipliers.
import type {WorldState} from '../core/state';
import type {EquipmentModelDef} from '../scenario/types';
import type {ModelWarehouseRecord,WarehouseCategory} from './modelWarehouse';
import {equipmentModels} from '../military/equipmentCatalog';
import {trainingSpec} from '../military/customTemplates';

export type EquipmentHolder = 'training'|'unit';
export interface IssuedEquipmentRecord {
  holder: EquipmentHolder;
  holderId: number;
  modelId: string;
  quantity: number;
}
const sorted=(a:IssuedEquipmentRecord,b:IssuedEquipmentRecord)=>
  a.holder.localeCompare(b.holder,'en')||a.holderId-b.holderId||
  (a.modelId<b.modelId?-1:a.modelId>b.modelId?1:0);
const tolerance=(v:number)=>1e-7*Math.max(1,Math.abs(v));

/** Record the typed part already removed from the country stockpile. */
export function attributeEquipment(w:WorldState,holder:EquipmentHolder,
  holderId:number,rows:readonly ModelWarehouseRecord[]):void {
  for(const row of rows){
    if(row.quantity<=0)continue;
    const existing=w.issuedEquipment.find(r=>r.holder===holder&&
      r.holderId===holderId&&r.modelId===row.modelId);
    if(existing)existing.quantity+=row.quantity;
    else w.issuedEquipment.push({holder,holderId,modelId:row.modelId,quantity:row.quantity});
  }
  w.issuedEquipment.sort(sorted);
}

/** Return and unlink all typed equipment from a destroyed or refunded holder. */
export function releaseEquipmentAttribution(w:WorldState,holder:EquipmentHolder,
  holderId:number):IssuedEquipmentRecord[] {
  const moved=w.issuedEquipment.filter(r=>r.holder===holder&&r.holderId===holderId);
  if(moved.length)w.issuedEquipment=w.issuedEquipment.filter(r=>r.holder!==holder||r.holderId!==holderId);
  return moved;
}

/** Move the same reserved equipment into the new unit, without changing stocks. */
export function deployAttributedEquipment(w:WorldState,orderId:number):void {
  const rows=releaseEquipmentAttribution(w,'training',orderId);
  attributeEquipment(w,'unit',orderId,rows.map(r=>({country:0,modelId:r.modelId,quantity:r.quantity})));
}

/** Loss/refit leaves tagged items only where an equivalent item still exists.
 * Assume unclassified equipment is consumed before identified models.
 */
export function trimUnitEquipment(w:WorldState,unitId:number,category:WarehouseCategory,
  remaining:number):void {
  if(!Number.isFinite(remaining)||remaining<0)throw new RangeError('invalid unit equipment');
  const categories=new Map(equipmentModels().map(m=>[m.id,m.category]));
  const rows=w.issuedEquipment.filter(r=>r.holder==='unit'&&r.holderId===unitId&&
    categories.get(r.modelId)===category).sort(sorted);
  let typed=rows.reduce((sum,r)=>sum+r.quantity,0);
  for(const row of rows){
    if(typed<=remaining+tolerance(remaining))break;
    const removed=Math.min(row.quantity,Math.max(0,typed-remaining));
    row.quantity-=removed;typed-=removed;
  }
  w.issuedEquipment=w.issuedEquipment.filter(row=>row.quantity>0);
}

export function validateIssuedEquipment(w:WorldState,models:readonly EquipmentModelDef[]):string[] {
  const records=w.issuedEquipment;
  if(!Array.isArray(records)||records.length>(w.units.length+w.trainingQueue.length)*models.length)
    return ['invalid issued equipment ledger size'];
  const modelCategories=new Map(models.map(m=>[m.id,m.category]));
  const orders=new Map(w.trainingQueue.map(o=>[o.id,o]));
  const units=new Map(w.units.map(u=>[u.id,u]));
  const seen=new Set<string>(),totals=new Map<string,number>(),errors:string[]=[];
  for(const value of records){
    if(!value||typeof value!=='object'||Array.isArray(value)){
      errors.push('invalid issued equipment record');continue;
    }
    const row=value as Partial<IssuedEquipmentRecord>;
    if(row.holder!=='training'&&row.holder!=='unit'){
      errors.push('invalid issued equipment holder');continue;
    }
    if(!Number.isSafeInteger(row.holderId)||row.holderId!<1){
      errors.push('invalid issued equipment id');continue;
    }
    if(typeof row.modelId!=='string'||!modelCategories.has(row.modelId)){
      errors.push('invalid issued equipment model');continue;
    }
    if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||
      row.quantity<=0||row.quantity>Number.MAX_SAFE_INTEGER){
      errors.push('invalid issued equipment quantity');continue;
    }
    const holder=row.holder==='unit'?units.get(row.holderId):orders.get(row.holderId);
    if(!holder||(row.holder==='training'&&orders.get(row.holderId)?.status==='queued')){
      errors.push('orphan issued equipment holder');continue;
    }
    const key=row.holder+':'+row.holderId+':'+row.modelId;
    if(seen.has(key))errors.push('duplicate issued equipment record');
    seen.add(key);
    const group=row.holder+':'+row.holderId+':'+modelCategories.get(row.modelId);
    totals.set(group,(totals.get(group)??0)+row.quantity);
  }
  // Reservation templates are validated by the loader before this call.
  for(const unit of w.units){
    for(const category of ['infantry','artillery'] as const){
      const actual=category==='infantry'?unit.infEquipment:unit.artEquipment;
      const typed=totals.get('unit:'+unit.id+':'+category)??0;
      if(typed>actual+tolerance(actual))errors.push('issued unit equipment exceeds held equipment');
    }
  }
  for(const order of w.trainingQueue){
    const max=trainingSpec(w,order);
    if(!max)continue;
    for(const category of ['infantry','artillery'] as const){
      const actual=category==='infantry'?max.infantry:max.artillery;
      const typed=totals.get('training:'+order.id+':'+category)??0;
      if(typed>actual+tolerance(actual))errors.push('issued training equipment exceeds reservation');
    }
  }
  return errors;
}
