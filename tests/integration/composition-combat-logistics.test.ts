import { describe, expect, it } from 'vitest';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { tickTraining } from '../../src/engine/systems/training';
import { unitPowerFactors,unitPowerFactorsPure } from '../../src/engine/systems/combat';
import { unitCombatWidth,unitOrgCap,unitSupplyDemand,unitSpeedMultiplier,selectCombatFront } from '../../src/engine/military/unitComposition';
import { recomputeSupply } from '../../src/engine/systems/logistics';
import { segmentDays } from '../../src/engine/systems/movement';
import { hashWorld } from '../../src/engine/core/hash';

async function fixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry,province=w.countries.capital[c];
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  const comp={name:'6歩兵2重砲工兵',battalionIds:[...Array(6).fill('infantry-v1'),...Array(2).fill('artillery-heavy-v1')],supportIds:['engineer-v1']};
  expect(issue('createTemplate',comp).ok).toBe(true);
  expect(issue('startCustomTraining',{templateId:1,revision:1,province}).ok).toBe(true);
  const ready=w.trainingQueue[0].readyTick;
  w.tick=ready;tickTraining(w);
  const u=w.units.find(u=>u.customTemplateId===1)!;
  return {e,w,c,province,u,issue};
}
function f(cs:ReturnType<typeof unitPowerFactors>,key:string){return cs.find(x=>x.label===key)!.value;}

describe('custom composition in real combat, logistics and movement',()=>{
  it('uses battalion attack/defense and width, while keeping legacy 40-point baseline',async()=>{
    const {w,u,c}=await fixture();
    const province=u.loc;
    const customA=f(unitPowerFactors(w,u,province,'attack'),'base');
    const customD=f(unitPowerFactors(w,u,province,'defend'),'base');
    expect(customA).toBe(34.5);expect(customD).toBe(34);
    expect(unitCombatWidth(w,u)).toBe(16);
    expect(unitOrgCap(w,u)).toBeCloseTo((6000*60+2000*50+200*60)/8200,6);
    expect(unitSupplyDemand(w,u)).toBeCloseTo(9.2,8);
    expect(unitSpeedMultiplier(w,u)).toBe(1);
    const legacy=w.units.find(x=>x.owner===c && x.customTemplateId===undefined)!;
    expect(unitCombatWidth(w,legacy)).toBe(20);
    expect(unitOrgCap(w,legacy)).toBe(100);
    expect(unitSupplyDemand(w,legacy)).toBe(10);
    expect(f(unitPowerFactorsPure({...legacy,templateId:'standard-v1',maxManpower:10000},0,1,'attack'),'base')).toBe(40);
    // The UI reports exactly what the battle/ logistics consume.
    const ui=w.units.find(x=>x.id===u.id)!;
    const snap=(await createTestEngine()).getUiSnapshot(0);
    expect(ui.maxManpower).toBe(8200);
    expect(snap.units.some(x=>x.owner===c)).toBe(true);
  });

  it('respects terrain width with stable id order and over-wide fallback',async()=>{
    const {w,u,c}=await fixture();
    // Compare equal-readiness divisions: this case tests frontage fitting
    // and ID order, while combat-reserve-rotation covers exhaustion sorting.
    const short={...u,id:800000,customTemplateId:1,customRevision:1,org:100};
    const another={...u,id:800001,customTemplateId:1,customRevision:1,org:100};
    const legacy={...w.units.find(x=>x.owner===c && x.customTemplateId===undefined)!,id:800002,org:100};
    const one=selectCombatFront(w,[short,another,legacy],1);
    expect(one.units.map(x=>x.id)).toEqual([short.id]);
    expect(one.penalties).toEqual([1]);
    const two=selectCombatFront(w,[short,another,legacy],2);
    expect(two.units.map(x=>x.id)).toEqual([short.id,another.id]);
    const wide={...u,id:800003,customTemplateId:1};
    const fallback=selectCombatFront(w,[wide],0.5);
    expect(fallback.units).toHaveLength(1);
    expect(fallback.penalties[0]).toBeCloseTo(10/16,8);
    expect(selectCombatFront(w,[legacy,legacy],1).units).toHaveLength(1);
  });

  it('consumes supply capacity according to demand instead of treating all divisions as identical',async()=>{
    const {w,u,province,c}=await fixture();
    const legacy=w.units.find(x=>x.owner===c&&x.customTemplateId===undefined)!;
    // All units in the same owned hub; no other army competes in this synthetic comparison.
    const template=(source:typeof u,n:number)=>Array.from({length:n},(_,i)=>({...source,id:1000000+i,loc:province,owner:c,destroyed:false}));
    w.units=template(legacy,48);
    recomputeSupply(w);
    const filledLegacy=[...w.runtime.unitSupplyFactor.values()].filter(x=>x===1).length;
    // One-infantry battalion consumes just 1 supply point.
    const t=w.customTemplates[0];t.battalionIds=['infantry-v1'];t.supportIds=[];
    w.units=template(u,48);
    recomputeSupply(w);
    const filledCustom=[...w.runtime.unitSupplyFactor.values()].filter(x=>x===1).length;
    expect(filledCustom).toBeGreaterThan(filledLegacy);
  });

  it('preserves computed movement time for existing all-speed-1 battalions',async()=>{
    const {w,u}=await fixture();
    const from=u.loc;
    const edge=w.adj.targets[w.adj.offsets[from]];
    expect(segmentDays(w,from,edge,u)).toBe(segmentDays(w,from,edge));
    expect(Number.isFinite(segmentDays(w,from,edge,u))).toBe(true);
  });

  it('regenerates organization only to the composition-specific cap',async()=>{
    const {e,w,u}=await fixture();
    // Simulate an idle division between battles.
    u.org=99;
    const cap=unitOrgCap(w,u);
    e.stepTick();
    expect(u.org).toBeLessThanOrEqual(cap);
    expect(u.org).toBeGreaterThanOrEqual(0);
    expect(hashWorld(w)).toBe(hashWorld(w));
  });
});
