import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {planGroupFrontAssignments} from '../../src/engine/military/groupFrontAssignments';
import {planGroupFrontDeployment} from '../../src/engine/military/groupFrontDeployment';

async function fixture(){
  const e=await createTestEngine(1,911,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  const provinces=['KR-41','KR-11'].map(id=>w.prov.id.indexOf(id));
  expect(provinces.every(p=>p>=0&&w.prov.controller[p]===c)).toBe(true);
  const units=w.units.filter(u=>u.owner===c&&!u.destroyed).slice(0,2);
  expect(units).toHaveLength(2);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  for(const u of units){
    u.path=[];u.segIdx=0;u.segDays=0;u.segProgress=0;u.encircled=false;
  }
  expect(issue('createArmy',{name:'Alpha',color:'#4479b6'}).ok).toBe(true);
  expect(issue('createArmy',{name:'Bravo',color:'#638b64'}).ok).toBe(true);
  expect(issue('createArmyGroup',{name:'Northern',color:'#638b64'}).ok).toBe(true);
  expect(issue('assignArmy',{armyId:1,unitIds:[units[0].id]}).ok).toBe(true);
  expect(issue('assignArmy',{armyId:2,unitIds:[units[1].id]}).ok).toBe(true);
  expect(issue('assignArmyGroup',{groupId:1,armyIds:[1,2]}).ok).toBe(true);
  expect(issue('createFront',{enemy,provinces:[provinces[0]]}).ok).toBe(true);
  expect(issue('createFront',{enemy,provinces:[provinces[1]]}).ok).toBe(true);
  const assignments=[
    {armyId:1,frontId:w.fronts[0].id,expectedRevision:w.fronts[0].revision,unitIds:[units[0].id]},
    {armyId:2,frontId:w.fronts[1].id,expectedRevision:w.fronts[1].revision,unitIds:[units[1].id]},
  ];
  return {e,w,c,units,issue,assignments};
}

describe('atomic army group multi-front assignments',()=>{
  it('assigns each army to its own front, retains manual holds and survives save/load/replay',async()=>{
    const {e,w,c,units,issue,assignments}=await fixture();
    units[0].manualHold=true;
    const before=hashWorld(w);
    const plan=planGroupFrontAssignments(w,c,1,assignments);
    expect(plan.reason).toBeNull();
    expect(plan.orders).toEqual(units.map((u,i)=>({unitId:u.id,frontId:assignments[i].frontId}))
      .sort((a,b)=>a.unitId-b.unitId));
    expect(hashWorld(w)).toBe(before);
    expect(issue('assignGroupFronts',{groupId:1,assignments:[...assignments].reverse()}).ok).toBe(true);
    expect(units[0].frontId).toBe(assignments[0].frontId);
    expect(units[1].frontId).toBe(assignments[1].frontId);
    expect(units[0].manualHold).toBe(true);
    expect(units.every(u=>!u.path.length)).toBe(true);
    const restored=await createTestEngine(1,911,'KOR');
    expect(restored.loadFrom(e.serialize()).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let day=0;day<5;day++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+day).toBe(hashWorld(w));
    }
  });

  it('rejects stale front, changed membership, foreign front and garrison without partial assignment',async()=>{
    const {w,c,units,issue,assignments}=await fixture();
    const initial=units.map(u=>u.frontId);
    const invalid=[
      {groupId:1,assignments:[assignments[0],assignments[0]],reason:'badParams'},
      {groupId:1,assignments:[{...assignments[0],expectedRevision:0},assignments[1]],reason:'badParams'},
      {groupId:1,assignments:[{...assignments[0],expectedRevision:999},assignments[1]],reason:'staleFrontOrder'},
      {groupId:1,assignments:[{...assignments[0],unitIds:[999999]},assignments[1]],reason:'staleFormation'},
      {groupId:1,assignments:[{...assignments[0],frontId:999999},assignments[1]],reason:'noFront'},
      {groupId:999999,assignments,reason:'notYourArmy'},
      {groupId:1,assignments:[assignments[0]],reason:'badParams'},
    ];
    for(const test of invalid){
      const plan=planGroupFrontAssignments(w,c,test.groupId,test.assignments);
      expect(plan.reason).toBe(test.reason);
      expect(plan.orders).toEqual([]);
      const result=issue('assignGroupFronts',test);
      expect(result.reason).toBe(test.reason);
      expect(units.map(u=>u.frontId)).toEqual(initial);
    }
    w.garrisons.push({id:1,owner:c,provinces:[units[1].loc],unitIds:[units[1].id],paused:true,revision:1});
    expect(issue('assignGroupFronts',{groupId:1,assignments}).reason).toBe('unitAlreadyAssigned');
    expect(units.map(u=>u.frontId)).toEqual(initial);
    w.garrisons=[];
    units[1].path=[units[1].loc,units[0].loc];
    expect(issue('assignGroupFronts',{groupId:1,assignments}).reason).toBe('unitBusy');
    expect(units.map(u=>u.frontId)).toEqual(initial);
  });

  it('rejects group membership changes not present in the submitted snapshot',async()=>{
    const {issue,units,assignments}=await fixture();
    expect(issue('assignArmy',{armyId:2,unitIds:[units[0].id]}).ok).toBe(true);
    const before=units.map(u=>u.frontId);
    expect(issue('assignGroupFronts',{groupId:1,assignments}).reason).toBe('staleFormation');
    expect(units.map(u=>u.frontId)).toEqual(before);
  });

  it('atomically deploys two armies to separate fronts with ordinary routes and reproducible saves',async()=>{
    const {e,w,c,units,issue,assignments}=await fixture();
    const origin=w.prov.id.indexOf('KR-41');
    expect(origin).toBeGreaterThanOrEqual(0);
    for(const u of units)u.loc=origin;
    const before=hashWorld(w);
    const planned=planGroupFrontDeployment(w,c,1,assignments,'nearest');
    expect(planned.reason).toBeNull();
    expect(planned.orders).toHaveLength(2);
    expect(hashWorld(w)).toBe(before);
    expect(issue('deployGroupFronts',{groupId:1,assignments,strategy:'nearest'}).ok).toBe(true);
    for(const order of planned.orders){
      const unit=w.units.find(u=>u.id===order.unitId)!;
      expect(unit.frontId).toBe(order.frontId);
      expect(unit.path).toEqual(order.path);
      expect(unit.manualHold).toBe(false);
    }
    const saved=e.serialize(),restored=await createTestEngine(1,911,'KOR');
    expect(restored.loadFrom(saved).ok).toBe(true);
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
    for(let d=0;d<5;d++){
      e.stepTick();restored.stepTick();
      expect(hashWorld(restored.world),'day '+d).toBe(hashWorld(w));
    }
  });

  it('combines two armies targeting the same front to preserve even distribution',async()=>{
    const {w,c,units,assignments,issue}=await fixture();
    const origin=w.prov.id.indexOf('KR-41'),other=w.prov.id.indexOf('KR-11');
    for(const u of units)u.loc=origin;
    w.fronts[0].provinces=[origin,other];
    const sameFront=assignments.map(a=>({...a,
      frontId:assignments[0].frontId,expectedRevision:assignments[0].expectedRevision,
    }));
    const plan=planGroupFrontDeployment(w,c,1,[...sameFront].reverse(),'even');
    expect(plan.reason).toBeNull();
    expect(new Set(plan.orders.map(o=>o.target)).size).toBe(2);
    expect(issue('deployGroupFronts',{groupId:1,assignments:sameFront,strategy:'even'}).ok).toBe(true);
    expect(units.every(u=>u.frontId===sameFront[0].frontId)).toBe(true);
  });

  it('rejects late invalid fronts and busy divisions without partially deploying earlier armies',async()=>{
    const {w,c,units,assignments,issue}=await fixture();
    const initial=units.map(u=>({frontId:u.frontId,path:[...u.path]}));
    const bad=[
      {assignments,strategy:'invalid',reason:'badParams'},
      {assignments:[{...assignments[0],expectedRevision:999},assignments[1]],strategy:'even',reason:'staleFrontOrder'},
      {assignments:[{...assignments[0],unitIds:[999999]},assignments[1]],strategy:'even',reason:'staleFormation'},
    ];
    for(const entry of bad){
      expect(planGroupFrontDeployment(w,c,1,entry.assignments,entry.strategy).reason).toBe(entry.reason);
      expect(issue('deployGroupFronts',{groupId:1,assignments:entry.assignments,strategy:entry.strategy}).reason).toBe(entry.reason);
      expect(units.map(u=>({frontId:u.frontId,path:[...u.path]}))).toEqual(initial);
    }
    w.fronts[1].provinces=[];
    expect(planGroupFrontDeployment(w,c,1,assignments,'even').reason).toBe('noFrontProvinces');
    expect(issue('deployGroupFronts',{groupId:1,assignments,strategy:'even'}).reason).toBe('noFrontProvinces');
    expect(units.map(u=>({frontId:u.frontId,path:[...u.path]}))).toEqual(initial);
    w.fronts[1].provinces=[w.prov.id.indexOf('KR-11')];
    units[1].manualHold=true;
    expect(issue('deployGroupFronts',{groupId:1,assignments,strategy:'even'}).reason).toBe('unitBusy');
    expect(units.map(u=>({frontId:u.frontId,path:[...u.path]}))).toEqual(initial);
  });
});
