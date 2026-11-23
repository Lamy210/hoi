/** Air wing preparation without flight/combat. Aircraft stay in canonical Lots.
 * A full base can still launch its *existing* planes: hangar free slots
 * constrain additions, while operational capacity constrains future sorties.
 */
import {assertStrategyState,type AirBase,type AirWing,type StrategyState} from '../model';
import {
  bumpEquipmentCommandRevision,holderQuantity,requireEquipmentCommandRevision,transferEquipmentLot,
} from '../equipment/ledger';

function selectedWing(state:StrategyState,actorCountry:number,wingId:number):AirWing {
  const wing=state.airWings?.find(w=>w.id===wingId);
  if(!wing||wing.country!==actorCountry)throw new RangeError('airwing unavailable or unauthorized');
  return wing;
}
function selectedBase(state:StrategyState,actorCountry:number,baseId:number):AirBase {
  const base=state.airBases?.find(b=>b.id===baseId);
  const province=state.provinces.find(p=>p.id===base?.province);
  if(!base||base.country!==actorCountry||province?.controller!==actorCountry)
    throw new RangeError('airbase unavailable or unauthorized');
  return base;
}

/** Airbases are scenario/airfield-construction assets, not free to build here. */
export function createAirWing(
  initial:StrategyState,actorCountry:number,baseId:number,modelId:string,
  expectedRevision:number,
):{next:StrategyState;wingId:number} {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  selectedBase(initial,actorCountry,baseId);
  const design=initial.designs.find(d=>d.id===modelId);
  if(!design||design.category!=='aircraft'||
    (design.ownerCountry!==undefined&&design.ownerCountry!==actorCountry))
    throw new RangeError('unavailable aircraft design');
  const wingId=1+Math.max(0,...(initial.airWings??[]).map(w=>w.id));
  if(!Number.isSafeInteger(wingId))throw new RangeError('airwing id overflow');
  const next=structuredClone(initial);
  next.airWings??=[];
  next.airWings.push({id:wingId,country:actorCountry,baseId,modelId,pilots:0,mission:'grounded'});
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return {next,wingId};
}

/** Pilots reserve existing population.soldiers; never mint extra people. */
export function assignAirWingPilots(
  initial:StrategyState,actorCountry:number,wingId:number,pilots:number,
  expectedRevision:number,
):StrategyState {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  selectedWing(initial,actorCountry,wingId);
  if(!Number.isSafeInteger(pilots)||pilots<0)
    throw new RangeError('invalid airwing pilot count');
  const next=structuredClone(initial);
  next.airWings!.find(w=>w.id===wingId)!.pilots=pilots;
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return next;
}

/** issue moves a nationally owned stock lot into a stationary wing.
 * return moves ready aircraft back to its national warehouse.
 */
export function transferAirWingAircraft(
  initial:StrategyState,actorCountry:number,wingId:number,
  quantity:number,direction:'issue'|'return',expectedRevision:number,
):StrategyState {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  const wing=selectedWing(initial,actorCountry,wingId);
  selectedBase(initial,actorCountry,wing.baseId);
  if(direction!=='issue'&&direction!=='return')throw new RangeError('invalid aircraft movement');
  const next=structuredClone(initial);
  const warehouse={holder:'warehouse' as const,holderId:actorCountry};
  const airwing={holder:'airwing' as const,holderId:wingId};
  transferEquipmentLot(next,wing.modelId,quantity,
    direction==='issue'?warehouse:airwing,direction==='issue'?airwing:warehouse);
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return next;
}

/** Damage turns ready into repairing without deleting a physical aircraft.
 * Restoring repairing planes requires a future paid repair-work order.
 */
export function sendAirWingAircraftForRepair(
  initial:StrategyState,actorCountry:number,wingId:number,quantity:number,
  expectedRevision:number,
):StrategyState {
  assertStrategyState(initial);
  requireEquipmentCommandRevision(initial,expectedRevision);
  const wing=selectedWing(initial,actorCountry,wingId);
  const next=structuredClone(initial);
  transferEquipmentLot(next,wing.modelId,quantity,
    {holder:'airwing',holderId:wingId},{holder:'repairing',holderId:wingId});
  bumpEquipmentCommandRevision(next);
  assertStrategyState(next);
  return next;
}

export interface AirWingStatus {
  id:number;baseId:number;modelId:string;
  ready:number;repairing:number;pilots:number;
  operationalSlots:number; // not sorties: fuel, reach, AA and battle are not simulated
}
export interface AirBaseStatus {
  baseId:number;hangarCapacity:number;parked:number;freeHangars:number;
  operationalCapacity:number;
  wings:AirWingStatus[];
}

/** Stable ID-order allocation prevents two wings from using the same runway slot. */
export function airBaseStatus(state:StrategyState,baseId:number):AirBaseStatus {
  assertStrategyState(state);
  const base=state.airBases?.find(b=>b.id===baseId);
  if(!base)throw new RangeError('unknown airbase');
  let parked=0,remaining=Math.floor(base.capacity*(1-base.damage));
  const wings:AirWingStatus[]=[];
  for(const wing of [...(state.airWings??[]).filter(w=>w.baseId===baseId)].sort((a,b)=>a.id-b.id)){
    const ready=holderQuantity(state,wing.modelId,{holder:'airwing',holderId:wing.id});
    const repairing=holderQuantity(state,wing.modelId,{holder:'repairing',holderId:wing.id});
    parked+=ready+repairing;
    const operationalSlots=Math.min(ready,wing.pilots,remaining);
    remaining-=operationalSlots;
    wings.push({id:wing.id,baseId,modelId:wing.modelId,ready,repairing,
      pilots:wing.pilots,operationalSlots});
  }
  return {baseId,hangarCapacity:base.capacity,parked,
    freeHangars:base.capacity-parked,
    operationalCapacity:Math.floor(base.capacity*(1-base.damage)),wings};
}
