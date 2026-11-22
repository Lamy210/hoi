import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {dailyEquipmentOutput,forecastProductionLines} from '../../src/engine/systems/production';

describe('production-line daily output forecast',()=>{
  it('has zero for stopped lines and reproduces exactly the live infantry/artillery totals',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const original=dailyEquipmentOutput(w,c);
    const plans=forecastProductionLines(w,c);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.some(l=>l.estimatedDailyOutput>0)).toBe(true);
    // Hypothetical forecast must not change actual legacy output or efficiency.
    const efficiencies=w.productionLines.map(l=>l.efficiency);
    expect(dailyEquipmentOutput(w,c)).toEqual(original);
    expect(w.productionLines.map(l=>l.efficiency)).toEqual(efficiencies);
    const r=applyCommands(w,[{issuer:'player',seq:1,type:'setProductionMode',p:{mode:'lines'}}])[0];
    expect(r.ok).toBe(true);
    const forecast=forecastProductionLines(w,c);
    const output=dailyEquipmentOutput(w,c);
    expect(forecast.filter(l=>l.category==='infantry').reduce((n,l)=>n+l.estimatedDailyOutput,0)).toBeCloseTo(output.infantry);
    expect(forecast.filter(l=>l.category==='artillery').reduce((n,l)=>n+l.estimatedDailyOutput,0)).toBeCloseTo(output.artillery);
    const line=w.productionLines.find(l=>l.country===c)!;
    line.active=false;
    const disabled=forecastProductionLines(w,c).find(l=>l.id===line.id)!;
    expect(disabled.allocatedFactories).toBe(0);
    expect(disabled.estimatedDailyOutput).toBe(0);
    expect(e.getUiSnapshot(0).countries[c].productionLines.find(l=>l.id===line.id)?.estimatedDailyOutput).toBe(0);
  });
});
