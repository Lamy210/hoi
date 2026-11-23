import type { Unit, WorldState } from '../core/state';
import { customTemplateStats } from './customTemplates';
import type { TemplateStats } from './templateStats';

/** Legacy units keep the original 20-width, 100-org, 10-demand model.
 * A deployed custom division always references its immutable revision.
 * This is deterministic and uses no mutable catalog/global cache.
 */
export function unitComposition(w: WorldState, u: Unit): TemplateStats | null {
  if (u.customTemplateId === undefined || u.customRevision === undefined) return null;
  const t = w.customTemplates.find(t=>t.country===u.owner&&
    t.templateId===u.customTemplateId&&t.revision===u.customRevision);
  return t ? customTemplateStats(t) : null;
}
export function unitCombatWidth(w:WorldState,u:Unit):number {
  return unitComposition(w,u)?.width ?? 20;
}
export function unitOrgCap(w:WorldState,u:Unit):number {
  return Math.min(100,unitComposition(w,u)?.org ?? 100);
}
export function unitSupplyDemand(w:WorldState,u:Unit):number {
  return unitComposition(w,u)?.supply ?? 10;
}
export function unitSpeedMultiplier(w:WorldState,u:Unit):number {
  return unitComposition(w,u)?.speed ?? 1;
}

/** Explicit per-division combat priority is independent from supply reinforcement
 * priority. Equal priorities retain the original deterministic ID-order behavior.
 */
export function frontlinePriority(u:Pick<Unit,'frontlinePriority'>):number {
  const n=u.frontlinePriority??5;
  if(!Number.isSafeInteger(n)||n<0||n>9)throw new RangeError('invalid frontline priority');
  return n;
}
export function frontlineOrder(a:Unit,b:Unit):number {
  return frontlinePriority(b)-frontlinePriority(a)||a.id-b.id;
}

/** Fit higher-priority divisions first; then lower unit IDs.
 * Skip non-fitting formations; fallback to one over-wide unit.
 * Legacy: each 20-width division, terrain capacity == previous slots * 20.
 */
export function selectCombatFront(w:WorldState,units:readonly Unit[],legacySlots:number):
  { units:Unit[]; penalties:number[] } {
  if(!Number.isFinite(legacySlots)||legacySlots<=0)throw new RangeError('invalid battle width');
  const capacity=legacySlots*20;
  let used=0;
  const selected:Unit[]=[];
  const penalties:number[]=[];
  const ranked=[...units].sort(frontlineOrder);
  for(const u of ranked){
    const width=unitCombatWidth(w,u);
    if(width<=0)continue;
    if(used+width<=capacity){
      selected.push(u);penalties.push(1);used+=width;
    }
  }
  if(!selected.length&&ranked.length){
    const u=ranked[0],width=unitCombatWidth(w,u);
    selected.push(u);penalties.push(Math.min(1,capacity/Math.max(width,1)));
  }
  return {units:selected,penalties};
}
