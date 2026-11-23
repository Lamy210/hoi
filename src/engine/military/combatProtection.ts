/** Deterministic, bounded defense/breakthrough mechanics for live battles.
 * This is a game balance approximation, NOT a copy of HOI4's hit-chance rules.
 * Defense protects a stationary holder; breakthrough protects the attacker
 * while under return fire. No new saved state is required.
 */
import {effectiveSupply,type Unit,type WorldState} from '../core/state';
import {unitComposition} from './unitComposition';
import {divisionTemplate} from './templates';
import {preparednessPowerFactor} from './preparedness';

export type ProtectionRole = 'defense'|'breakthrough';
export const BREAKTHROUGH_BASE_FACTOR=0.70;
export const PROTECTION_MIN_DAMAGE_FACTOR=0.70;
export const PROTECTION_MAX_DAMAGE_FACTOR=1.10;

const fraction=(numerator:number,denominator:number,emptyValue=1):number=>
  denominator>0?Math.max(0,Math.min(1,numerator/denominator)):emptyValue;

/** Resolve readiness-based resistance in the same power-point scale as the
 * front's attack/defense values. Broken and poorly supplied units protect
 * themselves less. Terrain is handled separately to avoid a combat import
 * cycle. Caller may supply the actual terrain defense/attack coefficient.
 */
export function unitProtectionPoints(
  w:WorldState,u:Unit,role:ProtectionRole,terrainFactor=1,
):number {
  const composition=unitComposition(w,u);
  const base=role==='defense'
    ?(composition?.defense??40*(u.maxManpower/10000))
    :(composition?.attack??40*(u.maxManpower/10000)*(divisionTemplate(u.templateId)?.attack??1));
  const personnel=fraction(u.manpower,u.maxManpower,0);
  const infantry=fraction(u.infEquipment,u.maxInfEquipment);
  const artillery=fraction(u.artEquipment,u.maxArtEquipment);
  const equipment=Math.sqrt(infantry*artillery);
  const organization=fraction(u.org,100,0);
  const supply=0.5+0.5*effectiveSupply(w,u);
  const prepared=preparednessPowerFactor(u,role==='defense'?'defend':'attack');
  const mobility=role==='breakthrough'?BREAKTHROUGH_BASE_FACTOR:1;
  return Math.max(0,base*personnel*equipment*organization*supply*
    prepared*mobility*Math.max(0,terrainFactor));
}

/** Incoming enemy attack points are divided over engaged units, NOT all
 * reserves. Capacity absorbs only a bounded fraction of organization/losses.
 * Outnumbered/exhausted divisions suffer higher relative damage; there is
 * always damage even with overwhelming defense.
 */
export function protectionDamageFactor(incomingPerUnit:number,capacity:number):number {
  if(!Number.isFinite(incomingPerUnit)||incomingPerUnit<0||
     !Number.isFinite(capacity)||capacity<0)
    throw new RangeError('invalid combat protection values');
  if(incomingPerUnit===0)return PROTECTION_MIN_DAMAGE_FACTOR;
  const coverage=Math.min(1,capacity/incomingPerUnit);
  return PROTECTION_MAX_DAMAGE_FACTOR-
    (PROTECTION_MAX_DAMAGE_FACTOR-PROTECTION_MIN_DAMAGE_FACTOR)*coverage;
}
