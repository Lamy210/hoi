import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {startWar} from '../../src/engine/military/war';
import {runFront} from '../../src/engine/systems/fronts';

async function attackFixture() {
  const e=await createTestEngine(1,315,'KOR'),w=e.world,c=w.playerCountry;
  const enemy=w.countries.id.indexOf('PRK');
  expect(enemy).toBeGreaterThanOrEqual(0);
  let border=-1,target=-1;
  for(let p=0;p<w.prov.count&&border<0;p++){
    if(w.prov.controller[p]!==c)continue;
    for(let i=w.adj.offsets[p];i<w.adj.offsets[p+1];i++){
      const v=w.adj.targets[i];
      if(w.prov.controller[v]===enemy&&!w.adj.strait[i]){
        border=p;target=v;break;
      }
    }
  }
  expect(border).toBeGreaterThanOrEqual(0);
  expect(target).toBeGreaterThanOrEqual(0);
  const original=w.units.find(u=>u.owner===c&&!u.destroyed)!;
  const troops=Array.from({length:3},(_,i)=>({
    ...original,id:w.nextUnitId+i,armyId:null,commanderId:-1,
    loc:border,path:[],segIdx:0,segProgress:0,segDays:0,
    frontId:-1,manualHold:false,encircled:false,destroyed:false,
    org:100,manpower:1_000_000,maxManpower:1_000_000,
    infEquipment:original.maxInfEquipment,artEquipment:original.maxArtEquipment,
  }));
  w.nextUnitId+=troops.length;
  w.units.push(...troops);
  startWar(w,c,enemy,false);
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>
    applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(issue('createFront',{enemy,provinces:[border]}).ok).toBe(true);
  const front=w.fronts[0];
  expect(issue('assignToFront',{frontId:front.id,units:troops.map(u=>u.id)}).ok).toBe(true);
  expect(issue('setFrontStance',{frontId:front.id,stance:'attack',targets:[target],cap:1}).ok).toBe(true);
  return {w,troops,front,target,issue};
}

describe('front AI attack queue and manual-order precedence',()=>{
  it('held low-ID divisions do not consume the attack cap; queued orders revalidate against a later manual hold',async()=>{
    const {w,troops,front,target,issue}=await attackFixture();
    troops[0].manualHold=true;
    troops[2].manualHold=true;
    runFront(w,front,()=>0.5);
    const pending=w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove');
    expect(pending.map(x=>x.p.unitId)).toEqual([troops[1].id]);
    expect(pending[0].p.target).toBe(target);
    // Manual input issued after the planning pass must win at command-consumption time.
    expect(issue('setManualHold',{units:[troops[1].id],hold:true}).ok).toBe(true);
    const result=applyCommands(w,pending)[0];
    expect(result.reason).toBe('staleFrontOrder');
    expect(troops[1].path).toEqual([]);
  });

  it('already queued division orders do not exhaust the per-front order budget',async()=>{
    const {w,troops,front,target}=await attackFixture();
    w.runtime.commandsSinceLastTick.push({
      issuer:'frontai',seq:1,type:'frontMove',
      p:{frontId:front.id,revision:front.revision??1,unitId:troops[0].id,target},
    });
    runFront(w,front,()=>0.5);
    const queued=w.runtime.commandsSinceLastTick.filter(x=>x.type==='frontMove');
    expect(queued.map(x=>x.p.unitId)).toEqual([troops[0].id,troops[1].id]);
    expect(new Set(queued.map(x=>x.p.unitId)).size).toBe(2);
  });
});
