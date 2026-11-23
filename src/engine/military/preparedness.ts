// Persistent division readiness: entrenchment holds terrain; planning rewards
// organized offensives. Both use bounded integer levels for replay stability.
import {atWar,effectiveSupply,type Unit,type WorldState} from '../core/state';

export const MAX_ENTRENCHMENT = 6;
export const MAX_PREPARATION = 5;
export const ENTRENCHMENT_DEFENSE_PER_LEVEL = 0.05;
export const PREPARATION_ATTACK_PER_LEVEL = 0.04;
export const MIN_PREPARED_SUPPLY = 0.35;
export const MIN_PREPARING_ORG = 60;

export function entrenchmentLevel(u:Pick<Unit,'entrenchment'>):number {
  return u.entrenchment ?? 0;
}

export function preparationLevel(u:Pick<Unit,'preparation'>):number {
  return u.preparation ?? 0;
}

export function preparednessPowerFactor(u:Unit,side:'attack'|'defend'):number {
  if(side==='defend')return 1 + ENTRENCHMENT_DEFENSE_PER_LEVEL * entrenchmentLevel(u);
  return 1 + PREPARATION_ATTACK_PER_LEVEL * preparationLevel(u);
}

/** Called once after movement + daily combat. The next combat day uses its
 * completed readiness state, not a bonus manufactured on the arrival day.
 * changedLocations includes both path movement and forced retreat.
 */
export function advanceBattlePreparedness(
  w:WorldState,changedLocations:ReadonlySet<number>,activeBattles:ReadonlySet<number>,
):void {
  for(const u of w.units){
    if(u.destroyed)continue;
    const moved=changedLocations.has(u.id)||u.path.length>0;
    const exposed=u.encircled||w.prov.controller[u.loc]!==u.owner;
    const engaged=activeBattles.has(u.loc);
    if(moved||exposed){
      u.entrenchment=0;
      u.preparation=Math.max(0,preparationLevel(u)-1);
      continue;
    }
    if(engaged){
      // Keep prepared defenses while holding; participating in battle cannot
      // build extra dug-in levels and attack plans are gradually consumed.
      u.preparation=Math.max(0,preparationLevel(u)-1);
      continue;
    }
    const eff=effectiveSupply(w,u);
    u.entrenchment=eff>=MIN_PREPARED_SUPPLY
      ?Math.min(MAX_ENTRENCHMENT,entrenchmentLevel(u)+1)
      :Math.max(0,entrenchmentLevel(u)-1);
    const front=w.fronts.find(f=>f.id===u.frontId&&f.owner===u.owner);
    const preparing=!!front&&!front.paused&&
      (front.stance==='attack'||front.stance==='counterattack')&&
      atWar(w,front.owner,front.enemy)&&!u.manualHold&&
      eff>=MIN_PREPARED_SUPPLY&&u.org>=MIN_PREPARING_ORG;
    u.preparation=preparing
      ?Math.min(MAX_PREPARATION,preparationLevel(u)+1)
      :Math.max(0,preparationLevel(u)-1);
  }
}
