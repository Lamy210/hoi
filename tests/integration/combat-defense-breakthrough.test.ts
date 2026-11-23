import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {startWar} from '../../src/engine/military/war';
import {hashWorld} from '../../src/engine/core/hash';
import {unitCombatTrace,TERRAIN_DATA} from '../../src/engine/systems/combat';
import {unitProtectionPoints,protectionDamageFactor,
  PROTECTION_MAX_DAMAGE_FACTOR,PROTECTION_MIN_DAMAGE_FACTOR,
  BREAKTHROUGH_BASE_FACTOR} from '../../src/engine/military/combatProtection';

async function battle(entrenchment=0,preparation=0){
  const e=await createTestEngine(1,7402,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK'),target=w.prov.id.indexOf('KP-07');
  startWar(w,c,enemy,false);
  const att=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  const def=w.units.find(u=>u.owner===enemy&&u.loc===target&&!u.destroyed)!;
  w.units=[att,def];
  Object.assign(att,{loc:target,org:100,path:[],segIdx:0,segDays:0,segProgress:0,
    entrenchment:0,preparation,encircled:false,destroyed:false,manualHold:true});
  Object.assign(def,{loc:target,org:100,path:[],segIdx:0,segDays:0,segProgress:0,
    entrenchment,preparation:0,encircled:false,destroyed:false,manualHold:true});
  return {e,w,c,enemy,target,att,def};
}

describe('battle loss defense and breakthrough capacity',()=>{
  it('uses bounded hit protection and does not give immunity',()=>{
    expect(protectionDamageFactor(100,0)).toBe(PROTECTION_MAX_DAMAGE_FACTOR);
    expect(protectionDamageFactor(100,50)).toBeCloseTo(0.9);
    expect(protectionDamageFactor(100,100)).toBe(PROTECTION_MIN_DAMAGE_FACTOR);
    expect(protectionDamageFactor(100,1e6)).toBe(PROTECTION_MIN_DAMAGE_FACTOR);
    expect(protectionDamageFactor(0,100)).toBe(PROTECTION_MIN_DAMAGE_FACTOR);
    expect(()=>protectionDamageFactor(-1,30)).toThrow(/invalid/);
    expect(()=>protectionDamageFactor(1,NaN)).toThrow(/invalid/);
  });

  it('computes defensive capacity from fortification, equipment, supply and actual organization',async()=>{
    const {w,u}=await (async()=>{const b=await battle();return {w:b.w,u:b.def};})();
    const terrain=TERRAIN_DATA[w.prov.terrain[u.loc]];
    const base=unitProtectionPoints(w,u,'defense',terrain.def);
    expect(base).toBeGreaterThan(0);
    u.entrenchment=6;
    expect(unitProtectionPoints(w,u,'defense',terrain.def)).toBeCloseTo(base*1.3,6);
    u.org=30;
    const degraded=unitProtectionPoints(w,u,'defense',terrain.def);
    expect(degraded).toBeCloseTo(base*1.3*0.3,6);
    u.org=100;
    u.infEquipment=0;
    expect(unitProtectionPoints(w,u,'defense',terrain.def)).toBe(0);
  });

  it('gives attacking divisions independent breakthrough from offensive planning',async()=>{
    const {w,att,target}=await battle();
    const t=TERRAIN_DATA[w.prov.terrain[target]];
    const defense=unitProtectionPoints(w,att,'defense',t.atk);
    const initial=unitProtectionPoints(w,att,'breakthrough',t.atk);
    // Identical baseline forces: infantry has lower breakthrough than defense.
    expect(initial).toBeCloseTo(defense*BREAKTHROUGH_BASE_FACTOR,6);
    att.preparation=5;
    expect(unitProtectionPoints(w,att,'breakthrough',t.atk)).toBeCloseTo(initial*1.2,6);
  });

  it('changes real daily organization and equipment losses and exposes protection in combat trace',async()=>{
    const bare=await battle();
    const protectedDefense=await battle(6,0);
    const preparedAttack=await battle(0,5);
    const trace=unitCombatTrace(protectedDefense.w,protectedDefense.def.id);
    expect(trace?.contribs.some(x=>x.label==='defenseCapacity'&&x.value>0)).toBe(true);
    expect(unitCombatTrace(preparedAttack.w,preparedAttack.att.id)?.contribs.some(
      x=>x.label==='breakthroughCapacity'&&x.value>0)).toBe(true);
    const before=hashWorld(preparedAttack.w);
    unitCombatTrace(preparedAttack.w,preparedAttack.att.id);
    expect(hashWorld(preparedAttack.w)).toBe(before);
    bare.e.stepTick();
    protectedDefense.e.stepTick();
    preparedAttack.e.stepTick();
    expect(protectedDefense.def.org).toBeGreaterThan(bare.def.org);
    expect(protectedDefense.def.infEquipment).toBeGreaterThan(bare.def.infEquipment);
    expect(preparedAttack.att.org).toBeGreaterThan(bare.att.org);
    expect(preparedAttack.att.infEquipment).toBeGreaterThan(bare.att.infEquipment);
    expect(protectedDefense.def.org).toBeLessThan(100);
    expect(preparedAttack.att.org).toBeLessThan(100);
  });

  it('retains deterministic combat losses after saving and reloading a live battle',async()=>{
    const {e,w}=await battle(4,4);
    const original=hashWorld(w);
    const restored=await createTestEngine(1,7402,'KOR');
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(original);
    for(let day=0;day<14;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+day).toBe(hashWorld(w));
    }
  });
});
