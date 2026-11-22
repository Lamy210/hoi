import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {attributeEquipment,trimUnitEquipment} from '../../src/engine/systems/issuedEquipment';
import {issuedModelCombatFactor,operationalCombatTechBonus} from '../../src/engine/military/equipmentCombat';
import {unitPowerFactors,unitCombatTrace} from '../../src/engine/systems/combat';
import {hashWorld} from '../../src/engine/core/hash';

const rifleOld='infantry-rifle-1990',rifleNew='infantry-rifle-2035',
  gunOld='artillery-towed-2000',gunNew='artillery-precision-2029';
const factor=(cs:ReturnType<typeof unitPowerFactors>,label:string)=>
  cs.find(f=>f.label===label)?.value??1;

describe('real equipped-model combat modifiers',()=>{
  it('uses factor 1 for legacy divisions and 1990/towed baseline without extra stock',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c)!;
    const beforeHash=hashWorld(w);
    expect(issuedModelCombatFactor(w,u,'attack')).toBe(1);
    expect(issuedModelCombatFactor(w,u,'defend')).toBe(1);
    expect(factor(unitPowerFactors(w,u,u.loc,'attack'),'equipmentModel')).toBe(1);
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifleOld,quantity:300},
      {country:c,modelId:gunOld,quantity:100}]);
    expect(issuedModelCombatFactor(w,u,'attack')).toBe(1);
    expect(issuedModelCombatFactor(w,u,'defend')).toBe(1);
    expect(w.countries.infEquipmentStock[c]).toBeGreaterThan(0);
    expect(hashWorld(w)).not.toBe(beforeHash);
  });

  it('weights mixed model quality by actual held quantities, not catalog research',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c)!;
    expect(u.infEquipment).toBeGreaterThan(300);
    expect(u.artEquipment).toBeGreaterThan(0);
    const fullInf=u.infEquipment,fullArt=u.artEquipment;
    // Half the infantry and all guns are newly equipped; other equipment
    // stays unclassified and receives a neutral quality multiplier of 1.
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifleNew,quantity:fullInf/2},
      {country:c,modelId:gunNew,quantity:fullArt}]);
    const expectedAttack=0.7*(1+(1.16-1)*0.5)+0.3*1.2;
    const expectedDefense=0.8*(1+(1.06-1)*0.5)+0.2*1.02;
    expect(issuedModelCombatFactor(w,u,'attack')).toBeCloseTo(expectedAttack,10);
    expect(issuedModelCombatFactor(w,u,'defend')).toBeCloseTo(expectedDefense,10);
    expect(factor(unitPowerFactors(w,u,u.loc,'attack'),'equipmentModel'))
      .toBeCloseTo(expectedAttack,10);
    expect(factor(unitPowerFactors(w,u,u.loc,'defend'),'equipmentModel'))
      .toBeCloseTo(expectedDefense,10);
    const trace=unitCombatTrace(w,u.id)!;
    expect(trace.contribs.find(f=>f.label==='equipmentModel')?.formula)
      .toContain('unclassified=1');
    expect(trace.contribs.find(f=>f.label==='equipmentModel')?.value)
      .toBeCloseTo(expectedDefense,10); // initial unit is defending its province
  });

  it('does not use researched weapon bonuses until issuance, but retains drones and doctrine',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c)!;
    const prior=factor(unitPowerFactors(w,u,u.loc,'attack'),'technology');
    expect(prior).toBe(1);
    w.research[c].done.push('small-arms-standard','small-arms-modular',
      'small-arms-next','artillery-guidance','artillery-precision',
      'infantry-protection','infantry-protection-next');
    expect(operationalCombatTechBonus(w,c,'infantryAttack')).toBe(0);
    expect(operationalCombatTechBonus(w,c,'artilleryAttack')).toBe(0);
    expect(operationalCombatTechBonus(w,c,'infantryDefense')).toBe(0);
    expect(factor(unitPowerFactors(w,u,u.loc,'attack'),'technology')).toBe(1);
    expect(factor(unitPowerFactors(w,u,u.loc,'defend'),'technology')).toBe(1);
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifleNew,quantity:u.infEquipment}]);
    expect(issuedModelCombatFactor(w,u,'attack')).toBeCloseTo(0.7*1.16+0.3);
    expect(factor(unitPowerFactors(w,u,u.loc,'attack'),'equipmentModel')).toBeGreaterThan(1);
    w.research[c].done.push('drone-strike','doctrine-maneuver','drone-recon');
    expect(operationalCombatTechBonus(w,c,'infantryAttack')).toBeCloseTo(0.09);
    expect(operationalCombatTechBonus(w,c,'infantryDefense')).toBeCloseTo(0.02);
    expect(factor(unitPowerFactors(w,u,u.loc,'attack'),'technology')).toBeCloseTo(1.09);
  });

  it('is pure, order-insensitive, and follows attrition without changing material counts',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c)!;
    const oldStocks=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const n=u.infEquipment;
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifleOld,quantity:n/2},
      {country:c,modelId:rifleNew,quantity:n/2}]);
    const a=issuedModelCombatFactor(w,u,'attack');
    const h=hashWorld(w);
    expect(a).toBeCloseTo(0.7*1.08+0.3,10);
    expect(issuedModelCombatFactor(w,u,'attack')).toBe(a);
    expect(hashWorld(w)).toBe(h);
    u.infEquipment=n/4;
    trimUnitEquipment(w,u.id,'infantry',u.infEquipment);
    // A category's total identified models must remain <= total held.
    const rest=w.issuedEquipment.filter(r=>r.holder==='unit'&&r.holderId===u.id)
      .reduce((acc,r)=>acc+r.quantity,0);
    expect(rest).toBeLessThanOrEqual(u.infEquipment+1e-6);
    expect(Number.isFinite(issuedModelCombatFactor(w,u,'attack'))).toBe(true);
    expect([w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(oldStocks);
  });

  it('preserves new combat power through save/load and 20 deterministic ticks',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const u=w.units.find(u=>u.owner===c)!;
    attributeEquipment(w,'unit',u.id,[{country:c,modelId:rifleNew,quantity:100},
      {country:c,modelId:gunNew,quantity:20}]);
    const attack=issuedModelCombatFactor(w,u,'attack'),defense=issuedModelCombatFactor(w,u,'defend');
    const restored=await createTestEngine();
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    const loaded=restored.world.units.find(x=>x.id===u.id)!;
    expect(issuedModelCombatFactor(restored.world,loaded,'attack')).toBe(attack);
    expect(issuedModelCombatFactor(restored.world,loaded,'defend')).toBe(defense);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let t=0;t<20;t++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'tick '+w.tick).toBe(hashWorld(w));
    }
  });
});
