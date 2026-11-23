/** Atomic, category-bounded division equipment issue/return in strategy-v1.
 * A division's requiredEquipment is keyed by category (tank/infantry/etc),
 * not by modelId; multiple model revisions share that one demand cap.
 */
import {assertStrategyState,type Design,type Division,type StrategyState} from '../model';
import {
  bumpEquipmentCommandRevision,requireEquipmentCommandRevision,transferEquipmentLot,
} from './ledger';

export type GroundEquipmentCategory=Exclude<Design['category'],'aircraft'>;

function divisionAuthorized(
  state:StrategyState,actorCountry:number,divisionId:number,
):Division {
  const unit=state.divisions.find(u=>u.id===divisionId);
  if(!unit||unit.country!==actorCountry||
    unit.destroyed||unit.hp<=0||unit.soldiers<=0||
    unit.inBattle||unit.moving)
    throw new RangeError('division unavailable or unauthorized');
  return unit;
}
function validGroundCategory(category:string):category is GroundEquipmentCategory {
  return category==='infantry'||category==='artillery'||category==='tank'||category==='support';
}
function issuedByCategory(state:StrategyState,divisionId:number,category:string):number {
  const designs=new Map(state.designs.map(d=>[d.id,d]));
  return state.lots.filter(l=>l.holder==='division'&&l.holderId===divisionId&&
    designs.get(l.modelId)?.category===category).reduce((sum,l)=>sum+l.quantity,0);
}

/** Declare the actual authorized demand before assigning newly designed tanks.
 * Training/template integration will eventually control these requirements.
 */
export function setDivisionEquipmentRequirement(
  initial:StrategyState,actorCountry:number,divisionId:number,
  category:GroundEquipmentCategory,required:number,expectedRevision:number,
):StrategyState {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  const unit=divisionAuthorized(initial,actorCountry,divisionId);
  if(!validGroundCategory(category)||!Number.isSafeInteger(required)||required<0)
    throw new RangeError('invalid division equipment requirement');
  if(issuedByCategory(initial,divisionId,category)>required)
    throw new RangeError('cannot reduce requirement below issued equipment');
  const next=structuredClone(initial);
  const changed=next.divisions.find(u=>u.id===unit.id)!;
  changed.requiredEquipment={...(changed.requiredEquipment??{}),[category]:required};
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return next;
}

export function transferDivisionEquipment(
  initial:StrategyState,actorCountry:number,divisionId:number,modelId:string,
  quantity:number,direction:'issue'|'return',expectedRevision:number,
):StrategyState {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  const unit=divisionAuthorized(initial,actorCountry,divisionId);
  const model=initial.designs.find(d=>d.id===modelId);
  if(!model||model.category==='aircraft'||
    (model.ownerCountry!==undefined&&model.ownerCountry!==actorCountry))
    throw new RangeError('unavailable ground equipment model');
  if(direction!=='issue'&&direction!=='return')
    throw new RangeError('unknown division equipment direction');
  if(direction==='issue'){
    const requirement=unit.requiredEquipment?.[model.category]??0;
    if(!Number.isSafeInteger(requirement)||requirement<=0||
      issuedByCategory(initial,divisionId,model.category)+quantity>requirement)
      throw new RangeError('division category capacity exceeded');
  }
  const next=structuredClone(initial);
  const warehouse={holder:'warehouse' as const,holderId:actorCountry};
  const division={holder:'division' as const,holderId:divisionId};
  transferEquipmentLot(next,modelId,quantity,
    direction==='issue'?warehouse:division,direction==='issue'?division:warehouse);
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return next;
}

/** A read-only view of already-issued equipment; never counts warehouse stock. */
export function divisionEquipmentStatus(
  state:StrategyState,divisionId:number,
):{category:GroundEquipmentCategory;required:number;issued:number;fill:number}[] {
  assertStrategyState(state);
  const unit=state.divisions.find(d=>d.id===divisionId);
  if(!unit)throw new RangeError('unknown division');
  return (['infantry','artillery','tank','support'] as const)
    .filter(category=>(unit.requiredEquipment?.[category]??0)>0)
    .map(category=>{
      const required=unit.requiredEquipment![category];
      const issued=issuedByCategory(state,divisionId,category);
      return {category,required,issued,fill:Math.min(1,issued/required)};
    });
}
