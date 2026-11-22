// Phase 6D (v17): typed warehouse subsets of the authoritative two-goods stocks.
// Typed quantities are NOT extra equipment. The unclassified balance is inferred
// as max(0, aggregate stock - sum(typed quantities)) for each country/category.
// Equipment consumed by training, units, reinforcements and refits loses its type
// identity; refunds from units become unclassified. Market trades preserve typed
// provenance. Old saves start with all stock unclassified.
import type { WorldState } from '../core/state';
import type { EquipmentModelDef } from '../scenario/types';
import { equipmentModels } from '../military/equipmentCatalog';

export interface ModelWarehouseRecord {
  country: number;
  modelId: string;
  quantity: number;
}
export type WarehouseCategory = EquipmentModelDef['category'];
const sortedModelId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const EPS=1e-7;

function stock(w:WorldState,category:WarehouseCategory):number[] {
  return category==='infantry'?w.countries.infEquipmentStock:w.countries.artEquipmentStock;
}
function categoryOf(modelId:string):WarehouseCategory {
  const model=equipmentModels().find(m=>m.id===modelId);
  if(!model)throw new RangeError('unknown warehouse model');
  return model.category;
}
function assertCountry(w:WorldState,c:number):void {
  if(!Number.isSafeInteger(c)||c<0||c>=w.countries.count)throw new RangeError('warehouse country');
}
function activeRows(w:WorldState,c:number,category:WarehouseCategory):ModelWarehouseRecord[] {
  const models=new Map(equipmentModels().map(m=>[m.id,m.category]));
  return w.modelStock.filter(r=>r.country===c&&models.get(r.modelId)===category)
    .sort((a,b)=>sortedModelId(a.modelId,b.modelId));
}
export function typedWarehouseTotal(w:WorldState,c:number,category:WarehouseCategory):number {
  return activeRows(w,c,category).reduce((sum,row)=>sum+row.quantity,0);
}
export function unclassifiedWarehouse(w:WorldState,c:number,category:WarehouseCategory):number {
  return Math.max(0,stock(w,category)[c]-typedWarehouseTotal(w,c,category));
}

/** Credits model metadata for goods ALREADY added to the legacy aggregate stock. */
export function creditModelWarehouse(w:WorldState,c:number,modelId:string,amount:number):void {
  assertCountry(w,c);
  const category=categoryOf(modelId);
  if(!Number.isFinite(amount)||amount<0||amount>Number.MAX_SAFE_INTEGER)
    throw new RangeError('invalid model warehouse credit');
  if(amount===0)return;
  const old=typedWarehouseTotal(w,c,category);
  const aggregate=stock(w,category)[c];
  if(old+amount>aggregate+EPS*Math.max(1,Math.abs(aggregate)))
    throw new RangeError('model warehouse exceeds aggregate');
  const found=w.modelStock.find(r=>r.country===c&&r.modelId===modelId);
  if(found){
    if(!Number.isFinite(found.quantity+amount)||found.quantity+amount>Number.MAX_SAFE_INTEGER)
      throw new RangeError('model warehouse overflow');
    found.quantity+=amount;
  } else w.modelStock.push({country:c,modelId,quantity:amount});
  w.modelStock.sort((a,b)=>a.country-b.country||sortedModelId(a.modelId,b.modelId));
}

/** Withdraw a specific identified model rather than the default unclassified-first mix.
 * Used by an explicit division re-equipment order after its stock is validated.
 */
export function withdrawModelWarehouse(w:WorldState,c:number,modelId:string,amount:number):void {
  assertCountry(w,c);
  const category=categoryOf(modelId);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000)
    throw new RangeError('invalid specific equipment withdrawal');
  const row=w.modelStock.find(r=>r.country===c&&r.modelId===modelId);
  if(!row||row.quantity<amount)throw new RangeError('insufficient specific equipment');
  row.quantity-=amount;
  w.modelStock=w.modelStock.filter(r=>r.quantity>0);
  stock(w,category)[c]-=amount;
}

