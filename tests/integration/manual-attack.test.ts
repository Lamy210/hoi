import { describe, expect, it } from 'vitest';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { startWar, endWar } from '../../src/engine/military/war';
import { tickMovement } from '../../src/engine/systems/movement';
import { OCCUPATION_DAYS } from '../../src/engine/systems/combat';

async function fixture() {
  const e = await createTestEngine(1, 12, 'KOR'), w = e.world;
  const c = w.playerCountry, enemy = w.countries.id.indexOf('PRK');
  const unit = w.units.find(u => u.owner === c && w.prov.id[u.loc] === 'KR-41')!;
  const target = w.prov.id.indexOf('KP-07');
  const other = w.units.find(u => u.owner === c && u.id !== unit.id)!;
  const issue = (seq: number, type: string, units = [unit.id], dest = target) =>
    applyCommands(w, [{issuer:'player',seq,type,p:{units,target:dest}}])[0];
  return {e,w,c,enemy,unit,target,other,issue};
}

describe('explicit in-game attack orders', () => {
  it('peace, mixed non-adjacent selections and duplicate IDs are rejected atomically', async () => {
    const {w,c,enemy,unit,target,other,issue} = await fixture();
    expect(issue(1,'attackUnits').reason).toBe('notAtWar');
    expect(unit.path).toEqual([]);
    startWar(w,c,enemy,false);
    expect(issue(2,'travelUnits').reason).toBe('useAttack');
    expect(issue(3,'attackUnits',[unit.id,other.id]).reason).toBe('attackNotAdjacent');
    expect(issue(4,'attackUnits',[unit.id,unit.id]).reason).toBe('badParams');
    expect(unit.path).toEqual([]);
    expect(other.path).toEqual([]);
    expect(issue(5,'attackUnits',[unit.id],unit.loc).reason).toBe('notAtWar');
    expect(issue(6,'attackUnits').ok).toBe(true);
    expect(unit.path).toEqual([unit.loc,target]);
    expect(w.prov.controller[target]).toBe(enemy);
  });

  it('peace after the attack order prevents unauthorized arrival', async () => {
    const {w,c,enemy,unit,issue} = await fixture();
    const war = startWar(w,c,enemy,false);
    expect(issue(1,'attackUnits').ok).toBe(true);
    const loc = unit.loc;
    endWar(w,war);
    tickMovement(w);
    expect(unit.loc).toBe(loc);
    expect(unit.path).toEqual([]);
    expect(unit.segProgress).toBe(0);
  });

  it('arriving at a defended game province invokes the existing battle resolver', async () => {
    const {e,w,c,enemy,unit,target,issue} = await fixture();
    startWar(w,c,enemy,false);
    const defender = w.units.find(u => u.owner === enemy && u.loc === target)!;
    expect(defender).toBeDefined();
    unit.org = 100; defender.org = 100;
    const original = unit.manpower;
    expect(issue(1,'attackUnits').ok).toBe(true);
    unit.segDays = 1; // deterministic synthetic test, not a production movement parameter
    e.stepTick();
    expect(unit.loc).toBe(target);
    expect(w.runtime.activeBattles.has(target)).toBe(true);
    expect(unit.manpower).toBeLessThan(original);
    expect(w.prov.controller[target]).toBe(enemy);
    expect(e.getUiSnapshot(0).battles).toContain(target);
  });

  it('occupying a vacant game province requires uninterrupted presence', async () => {
    const {e,w,c,enemy,unit,target,issue} = await fixture();
    startWar(w,c,enemy,false);
    w.units = w.units.filter(u => !(u.owner === enemy && u.loc === target));
    expect(issue(1,'attackUnits').ok).toBe(true);
    const origin = unit.loc;
    unit.segDays = 1;
    e.stepTick();
    expect(w.occupancyTimer[target]).toBe(1);
    expect(w.prov.controller[target]).toBe(enemy);
    expect(e.getUiSnapshot(0).occupation).toContainEqual({province:target,candidate:c,days:1});
    unit.loc = origin;
    w.occupancyTimer[target] = OCCUPATION_DAYS - 1;
    e.stepTick();
    expect(w.occupancyTimer[target]).toBe(0);
    expect(w.occupierCandidate[target]).toBe(-1);
    expect(w.prov.controller[target]).toBe(enemy);
  });
});
