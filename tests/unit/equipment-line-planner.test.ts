import {describe,expect,it} from 'vitest';
import {loadTestPack} from '../helpers';
import {allocateProductionLines,efficiencyAfterDay,efficiencyAfterSwitch,
  modelDailyOutput,settleModelOutputs,validateProductionLines, type ProductionLinePlan
} from '../../src/engine/systems/equipmentLinePlanner';

const make=(id:number,modelId:string,requestedFactories:number,priority:number,active=true,
  efficiency=0.8):ProductionLinePlan=>({id,country:0,modelId,requestedFactories,priority,active,efficiency});

describe('phase6 production planning pure core',()=>{
  it('deterministically allocates priority then ID, preserves requests and stops idle lines',()=>{
    const lines=[
      make(3,'infantry-rifle-1990',10,2),
      make(2,'artillery-towed-2000',6,8),
      make(1,'infantry-rifle-1990',4,8),
      make(4,'infantry-rifle-1990',3,9,false),
    ];
    const before=JSON.stringify(lines);
    const plan=allocateProductionLines(lines,9);
    expect(plan.lines.map(l=>l.allocatedFactories)).toEqual([0,5,4,0]);
    expect(plan.totalAllocated).toBe(9);
    expect(plan.unusedFactories).toBe(0);
    expect(JSON.stringify(lines)).toBe(before);
    const next=allocateProductionLines(lines,20);
    expect(next.lines.map(l=>l.allocatedFactories)).toEqual([10,6,4,0]);
    expect(next.lines.map(l=>l.requestedFactories)).toEqual(lines.map(l=>l.requestedFactories));
    expect(allocateProductionLines(lines,0).totalAllocated).toBe(0);
  });
  it('never accepts duplicate line IDs, bad capacity, missing models or invalid efficiency',async()=>{
    const models=(await loadTestPack()).equipmentModels!;
    const a=make(1,models[0].id,1,5);
    expect(validateProductionLines([a,{...a}],models)).toContain('invalidLineId');
    expect(validateProductionLines([make(1,'unknown',1,5)],models)).toContain('unknownModel');
    expect(validateProductionLines([make(1,models[0].id,-1,5)],models)).toContain('invalidFactories');
    expect(validateProductionLines([make(1,models[0].id,1,10)],models)).toContain('invalidPriority');
    expect(validateProductionLines([make(1,models[0].id,1,5,true,NaN)],models)).toContain('invalidEfficiency');
    expect(()=>allocateProductionLines([a],-1)).toThrow(RangeError);
    expect(()=>allocateProductionLines([a,{...a}],2)).toThrow(RangeError);
    expect(()=>allocateProductionLines([a,{...a,id:2,country:1}],2)).toThrow(RangeError);
    expect(()=>allocateProductionLines([{...a,efficiency:Infinity}],2)).toThrow(RangeError);
  });
  it('reduces efficiency on model switch but never on allocation loss',async()=>{
    const models=(await loadTestPack()).equipmentModels!;
    const rifle=models.find(m=>m.id==='infantry-rifle-1990')!;
    const newer=models.find(m=>m.id==='infantry-rifle-2028')!;
    const artillery=models.find(m=>m.id==='artillery-towed-2000')!;
    expect(efficiencyAfterSwitch(rifle,rifle,.8)).toBe(.8);
    expect(efficiencyAfterSwitch(rifle,newer,.8)).toBe(.4);
    expect(efficiencyAfterSwitch(rifle,artillery,.8)).toBe(.1);
    expect(efficiencyAfterDay(.4,0)).toBe(.4);
    expect(efficiencyAfterDay(.4,5)).toBeCloseTo(.405);
    expect(efficiencyAfterDay(.8,5)).toBe(.8);
  });
  it('settles model-specific fractional carry without moving old remainder into a new model',async()=>{
    const models=(await loadTestPack()).equipmentModels!;
    const x=make(1,'infantry-rifle-1990',1,5,true,.8);
    const y=make(2,'artillery-towed-2000',1,5,true,.8);
    const allocations=allocateProductionLines([x,y],2).lines;
    const day1=settleModelOutputs(allocations,models,{},1);
    const daily=allocations.map(l=>modelDailyOutput(l,models.find(m=>m.id===l.modelId)!,1));
    expect(day1.find(r=>r.modelId===x.modelId)!.produced).toBe(Math.floor(daily[0]));
    expect(day1.find(r=>r.modelId===y.modelId)!.produced).toBe(Math.floor(daily[1]));
    const oldCarry=day1.find(r=>r.modelId===y.modelId)!.fractional;
    const switched=allocateProductionLines([make(2,'artillery-precision-2029',1,5,true,.4)],1).lines;
    const day2=settleModelOutputs(switched,models,{[y.modelId]:oldCarry},1);
    expect(day2.find(r=>r.modelId===y.modelId)!.produced).toBe(0);
    expect(day2.find(r=>r.modelId===y.modelId)!.fractional).toBeCloseTo(oldCarry);
    expect(day2.find(r=>r.modelId==='artillery-precision-2029')!.produced).toBeGreaterThanOrEqual(0);
  });
});
