// Combat modifiers derived from equipment ACTUALLY issued to a division.
// No extra stocks or persisted state: this is a deterministic read-only view.
// Unclassified equipment (initial armies and migrated saves) uses factor 1.
import type {Unit,WorldState} from '../core/state';
import type {EquipmentModelDef} from '../scenario/types';
import {equipmentModels} from './equipmentCatalog';
import {techDefs,type TechModKey} from '../systems/research';

export type EquipmentCombatSide='attack'|'defend';
type EquipmentCategory=EquipmentModelDef['category'];

const CATEGORY_COMBAT_WEIGHT={
  attack:{infantry:0.7,artillery:0.3},
  defend:{infantry:0.8,artillery:0.2},
} as const;

function categoryCombatFactor(w:WorldState,unitId:number,category:EquipmentCategory,
  actual:number,side:EquipmentCombatSide,models:ReadonlyMap<string,EquipmentModelDef>):number {
  if(actual<=0)return 1;
  let identified=0;
  let adjusted=0;
  for(const row of w.issuedEquipment){
    if(row.holder!=='unit'||row.holderId!==unitId)continue;
    const model=models.get(row.modelId);
    if(!model||model.category!==category)continue;
    identified+=row.quantity;
    adjusted+=row.quantity*(side==='attack'?model.attackFactor:model.defenseFactor);
  }
  if(identified===0)return 1;
  // Existing validation keeps the tagged subset <= actual. Clamp only floating
  // roundoff; a tagged quantity must NEVER conjure more items than the unit has.
  const unclassified=Math.max(0,actual-identified);
  return (unclassified+adjusted)/Math.max(actual,identified);
}

/**
 * Category-weighted equipment quality, not the equipped/required fill rate.
 * Fill rate is already a separate battle coefficient. The model multiplier
 * reflects identifiable held types; older unclassified holdings stay neutral.
 */
export function issuedModelCombatFactor(w:WorldState,u:Unit,side:EquipmentCombatSide):number {
  const models=new Map(equipmentModels().map(m=>[m.id,m]));
  const inf=categoryCombatFactor(w,u.id,'infantry',u.infEquipment,side,models);
  const art=categoryCombatFactor(w,u.id,'artillery',u.artEquipment,side,models);
  const infantryPresent=u.infEquipment>0;
  const artilleryPresent=u.artEquipment>0;
  if(!infantryPresent&&!artilleryPresent)return 1;
  if(!infantryPresent)return art;
  if(!artilleryPresent)return inf;
  const weights=CATEGORY_COMBAT_WEIGHT[side];
  return weights.infantry*inf+weights.artillery*art;
}

/**
 * Unlocking a *weapon model* is not a universal combat buff.
 * Remove weapon-research combat bonuses for that category; the acquired
 * model's attack/defenseFactor takes effect ONLY after actual deployment.
 * Drone/doctrine/etc bonuses remain independent operational technology.
 */
export function operationalCombatTechBonus(w:WorldState,c:number,key:
  Extract<TechModKey,'infantryAttack'|'infantryDefense'|'artilleryAttack'>):number {
  const done=new Set(w.research[c]?.done??[]);
  const weaponCategory:EquipmentCategory=key==='artilleryAttack'?'artillery':'infantry';
  const weaponUnlocks=new Set(equipmentModels()
    .filter(m=>m.category===weaponCategory&&m.unlockTechId)
    .map(m=>m.unlockTechId!));
  // Baseline standardization is itself a weapon unlock but the starting
  // 1990 rifle intentionally has no required unlockTechId in the catalog.
  if(key==='infantryAttack')weaponUnlocks.add('small-arms-standard');
  let bonus=0;
  for(const def of techDefs()){
    if(!done.has(def.id)||weaponUnlocks.has(def.id))continue;
    bonus+=def.mods[key]??0;
  }
  return bonus;
}
