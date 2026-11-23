import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {startWar} from '../../src/engine/military/war';
import {hashWorld} from '../../src/engine/core/hash';

describe('atomic createFront with division assignment',()=>{
  it('平時に戦線と師団を同時作成・編入し、手動固定と保存/復元を維持する',async()=>{
    const e=await createTestEngine(1,31,'KOR'),w=e.world,c=w.playerCountry,enemy=w.countries.id.indexOf('PRK');
    const province=w.prov.id.indexOf('KR-41'),units=w.units.filter(u=>u.owner===c).slice(0,3),ids=units.map(u=>u.id);
    let seq=0;
    const cmd=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    expect(cmd('setManualHold',{units:[ids[0]],hold:true}).ok).toBe(true);
    expect(cmd('createFront',{enemy,provinces:[province],units:ids}).ok).toBe(true);
    expect(w.fronts).toHaveLength(1);
    expect(w.fronts[0].paused).toBe(true);
    expect(units.every(u=>u.frontId===w.fronts[0].id)).toBe(true);
    expect(units[0].manualHold).toBe(true);
    expect(units.every(u=>u.path.length===0)).toBe(true);
    const before=hashWorld(w),bytes=e.serialize();
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(before);
    expect(e.world.fronts[0].paused).toBe(true);
    expect(e.world.units.filter(u=>ids.includes(u.id)).every(u=>u.frontId===w.fronts[0].id)).toBe(true);
  });
  it('不正バッチは前線ID・所属・手動固定を含め一切変更しない',async()=>{
    const e=await createTestEngine(1,32,'KOR'),w=e.world,c=w.playerCountry,enemy=w.countries.id.indexOf('PRK');
    const province=w.prov.id.indexOf('KR-41'),own=w.units.find(u=>u.owner===c)!,foreign=w.units.find(u=>u.owner!==c)!;
    let seq=0;
    const issue=(units:unknown)=>applyCommands(w,[{issuer:'player',seq:++seq,type:'createFront',p:{enemy,provinces:[province],units}}])[0];
    const original=w.nextFrontId,fronts=w.fronts.length,oldFront=own.frontId;
    expect(issue([own.id,foreign.id]).reason).toBe('notYourUnit');
    expect(issue([own.id,own.id]).reason).toBe('badParams');
    expect(issue([own.id,999999]).reason).toBe('notYourUnit');
    expect(issue([]).reason).toBe('badParams');
    expect(issue(Array.from({length:257},(_,i)=>i+1)).reason).toBe('badParams');
    expect(issue([1.5]).reason).toBe('badParams');
    expect(w.fronts.length).toBe(fronts);
    expect(w.nextFrontId).toBe(original);
    expect(own.frontId).toBe(oldFront);
  });
  it('戦時の同時作成でも手動固定を勝手に解除しない',async()=>{
    const e=await createTestEngine(1,33,'KOR'),w=e.world,c=w.playerCountry,enemy=w.countries.id.indexOf('PRK');
    const province=w.prov.id.indexOf('KR-41'),u=w.units.find(u=>u.owner===c)!;
    startWar(w,c,enemy,false);
    let seq=0;
    const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
    expect(issue('setManualHold',{units:[u.id],hold:true}).ok).toBe(true);
    expect(issue('createFront',{enemy,provinces:[province],units:[u.id]}).ok).toBe(true);
    expect(w.fronts[0].paused).toBe(false);
    expect(u.frontId).toBe(w.fronts[0].id);
    expect(u.manualHold).toBe(true);
  });
});
