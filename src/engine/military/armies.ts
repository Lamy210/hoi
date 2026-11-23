import type { WorldState } from '../core/state';

export interface Army { id: number; owner: number; name: string; color: string; groupId: number | null; commanderId?: number; reinforcementPriority?: number }
export interface ArmyGroup { id: number; owner: number; name: string; color: string; commanderId?: number }
export const MAX_ARMIES = 256, MAX_GROUPS = 64, MAX_ARMY_UNITS = 24, MAX_GROUP_ARMIES = 5;
export const ARMY_COLORS = ['#4479b6','#638b64','#ad8150','#8b70b4','#aa6666'] as const;
/** Deterministic, per-country default name. Reuse a vacant sequence number
 * rather than mutating a second counter. Existing custom names are respected.
 */
export function nextFormationName(kind:'army'|'group',names:readonly string[]):string {
  const prefix=kind==='army'?'軍団':'軍集団';
  const existing=new Set(names);
  for(let n=1;n<=MAX_ARMIES+MAX_GROUPS+1;n++){
    const candidate=prefix+n;
    if(!existing.has(candidate))return candidate;
  }
  throw new RangeError('formation name limit');
}

export function validName(name: unknown): name is string {
  return typeof name === 'string' && name === name.trim() && [...name].length >= 1 && [...name].length <= 64 && !/[\u0000-\u001f\u007f-\u009f]/u.test(name);
}
export function validColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}
function safeId(id: unknown): id is number { return typeof id === 'number' && Number.isSafeInteger(id) && id > 0; }
export function validateHierarchy(w: WorldState): string[] {
  const out: string[] = [];
  if (!safeId(w.nextArmyId) || !safeId(w.nextArmyGroupId)) return ['invalid army counters'];
  const groups = new Map<number, ArmyGroup>(), armies = new Map<number, Army>();
  const gc = new Map<number, number>(), ac = new Map<number, number>(), members = new Map<number, number>(), units = new Map<number, number>();
  const ownerOk = (owner: number) => Number.isInteger(owner) && owner >= 0 && owner < w.countries.count;
  for (const g of w.armyGroups) {
    if (!g || !safeId(g.id) || g.id >= w.nextArmyGroupId || groups.has(g.id) || !ownerOk(g.owner) || !validName(g.name) || !validColor(g.color)) { out.push('invalid army group'); continue; }
    groups.set(g.id,g); gc.set(g.owner,(gc.get(g.owner)??0)+1);
    if (gc.get(g.owner)! > MAX_GROUPS) out.push('army group limit');
  }
  for (const a of w.armies) {
    if (!a || !safeId(a.id) || a.id >= w.nextArmyId || armies.has(a.id) || !ownerOk(a.owner) || !validName(a.name) || !validColor(a.color)) { out.push('invalid army'); continue; }
    if(a.reinforcementPriority!==undefined && (!Number.isInteger(a.reinforcementPriority)||a.reinforcementPriority<0||a.reinforcementPriority>9)) out.push('invalid army reinforcement priority');
    armies.set(a.id,a); ac.set(a.owner,(ac.get(a.owner)??0)+1);
    if (ac.get(a.owner)! > MAX_ARMIES) out.push('army limit');
    if (a.groupId !== null) {
      if (!safeId(a.groupId) || groups.get(a.groupId)?.owner !== a.owner) out.push('invalid army group reference');
      else { members.set(a.groupId,(members.get(a.groupId)??0)+1); if (members.get(a.groupId)! > MAX_GROUP_ARMIES) out.push('group membership limit'); }
    }
  }
  for (const u of w.units) {
    if (u.armyId == null) continue;
    if (!safeId(u.armyId) || armies.get(u.armyId)?.owner !== u.owner) out.push('invalid unit army reference');
    else { units.set(u.armyId,(units.get(u.armyId)??0)+1); if (units.get(u.armyId)! > MAX_ARMY_UNITS) out.push('army membership limit'); }
  }
  const assigned=new Set<number>();
  for(const f of [...w.armies,...w.armyGroups]) {
    if(f.commanderId===undefined||f.commanderId===-1)continue;
    const c=w.commanders.find(c=>c.id===f.commanderId);
    if(!safeId(f.commanderId)||!c||c.country!==f.owner||c.assignedUnit!==-1||assigned.has(c.id)||w.units.some(u=>u.commanderId===c.id))out.push('invalid formation commander');
    else assigned.add(c.id);
  }
  return out;
}