/**
 * Signed change to aggregate warehouse stock. For debits use unclassified
 * goods first, then model IDs ascending. Returns the typed part removed,
 * allowing transfers to retain exact model provenance.
 */
export function adjustWarehouse(w:WorldState,c:number,category:WarehouseCategory,delta:number):
  ModelWarehouseRecord[] {
  assertCountry(w,c);
  if(!Number.isFinite(delta))throw new RangeError('invalid warehouse delta');
  const pool=stock(w,category);
  const transferred:ModelWarehouseRecord[]=[];
  if(delta<0){
    const availableUntyped=unclassifiedWarehouse(w,c,category);
    let amount=Math.max(0,-delta-availableUntyped);
    for(const row of activeRows(w,c,category)){
      if(amount<=0)break;
      const moved=Math.min(row.quantity,amount);
      if(moved<=0)continue;
      row.quantity=Math.max(0,row.quantity-moved);
      transferred.push({country:c,modelId:row.modelId,quantity:moved});
      amount=Math.max(0,amount-moved);
    }
    w.modelStock=w.modelStock.filter(row=>row.quantity>0);
  }
  // Retain the old double-precision aggregate arithmetic exactly, for legacy
  // saves, battle logic, and existing deterministic replay contracts.
  pool[c]+=delta;
  return transferred;
}

export function transferWarehouse(w:WorldState,seller:number,buyer:number,
  category:WarehouseCategory,amount:number):void {
  assertCountry(w,seller);assertCountry(w,buyer);
  if(!Number.isFinite(amount)||amount<0)throw new RangeError('invalid warehouse transfer');
  if(seller===buyer||amount===0)return;
  const typed=adjustWarehouse(w,seller,category,-amount);
  adjustWarehouse(w,buyer,category,amount);
  for(const row of typed)creditModelWarehouse(w,buyer,row.modelId,row.quantity);
}

/** Validate the subset invariant when loading v17; use the pinned pack, not global catalog. */
export function validateModelWarehouse(data:unknown,models:readonly EquipmentModelDef[],
  countryCount:number,infStock:unknown,artStock:unknown):string[] {
  if(!Array.isArray(data)||data.length>countryCount*models.length)return ['invalid v17 warehouse size'];
  if(!Array.isArray(infStock)||!Array.isArray(artStock)||
    infStock.length!==countryCount||artStock.length!==countryCount)
    return ['invalid v17 warehouse aggregate'];
  const known=new Map(models.map(m=>[m.id,m.category]));
  const seen=new Set<string>(),totals=new Map<string,number>(),errors:string[]=[];
  for(const item of data){
    if(!item||typeof item!=='object'||Array.isArray(item)){
      errors.push('invalid v17 warehouse record');continue;
    }
    const row=item as Partial<ModelWarehouseRecord>;
    if(!Number.isSafeInteger(row.country)||row.country!<0||row.country!>=countryCount){
      errors.push('invalid v17 warehouse country');continue;
    }
    if(typeof row.modelId!=='string'||!known.has(row.modelId)){
      errors.push('invalid v17 warehouse model');continue;
    }
    if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||
      row.quantity<=0||row.quantity>Number.MAX_SAFE_INTEGER){
      errors.push('invalid v17 warehouse quantity');continue;
    }
    const key=row.country+':'+row.modelId;
    if(seen.has(key))errors.push('duplicate v17 warehouse entry');
    seen.add(key);
    const cat=known.get(row.modelId);
    const group=row.country+':'+cat;
    totals.set(group,(totals.get(group)??0)+row.quantity);
  }
  for(let c=0;c<countryCount;c++)for(const cat of ['infantry','artillery'] as const){
    const aggregate=(cat==='infantry'?infStock:artStock)[c] as unknown;
    const typed=totals.get(c+':'+cat)??0;
    if(typeof aggregate!=='number'||!Number.isFinite(aggregate)||
      typed>aggregate+EPS*Math.max(1,Math.abs(aggregate)))
      errors.push('v17 warehouse exceeds aggregate stock');
  }
  return errors;
}
