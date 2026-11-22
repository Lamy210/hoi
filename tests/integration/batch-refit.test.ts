import { describe, expect, it } from 'vitest';
import { applyCommands } from '../../src/engine/core/command';
import { createTestEngine } from '../helpers';
import { calculateRefitResources, MAX_BATCH_REFIT } from '../../src/engine/military/refit';
import { hashWorld } from '../../src/engine/core/hash';

async function fixture() {
  const engine=await createTestEngine(),w=engine.world,c=w.playerCountry;
  const unit=w.units.find(u=>u.owner===c)!;
  const own=w.prov.controller.findIndex(v=>v===c);
  unit.loc=own; unit.path=[];unit.segIdx=0;unit.segProgress=0;unit.segDays=0;
  const second={...unit,id:w.nextUnitId++,manpower:unit.manpower,org:unit.org,infEquipment:unit.infEquipment,artEquipment:unit.artEquipment,path:[]};
  w.units.push(second);
  const command=(type:string,p:Record<string,unknown>,seq:number)=>applyCommands(w,[{type,p,issuer:'player',seq}])[0];
  expect(command('createTemplate',{name:'Batch refit',battalionIds:Array(6).fill('infantry-v1'),supportIds:[]},1).ok).toBe(true);
  const template=w.customTemplates.at(-1)!;
  const ids=[unit.id,second.id];
  const pools=()=>[w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
  const total=()=>[pools()[0]+unit.manpower+second.manpower,pools()[1]+unit.infEquipment+second.infEquipment,pools()[2]+unit.artEquipment+second.artEquipment];
  const apply=(idsToApply:unknown=ids,seq=2)=>command('refitUnits',{unitIds:idsToApply,templateId:template.templateId,revision:template.revision},seq);
  return {engine,w,c,unit,second,ids,template,command,pools,total,apply,own};
}

describe('atomic multi-division refit',()=>{
  it('refits both in a single command, preserving stocks, losses and unit identity across save/load',async()=>{
    const f=await fixture();
    f.unit.manpower-=200;f.second.infEquipment-=150;
    const old=[f.unit.manpower,f.second.infEquipment],before=f.total();
    const original=[f.unit.loc,f.unit.commanderId,f.unit.armyId,f.unit.id,f.second.id];
    expect(f.apply().ok).toBe(true);
    expect(f.total()).toEqual(before);
    expect(f.unit.manpower).toBe(Math.min(old[0],f.unit.maxManpower));
    expect(f.second.infEquipment).toBe(Math.min(old[1],f.second.maxInfEquipment));
    expect([f.unit.loc,f.unit.commanderId,f.unit.armyId,f.unit.id,f.second.id]).toEqual(original);
    expect(f.unit.customTemplateId).toBe(f.template.templateId);
    expect(f.second.customTemplateId).toBe(f.template.templateId);
    expect(f.unit.org).toBeLessThan(50);
    const hash=hashWorld(f.w);
    expect(f.engine.loadFrom(f.engine.serialize()).ok).toBe(true);
    expect(hashWorld(f.engine.world)).toBe(hash);
  });

  it('rejects the entire batch when one division is busy or foreign',async()=>{
    const f=await fixture(),snapshot=()=>JSON.stringify([f.unit,f.second,f.pools()]);
    f.second.encircled=true;
    const before=snapshot();
    expect(f.apply().reason).toBe('unitBusy');
    expect(snapshot()).toBe(before);
    f.second.encircled=false;
    f.second.owner=(f.c+1)%f.w.countries.count;
    const beforeForeign=snapshot();
    expect(f.apply(f.ids,3).reason).toBe('notYourUnit');
    expect(snapshot()).toBe(beforeForeign);
  });

  it('rejects duplicates, invalid payloads and too many units',async()=>{
    const f=await fixture(),snapshot=JSON.stringify([f.unit,f.second,f.pools()]);
    expect(f.apply([f.ids[0],f.ids[0]]).reason).toBe('badParams');
    expect(f.apply('bad',3).reason).toBe('badParams');
    expect(f.apply(Array(MAX_BATCH_REFIT+1).fill(f.ids[0]),4).reason).toBe('limitExceeded');
    expect(JSON.stringify([f.unit,f.second,f.pools()])).toBe(snapshot);
  });

  it('rejects insufficient aggregate stock without applying any part',async()=>{
    const f=await fixture();
    expect(f.command('createTemplate',{name:'large',battalionIds:Array(25).fill('infantry-v1'),supportIds:[]},2).ok).toBe(true);
    const t=f.w.customTemplates.at(-1)!;
    f.w.countries.manpowerPool[f.c]=0;
    const before=JSON.stringify([f.unit,f.second,f.pools()]);
    const r=f.command('refitUnits',{unitIds:f.ids,templateId:t.templateId,revision:1},3);
    expect(r.reason).toBe('insufficientManpower');
    expect(JSON.stringify([f.unit,f.second,f.pools()])).toBe(before);
  });

  it('accounts for batch refunds before purchases, including non-monotonic capabilities',async()=>{
    const f=await fixture();
    const u=f.unit,v=f.second;
    // Different old maxima; a shrinking unit can fund an expanding one.
    u.maxInfEquipment=2000;u.infEquipment=2000;
    v.maxInfEquipment=100;v.infEquipment=100;
    f.w.countries.infEquipmentStock[f.c]=0;
    const rev=f.w.customTemplates.at(-1)!;
    const {customTemplateStats}=await import('../../src/engine/military/customTemplates');
    const amounts=calculateRefitResources([u,v],customTemplateStats(rev));
    expect(amounts.refund[1]).toBeGreaterThan(0);
    expect(amounts.purchase[1]).toBeGreaterThan(0);
    expect(amounts.net[1]).toBeLessThanOrEqual(0);
    const before=f.total();
    expect(f.apply().ok).toBe(true);
    expect(f.total()).toEqual(before);
    expect(f.pools().every(n=>n>=0)).toBe(true);
  });
});
