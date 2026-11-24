// Phase8B: deterministic, fail-closed capacity planning shared by future
// amphibious operations, port-to-port supply and trade reservations.
// This file performs NO state changes; an actual transport operation must
// atomically validate and commit these reservations through the command bus.
import {navalModel,type NavalModel} from './models';

export type NavalShipReadiness='ready'|'building'|'repairing';
export interface NavalShipAsset {
  id:number;
  owner:number;
  modelId:string;
  condition:number; // 0..100, integer, no fraction/NaN
  readiness:NavalShipReadiness;
  portId:string|null;
  zoneId:string|null;
}
export type NavalTransportPurpose='amphibious'|'supply'|'trade';
export interface NavalCapacityReservation {
  id:number;
  owner:number;
  purpose:NavalTransportPurpose;
  shipIds:number[];
  requiredCapacity:number;
}
export interface NavalCapacityResult {
  valid:boolean;
  errors:string[];
  totalCapacity:number;
  reservedCapacity:number;
  availableCapacity:number;
  totalEscortPower:number;
  availableEscortPower:number;
}

export const MAX_NAVAL_ASSETS=4096;
export const MAX_NAVAL_RESERVATIONS=1024;
export const MIN_OPERATIONAL_CONDITION=50;
const safeId=(n:unknown):n is number=>Number.isSafeInteger(n)&&typeof n==='number'&&n>0;
const ownerId=(n:unknown):n is number=>Number.isSafeInteger(n)&&typeof n==='number'&&n>=0;
const safePort=(s:unknown)=>s===null||(typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(s));
const operational=(s:NavalShipAsset)=>s.readiness==='ready'&&
  s.condition>=MIN_OPERATIONAL_CONDITION;
function modelCapacity(s:NavalShipAsset,m:NavalModel):number {
  return operational(s)?Math.floor(m.transportCapacity*s.condition/100):0;
}
function modelEscort(s:NavalShipAsset,m:NavalModel):number {
  return operational(s)?Math.floor(m.escortPower*s.condition/100):0;
}

/** An invalid or unknown ship/reservation produces zero usable capacity.
 * This avoids treating unknown naval control or insufficient shipping as
 * an implicit permit to embark troops.
 */
export function calculateNavalTransportCapacity(
  owner:number,
  assets:readonly NavalShipAsset[],
  reservations:readonly NavalCapacityReservation[],
):NavalCapacityResult {
  const errors:string[]=[];
  if(!ownerId(owner)||!Array.isArray(assets)||assets.length>MAX_NAVAL_ASSETS||
    !Array.isArray(reservations)||reservations.length>MAX_NAVAL_RESERVATIONS)
    return {valid:false,errors:['invalid naval capacity inputs'],totalCapacity:0,
      reservedCapacity:0,availableCapacity:0,totalEscortPower:0,availableEscortPower:0};
  const ships=new Map<number,{asset:NavalShipAsset;model:NavalModel}>();
  let totalCapacity=0,totalEscortPower=0;
  for(const asset of assets){
    if(!asset||!safeId(asset.id)||ships.has(asset.id)){
      errors.push('invalid or duplicate ship id: '+String(asset?.id));continue;
    }
    const m=typeof asset.modelId==='string'?navalModel(asset.modelId):undefined;
    if(!m){errors.push('unknown naval model: '+String(asset.modelId));continue;}
    if(!ownerId(asset.owner)||!Number.isSafeInteger(asset.condition)||
      asset.condition<0||asset.condition>100||
      !['ready','building','repairing'].includes(asset.readiness)||
      !safePort(asset.portId)||!safePort(asset.zoneId)||
      Number(asset.portId!==null)+Number(asset.zoneId!==null)!==1){
      errors.push('invalid ship state: '+asset.id);continue;
    }
    ships.set(asset.id,{asset,model:m});
    if(asset.owner!==owner)continue;
    totalCapacity+=modelCapacity(asset,m);
    totalEscortPower+=modelEscort(asset,m);
  }
  const assigned=new Set<number>(),seenReservations=new Set<number>();
  let reservedCapacity=0,reservedEscortPower=0;
  for(const reservation of reservations){
    if(!reservation||!safeId(reservation.id)||seenReservations.has(reservation.id)){
      errors.push('invalid or duplicate reservation: '+String(reservation?.id));continue;
    }
    seenReservations.add(reservation.id);
    if(reservation.owner!==owner||!['amphibious','supply','trade'].includes(reservation.purpose)||
      !safeId(reservation.requiredCapacity)||!Array.isArray(reservation.shipIds)||
      !reservation.shipIds.length||reservation.shipIds.length>MAX_NAVAL_ASSETS||
      new Set(reservation.shipIds).size!==reservation.shipIds.length){
      errors.push('invalid reservation parameters: '+reservation.id);continue;
    }
    let capacity=0,escorts=0;
    for(const id of reservation.shipIds){
      if(!safeId(id)){errors.push('invalid reserved ship id: '+String(id));continue;}
      if(assigned.has(id)){errors.push('ship reserved twice: '+id);continue;}
      assigned.add(id);
      const record=ships.get(id);
      if(!record||record.asset.owner!==owner||!operational(record.asset)){
        errors.push('unavailable reserved ship: '+id);continue;
      }
      capacity+=modelCapacity(record.asset,record.model);
      escorts+=modelEscort(record.asset,record.model);
    }
    if(capacity<reservation.requiredCapacity){
      errors.push('insufficient reserved transport capacity: '+reservation.id);
    }
    reservedCapacity+=capacity;
    reservedEscortPower+=escorts;
  }
  if(errors.length)return {valid:false,errors,totalCapacity:0,reservedCapacity:0,
    availableCapacity:0,totalEscortPower:0,availableEscortPower:0};
  return {valid:true,errors:[],totalCapacity,reservedCapacity,
    availableCapacity:totalCapacity-reservedCapacity,
    totalEscortPower,availableEscortPower:totalEscortPower-reservedEscortPower};
}
