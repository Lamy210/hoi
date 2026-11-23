import {describe,it,expect} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {startWar} from '../../src/engine/military/war';
import {frontView} from '../../src/ui/maprender/frontView';

async function fixture(warring=false){
  const e=await createTestEngine(1,88,'KOR'),w=e.world;
  const c=w.playerCountry,enemy=w.countries.id.indexOf('PRK');
  const p=w.prov.id.indexOf('KR-41'),q=w.prov.id.indexOf('KR-11'),foreign=w.prov.id.indexOf('KP-07');
  if(warring)startWar(w,c,enemy,false);
  let seq=0;
  const issue=(type:string,params:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p:params}])[0];
  expect(issue('createFront',{enemy,provinces:[p]}).ok).toBe(true);
  const f=w.fronts[0],u=w.units.find(u=>u.owner===c)!;
  expect(issue('assignToFront',{frontId:f.id,units:[u.id]}).ok).toBe(true);
  expect(issue('setFrontStance',{frontId:f.id,stance:'attack',targets:[foreign]}).ok).toBe(true);
  return {e,w,c,enemy,p,q,foreign,f,u,issue};
}

describe('updateFrontProvinces: 編集中は既存の作戦・師団編入を維持',()=>{
  it('平時戦線の範囲を変更、世代更新、目標/師団/停止状態と保存往復を維持',async()=>{
    const {e,w,p,q,foreign,f,u,issue}=await fixture();
    const rev=f.revision??1,oldId=f.id,oldStance=f.stance,oldTargets=f.targets.slice();
    const snap=e.getUiSnapshot(0);
    expect(snap.fronts[0].revision).toBe(rev);
    expect(issue('updateFrontProvinces',{frontId:oldId,expectedRevision:rev,provinces:[q,p]}).ok).toBe(true);
    expect(f.provinces).toEqual([p,q].sort((a,b)=>a-b));
    expect(f.revision).toBe(rev+1);
    expect(f.targets).toEqual(oldTargets);
    expect(f.targets).toEqual([foreign]);
    expect(f.stance).toBe(oldStance);
    expect(f.paused).toBe(true);
    expect(u.frontId).toBe(oldId);
    expect(w.nextFrontId).toBe(2);
    const view=frontView(e.getUiSnapshot(0),[u.id],'selected')[0];
    expect(view.provinces).toEqual([p,q].sort((a,b)=>a-b));
    const before=hashWorld(w),bytes=e.serialize();
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    expect(e.world.fronts[0].revision).toBe(rev+1);
  });
  it('古い編集・不正州・空集合・重複を拒否し、元の範囲・世代を変更しない',async()=>{
    const {w,c,p,q,foreign,f,issue}=await fixture();
    const oldRevision=f.revision??1;
    expect(issue('setFrontStance',{frontId:f.id,stance:'hold'}).ok).toBe(true);
    const revision=f.revision??1;
    const before=f.provinces.slice();
    const attempts=[
      {expectedRevision:oldRevision,provinces:[p,q],reason:'staleFrontOrder'},
      {expectedRevision:revision,provinces:[],reason:'badParams'},
      {expectedRevision:revision,provinces:[p,p],reason:'badParams'},
      {expectedRevision:revision,provinces:[p,foreign],reason:'notControlledByYou'},
      {expectedRevision:revision,provinces:[p,-1],reason:'badProvince'},
      {expectedRevision:revision,provinces:[p,1.5],reason:'badProvince'},
      {expectedRevision:revision,provinces:Array(257).fill(p).map((_,i)=>i),reason:'badParams'},
      {expectedRevision:null,provinces:[p,q],reason:'staleFrontOrder'},
    ];
    for(const a of attempts){
      const result=issue('updateFrontProvinces',{frontId:f.id,expectedRevision:a.expectedRevision,provinces:a.provinces});
      expect(result.reason).toBe(a.reason);
      expect(f.revision).toBe(revision);
      expect(f.provinces).toEqual(before);
    }
    expect(w.prov.controller[q]).toBe(c);
  });
  it('戦時に範囲を修正すると旧世代の自動命令が無効化される',async()=>{
    const {w,p,q,f,u,issue}=await fixture(true);
    const old=f.revision??1;
    expect(issue('updateFrontProvinces',{frontId:f.id,expectedRevision:old,provinces:[p,q]}).ok).toBe(true);
    const result=applyCommands(w,[{issuer:'frontai',seq:1,type:'frontMove',p:{
      frontId:f.id,revision:old,unitId:u.id,target:q}}])[0];
    expect(result.reason).toBe('staleFrontOrder');
    expect(u.path).toEqual([]);
    expect(f.paused).toBe(false);
  });
  it('他国からの編集を拒否する',async()=>{
    const {w,p,q,enemy,f}=await fixture();
    const foreign=applyCommands(w,[{issuer:'ai:'+enemy,seq:1,type:'updateFrontProvinces',p:{
      frontId:f.id,expectedRevision:f.revision,provinces:[p,q]}}])[0];
    expect(foreign.reason).toBe('notYourFront');
    expect(f.provinces).toEqual([p]);
  });
});
