/** Canonical equipment-lot transfer. No free creation, no quantity rounding.
 * Caller must authorize holders and call assertStrategyState before/after.
 */
import type {Lot,StrategyState} from '../model';

export type EquipmentHolder=Pick<Lot,'holder'|'holderId'>;

export function holderQuantity(
  state:Pick<StrategyState,'lots'>,modelId:string,holder:EquipmentHolder,
):number {
  return state.lots.find(l=>l.modelId===modelId&&
    l.holder===holder.holder&&l.holderId===holder.holderId)?.quantity??0;
}

export function transferEquipmentLot(
  next:StrategyState,modelId:string,quantity:number,
  from:EquipmentHolder,to:EquipmentHolder,
):void {
  if(!Number.isSafeInteger(quantity)||quantity<=0)
    throw new RangeError('equipment transfer quantity must be a positive integer');
  if(!modelId||from.holder===to.holder&&from.holderId===to.holderId)
    throw new RangeError('invalid equipment transfer target');
  const source=next.lots.find(l=>l.modelId===modelId&&l.holder===from.holder&&l.holderId===from.holderId);
  if(!source||source.quantity<quantity)throw new RangeError('insufficient equipment stock');
  source.quantity-=quantity;
  const dest=next.lots.find(l=>l.modelId===modelId&&l.holder===to.holder&&l.holderId===to.holderId);
  if(dest)dest.quantity+=quantity;
  else next.lots.push({modelId,quantity,...to});
  if(source.quantity===0)next.lots=next.lots.filter(l=>l!==source);
}

export function requireEquipmentCommandRevision(state:StrategyState,expectedRevision:number):void {
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    expectedRevision!==(state.equipmentCommandRevision??0))
    throw new RangeError('stale equipment command revision');
}
export function bumpEquipmentCommandRevision(state:StrategyState):void {
  const current=state.equipmentCommandRevision??0;
  if(!Number.isSafeInteger(current+1))throw new RangeError('equipment command revision overflow');
  state.equipmentCommandRevision=current+1;
}
