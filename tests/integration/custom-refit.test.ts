import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {customTemplateStats} from '../../src/engine/military/customTemplates';

async function fixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const u=w.units.find(u=>u.owner===c && u.templateId==='standard-v1') ??
    w.units.find(u=>u.owner===c)!;
  const command=(type:string,p:Record<string,unknown>,seq:number)=>applyCommands(w,[{type,p,issuer:'player',seq}])[0];
  const own=w.prov.controller.findIndex(x=>x===c);
  // A deployed owned province is required for refit.
  u.loc=own;u.path=[];u.segIdx=0;u.segProgress=0;u.segDays=0;
  expect(command('createTemplate',{name:'Refit',battalionIds:[
    ...Array(6).fill('infantry-v1'),...Array(2).fill('artillery-heavy-v1')],supportIds:['engineer-v1']},1).ok).toBe(true);
  const t=w.customTemplates[0],stats=customTemplateStats(t);
  const change=(seq:number,revision=1)=>command('refitUnit',{unitId:u.id,templateId:t.templateId,revision},seq);
  const amounts=()=>[
    w.countries.manpowerPool[c]+u.manpower,
    w.countries.infEquipmentStock[c]+u.infEquipment,
    w.countries.artEquipmentStock[c]+u.artEquipment,
  ];
  return {e,w,c,u,t,stats,change,command,amounts};
}
describe('custom division refit',()=>{
  it('conserves manpower/equipment, keeps unit identity, organization is penalized',async()=>{
    const {e,w,u,stats,change,amounts}=await fixture();
    const original=amounts(),id=u.id,commander=u.commanderId,exp=u.exp,loc=u.loc;
    expect(change(2).ok).toBe(true);
    expect(amounts()).toEqual(original);
    expect(u.maxManpower).toBe(stats.manpower);
    expect(u.maxInfEquipment).toBe(stats.infantry);
    expect(u.maxArtEquipment).toBe(stats.artillery);
    expect(u.customTemplateId).toBe(1);expect(u.customRevision).toBe(1);
    expect(u.templateId).toBeUndefined();
    expect(u.org).toBeLessThanOrEqual(stats.org/2);
    expect([u.id,u.commanderId,u.exp,u.loc]).toEqual([id,commander,exp,loc]);
    const before=hashWorld(w);
    expect(e.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
  });
  it('does not heal existing losses for free when shrinking capacity',async()=>{
    const {u,change,amounts}=await fixture();
    u.manpower=Math.min(u.manpower,u.maxManpower-3000);
    u.infEquipment=Math.min(u.infEquipment,u.maxInfEquipment-400);
    const [heldMp,heldInf]=[u.manpower,u.infEquipment];
    const before=amounts();
    expect(change(2).ok).toBe(true);
    expect(u.manpower).toBe(Math.min(heldMp,u.maxManpower));
    expect(u.infEquipment).toBe(Math.min(heldInf,u.maxInfEquipment));
    expect(amounts()).toEqual(before);
  });
  it('rejects insufficient resources without altering the unit or any pool',async()=>{
    const {w,c,u,command,amounts}=await fixture();
    expect(command('createTemplate',{name:'large',battalionIds:Array(25).fill('infantry-v1'),supportIds:[]},2).ok).toBe(true);
    const before=amounts(),oldMax=u.maxManpower;
    const stock=w.countries.manpowerPool[c];
    w.countries.manpowerPool[c]=0;
    expect(command('refitUnit',{unitId:u.id,templateId:2,revision:1},3).reason).toBe('insufficientManpower');
    expect(u.maxManpower).toBe(oldMax);
    expect(amounts()[0]).toBe(before[0]-stock);
  });
  it('retains shortages when upgrading from the previous custom revision',async()=>{
    const {w,c,u,command,change,amounts}=await fixture();
    expect(change(2).ok).toBe(true);
    u.manpower-=1200;u.infEquipment-=30;
    expect(command('reviseTemplate',{templateId:1,expectedRevision:1,name:'larger',
      battalionIds:Array(10).fill('infantry-v1'),supportIds:['engineer-v1']},3).ok).toBe(true);
    const before=amounts(),previous= u.manpower;
    expect(change(4,2).ok).toBe(true);
    expect(amounts()).toEqual(before);
    expect(u.customRevision).toBe(2);
    expect(u.manpower).toBe(previous+2000);
    expect(u.manpower).toBeLessThan(u.maxManpower);
    expect(u.org).toBeLessThanOrEqual(25);
    expect(w.countries.manpowerPool[c]).toBeGreaterThanOrEqual(0);
  });
  it('blocks foreign, moving, occupied or combat-engaged units',async()=>{
    const {w,u,command,change}=await fixture();
    const foreign=w.units.find(x=>x.owner!==u.owner)!;
    expect(command('refitUnit',{unitId:foreign.id,templateId:1,revision:1},2).reason).toBe('notYourUnit');
    u.path=[u.loc,(u.loc+1)%w.prov.count];
    expect(change(3).reason).toBe('unitBusy');
    u.path=[];
    w.runtime.activeBattles.add(u.loc);
    expect(change(4).reason).toBe('unitBusy');
    w.runtime.activeBattles.delete(u.loc);
    u.encircled=true;
    expect(change(5).reason).toBe('unitBusy');
    expect(u.customTemplateId).toBeUndefined();
  });
});
