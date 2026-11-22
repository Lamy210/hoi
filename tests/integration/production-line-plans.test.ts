import {describe,expect,it} from 'vitest';
import {decode,encode} from '@msgpack/msgpack';
import {createTestEngine,loadTestPack} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {hashWorld} from '../../src/engine/core/hash';
import {savePayloadChecksum,deserializeWorld} from '../../src/engine/save/serialize';
import {legacyProductionLineState} from '../../src/engine/systems/productionLineState';

const run=(w:Awaited<ReturnType<typeof createTestEngine>>['world'],type:string,p:Record<string,unknown>,seq:number,issuer='player')=>
  applyCommands(w,[{type,p,issuer,seq}])[0];

describe('persisted v14 production-line planning',()=>{
  it('migrates old share to two stable factory requests without changing actual production',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const f=w.countries.milFactories[c];
    const lines=w.productionLines.filter(l=>l.country===c);
    expect(lines.map(l=>l.requestedFactories)).toEqual([f-Math.floor(f*.2),Math.floor(f*.2)]);
    expect(lines.map(l=>l.modelId)).toEqual(['infantry-rifle-1990','artillery-towed-2000']);
    const oldStock=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const result=run(w,'createProductionLine',{modelId:'infantry-rifle-1990',factories:5,priority:9},1);
    expect(result.ok).toBe(true);
    expect([w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(oldStock);
    const snapshot=JSON.stringify(w.productionLines);
    const hash=hashWorld(w),bytes=e.serialize();
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(JSON.stringify(e.world.productionLines)).toBe(snapshot);
    expect(hashWorld(e.world)).toBe(hash);
  });
  it('rejects technology-locked designs and other-country lines, allows researched models',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const outsider=w.productionLines.find(l=>l.country!==c)!;
    const before=JSON.stringify(w.productionLines);
    expect(run(w,'createProductionLine',{modelId:'infantry-rifle-2035',factories:2,priority:5},1).reason).toBe('techLocked');
    expect(run(w,'switchProductionModel',{lineId:outsider.id,modelId:'infantry-rifle-1990'},2).reason).toBe('notYourLine');
    expect(run(w,'updateProductionLine',{lineId:outsider.id,factories:9,priority:5,active:true},3).reason).toBe('notYourLine');
    expect(JSON.stringify(w.productionLines)).toBe(before);
    w.research[c].done.push('small-arms-next');
    expect(run(w,'createProductionLine',{modelId:'infantry-rifle-2035',factories:3,priority:9},4).ok).toBe(true);
    const created=w.productionLines.at(-1)!;
    expect(created.efficiency).toBe(.1);
    const line=w.productionLines.find(l=>l.country===c)!;
    expect(run(w,'switchProductionModel',{lineId:line.id,modelId:'infantry-rifle-2035'},5).ok).toBe(true);
    expect(line.efficiency).toBe(.4);
    expect(run(w,'switchProductionModel',{lineId:line.id,modelId:'infantry-rifle-2035'},6).ok).toBe(true);
    expect(line.efficiency).toBe(.4);
  });
  it('changes requests atomically, detects invalid payloads, never consumes stock',async()=>{
    const e=await createTestEngine(),w=e.world,c=w.playerCountry;
    const line=w.productionLines.find(l=>l.country===c)!;
    const stocks=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const before=JSON.stringify(line);
    expect(run(w,'updateProductionLine',{lineId:line.id,factories:-1,priority:9,active:true},1).reason).toBe('badParams');
    expect(run(w,'updateProductionLine',{lineId:line.id,factories:4,priority:10,active:true},2).reason).toBe('badParams');
    expect(JSON.stringify(line)).toBe(before);
    expect(run(w,'updateProductionLine',{lineId:line.id,factories:4,priority:9,active:false},3).ok).toBe(true);
    expect(line.requestedFactories).toBe(4);
    expect(line.priority).toBe(9);
    expect(line.active).toBe(false);
    expect([w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(stocks);
    expect(run(w,'deleteProductionLine',{lineId:line.id},4).ok).toBe(true);
    expect(w.productionLines.some(l=>l.id===line.id)).toBe(false);
  });
  it('rejects v14 tampering and keeps historical v13 integrity/migration',async()=>{
    const e=await createTestEngine(),pack=await loadTestPack();
    const data=decode(e.serialize()) as any;
    const copy=()=>decode(e.serialize()) as any;
    const tampered=copy();
    tampered.stores.productionLines[0].modelId='invalid-item';
    tampered.payloadChecksum=savePayloadChecksum(tampered.header,tampered.stores);
    expect(deserializeWorld(encode(tampered),pack).violations.length).toBeGreaterThan(0);
    // The pre-v14 payload hash excludes plans; restored state is migrated deterministically.
    const old=copy();old.header.v=13;
    delete old.stores.productionLines;delete old.stores.counters.nextProductionLineId;delete old.stores.productionMode;delete old.stores.modelProduction; delete old.stores.modelStock; delete old.stores.issuedEquipment;
    const oldWorld=e.world;
    // Historical integrity hash uses the exact v13 gated fields.
    old.header.integrity=hashWorld(oldWorld,false,true,true,true,true,true,true,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    const migrated=deserializeWorld(encode(old),pack);
    expect(migrated.violations).toEqual([]);
    expect(migrated.world?.productionLines).toEqual(legacyProductionLineState(
      oldWorld.countries.milFactories,oldWorld.productionShare,pack.equipmentModels??[]).productionLines);
    expect(data.header.v).toBe(17);
  });
});
