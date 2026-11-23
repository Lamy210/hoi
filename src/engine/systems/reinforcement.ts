import {effectiveSupply,type Unit,type WorldState} from '../core/state';
import {adjustWarehouse} from './modelWarehouse';
import {attributeEquipment} from './issuedEquipment';

export const DEFAULT_REINFORCEMENT_PRIORITY = 5;

/** Only idle, non-encircled and non-combat troops are eligible.
 * Higher-priority armies receive scarce resources first.
 * Equal priorities preserve the original stable deployed-unit order.
 */
export function reinforceIdleUnits(
  w:WorldState,battleLocations:ReadonlySet<number>,
  engagedUnitIds?:ReadonlySet<number>,
):void {
  const armyPriority=new Map(w.armies.map(a=>[a.id,a.reinforcementPriority??DEFAULT_REINFORCEMENT_PRIORITY]));
  const getPriority=(u:Unit)=>armyPriority.get(u.armyId??-1)??DEFAULT_REINFORCEMENT_PRIORITY;
  // On a controlled battlefield, a non-engaged reserve may replenish from
  // national stocks. Fighting divisions and attackers in hostile territory may
  // not exploit reserve replenishment during the active engagement.
  const eligible=w.units.filter(u=>!u.destroyed&&!u.encircled&&!u.path.length&&
    (!battleLocations.has(u.loc)||
      (engagedUnitIds!==undefined&&!engagedUnitIds.has(u.id)&&
        w.prov.controller[u.loc]===u.owner)));
  eligible.sort((a,b)=>getPriority(b)-getPriority(a));
  for(const u of eligible){
    const c=u.owner, speed=0.5+0.5*effectiveSupply(w,u);
    const mpAdd=Math.min(Math.max(0,u.maxManpower-u.manpower),40*speed,w.countries.manpowerPool[c]);
    if(mpAdd>0){w.countries.manpowerPool[c]-=mpAdd;u.manpower+=mpAdd;}
    const infAdd=Math.min(Math.max(0,u.maxInfEquipment-u.infEquipment),25*speed,w.countries.infEquipmentStock[c]);
    if(infAdd>0){const issued=adjustWarehouse(w,c,'infantry',-infAdd);u.infEquipment+=infAdd;attributeEquipment(w,'unit',u.id,issued);}
    const artAdd=Math.min(Math.max(0,u.maxArtEquipment-u.artEquipment),5*speed,w.countries.artEquipmentStock[c]);
    if(artAdd>0){const issued=adjustWarehouse(w,c,'artillery',-artAdd);u.artEquipment+=artAdd;attributeEquipment(w,'unit',u.id,issued);}
  }
}
