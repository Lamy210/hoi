import {decode,encode} from '@msgpack/msgpack';
import {describe,expect,it} from 'vitest';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {startWar} from '../../src/engine/military/war';
import {frontlinePriority,selectCombatFront} from '../../src/engine/military/unitComposition';
import {projectCombatFronts} from '../../src/engine/military/combatFrontProjection';
import {deserializeWorld,savePayloadChecksum,SAVE_SCHEMA_VERSION,type SaveHeader} from '../../src/engine/save/serialize';

async function battleFixture(){
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  const other=w.units.find(u=>u.owner!==c)?.owner??(c===0?1:0);
  const capital=w.countries.capital[c];
  const friendly=w.units.find(u=>u.owner===c)!;
  const enemy=w.units.find(u=>u.owner===other)!;
  startWar(w,c,other,true);
  w.prov.terrain[capital]=2; // mountains: live combat width 80
  w.units=[
    ...Array.from({length:5},(_,i)=>({...friendly,id:92000+i,owner:c,loc:capital,path:[],
      destroyed:false,manualHold:true,frontlinePriority:undefined,org:100})),
    {...enemy,id:92100,owner:other,loc:capital,path:[],destroyed:false,manualHold:true,org:100},
  ];
  w.nextUnitId=93000;
  return {e,w,c,capital};
}
describe('player-controlled frontline priority in the actual game',()=>{
  it('同順位は旧来ID昇順、末尾予備の優先度9への変更で実戦闘とUIの参加者が入れ替わる',async()=>{
    const {e,w}=await battleFixture();
    const before=projectCombatFronts(w)[0].defenders;
    expect(before.engagedIds).toEqual([92000,92001,92002,92003]);
    expect(before.reserveIds).toEqual([92004]);
    const r=applyCommands(w,[{issuer:'player',seq:1,type:'setFrontlinePriority',
      p:{unitIds:[92004],priority:9}}])[0];
    expect(r.ok).toBe(true);
    const projected=projectCombatFronts(w)[0].defenders;
    expect(projected.engagedIds).toEqual([92004,92000,92001,92002]);
    expect(projected.reserveIds).toEqual([92003]);
    const f=selectCombatFront(w,w.units.filter(u=>u.owner===w.playerCountry).reverse(),4);
    expect(f.units.map(u=>u.id)).toEqual(projected.engagedIds);
    const snap=e.getUiSnapshot(0);
    expect(snap.combatFronts?.[0].defenders.engagedIds).toEqual(projected.engagedIds);
    expect(snap.units.find(u=>u.id===92004)?.frontlinePriority).toBe(9);
    expect(snap.units.find(u=>u.id===92000)?.frontlinePriority).toBe(5);
  });

  it('複数師団コマンドは原子的、外国・重複・少数・非整数・壊滅を拒否する',async()=>{
    const {w,c}=await battleFixture();
    let seq=0;
    const cmd=(unitIds:unknown,priority:unknown,issuer='player')=>
      applyCommands(w,[{issuer,seq:++seq,type:'setFrontlinePriority',
        p:{unitIds,priority}}])[0];
    const initial=hashWorld(w);
    expect(cmd([92000,92001],0).ok).toBe(true);
    expect(w.units.filter(u=>u.owner===c).slice(0,2).map(u=>u.frontlinePriority)).toEqual([0,0]);
    for(const [ids,priority] of [
      [[92002,92100],9],[[92000,92000],9],[[92001],-1],
      [[92001],10],[[92001],2.5],[[92001],Number.NaN],
      [[],3],[[92004],Infinity],
    ] as const){
      const before=w.units.map(u=>u.frontlinePriority);
      expect(cmd(ids,priority).ok).toBe(false);
      expect(w.units.map(u=>u.frontlinePriority)).toEqual(before);
    }
    w.units.find(u=>u.id===92003)!.destroyed=true;
    expect(cmd([92001,92003],9).ok).toBe(false);
    expect(w.units.find(u=>u.id===92001)?.frontlinePriority).toBe(0);
    expect(cmd([92002],8,'frontai').ok).toBe(false);
    expect(w.units.find(u=>u.id===92002)?.frontlinePriority).toBeUndefined();
    expect(hashWorld(w)).not.toBe(initial);
  });

  it('優先度は通常補給優先度と独立し、優先度0も前線枠が空けば参加する',async()=>{
    const {w}=await battleFixture();
    w.units.find(u=>u.id===92000)!.frontlinePriority=0;
    w.units.find(u=>u.id===92004)!.frontlinePriority=9;
    const front=projectCombatFronts(w)[0].defenders;
    expect(front.engagedIds).toEqual([92004,92001,92002,92003]);
    expect(front.reserveIds).toEqual([92000]);
    w.units=w.units.filter(u=>u.id!==92001);
    const after=projectCombatFronts(w)[0].defenders;
    expect(after.engagedIds).toEqual([92004,92002,92003,92000]);
    expect(after.reserveIds).toEqual([]);
    expect(frontlinePriority({frontlinePriority:0})).toBe(0);
    expect(()=>frontlinePriority({frontlinePriority:10})).toThrow(/priority/);
  });

  it('v19優先度とセーブハッシュを往復・変更検知し旧v18ハッシュ互換を保つ',async()=>{
    expect(SAVE_SCHEMA_VERSION).toBe(20);
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const ids=w.units.filter(u=>u.owner===c).slice(0,2).map(u=>u.id);
    expect(ids).toHaveLength(2);
    expect(applyCommands(w,[{issuer:'player',seq:1,type:'setFrontlinePriority',
      p:{unitIds:ids,priority:8}}])[0].ok).toBe(true);
    const baseline=hashWorld(w);
    const restore=await createTestEngine();
    expect(restore.loadFrom(e.serialize()).ok).toBe(true);
    expect(restore.world.units.filter(u=>ids.includes(u.id)).map(u=>u.frontlinePriority))
      .toEqual([8,8]);
    expect(hashWorld(restore.world)).toBe(baseline);
    for(let day=0;day<7;day++){
      e.stepTick();restore.stepTick();
      expect(hashWorld(restore.world)).toBe(hashWorld(w));
    }
    const modified=restore.world.units.find(u=>u.id===ids[0])!;
    const current=hashWorld(restore.world);
    modified.frontlinePriority=7;
    expect(hashWorld(restore.world)).not.toBe(current);
    modified.frontlinePriority=8;
    const pack=await loadTestPack();
    const save=decode(e.serialize()) as {
      header:SaveHeader;stores:Record<string,unknown>;payloadChecksum:number;
    };
    (save.stores.units as Array<{frontlinePriority?:number}>)[0].frontlinePriority=99;
    save.payloadChecksum=savePayloadChecksum(save.header,save.stores);
    const corrupt=deserializeWorld(encode(save),pack);
    expect(corrupt.world).toBeNull();
    expect(corrupt.violations).toContain('invalid unit frontline priority');

    // A v18-era save never had this field; the integrity hash must remain the
    // historical v18 hash, not the new v19 priority-extended hash.
    const legacy=await createTestEngine();
    const old=decode(legacy.serialize()) as typeof save;
    old.header.v=18;
    old.header.integrity=hashWorld(legacy.world,false,
      true,true,true,true,true,true,true,true,true,true,true,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    const loaded=deserializeWorld(encode(old),pack);
    expect(loaded.violations).toEqual([]);
    expect(loaded.world).not.toBeNull();
    expect(loaded.world?.units.every(u=>u.frontlinePriority===undefined)).toBe(true);
    const again=await createTestEngine();
    expect(again.loadFrom(encode(old)).ok).toBe(true);
    expect(again.world.units.every(u=>u.frontlinePriority===undefined)).toBe(true);
  });
});
