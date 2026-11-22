import { describe, expect, it } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { hashWorld } from '../../src/engine/core/hash';
import { savePayloadChecksum } from '../../src/engine/save/serialize';
import { validateCustomTemplates, latestTemplates } from '../../src/engine/military/customTemplates';

const infantry = () => ({battalionIds:Array(10).fill('infantry-v1'),supportIds:[] as string[]});
async function setup() {
  const e=await createTestEngine(),w=e.world,c=w.playerCountry;
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>,issuer='player')=>
    applyCommands(w,[{issuer,seq:++seq,type,p}])[0];
  return {e,w,c,issue};
}

describe('custom division templates v10',()=>{
  it('creates a country-scoped template, revises immutably and rejects stale revision',async()=>{
    const {e,w,c,issue}=await setup();
    const before=hashWorld(w),oldUnits=w.units.length,oldStock=w.countries.manpowerPool[c];
    expect(issue('createTemplate',{name:'第1歩兵師団',...infantry()}).ok).toBe(true);
    const created=latestTemplates(w,c)[0];
    expect(created).toMatchObject({templateId:1,revision:1,name:'第1歩兵師団'});
    expect(issue('reviseTemplate',{templateId:1,expectedRevision:1,name:'第1歩兵・工兵',...infantry(),supportIds:['engineer-v1']}).ok).toBe(true);
    expect(w.customTemplates.map(t=>t.revision)).toEqual([1,2]);
    expect(w.customTemplates[0].supportIds).toEqual([]);
    expect(w.customTemplates[1].supportIds).toEqual(['engineer-v1']);
    expect(issue('reviseTemplate',{templateId:1,expectedRevision:1,name:'旧版',...infantry()}).reason).toBe('staleRevision');
    expect(w.units).toHaveLength(oldUnits);
    expect(w.countries.manpowerPool[c]).toBe(oldStock);
    expect(hashWorld(w)).not.toBe(before);
    expect(validateCustomTemplates(w)).toEqual([]);
    expect(e.getUiSnapshot(0).customTemplates).toHaveLength(2);
  });

  it('rejects invalid components, duplicate supports, names and foreign ownership',async()=>{
    const {w,c,issue}=await setup();
    const before=w.customTemplates.length;
    for(const p of [
      {name:'',...infantry()},
      {name:' x ',...infantry()},
      {name:'x',battalionIds:[],supportIds:[]},
      {name:'x',battalionIds:['unknown'],supportIds:[]},
      {name:'x',...infantry(),supportIds:['engineer-v1','engineer-v1']},
    ])expect(issue('createTemplate',p).ok).toBe(false);
    expect(w.customTemplates).toHaveLength(before);
    expect(issue('createTemplate',{name:'正規',...infantry()}).ok).toBe(true);
    const foreign=w.countries.alive.findIndex((alive,i)=>alive&&i!==c);
    const cIssuer='ai:'+foreign;
    expect(issue('reviseTemplate',{templateId:1,expectedRevision:1,name:'改竄',...infantry()},cIssuer).reason).toBe('notYourTemplate');
    expect(issue('deleteTemplate',{templateId:1,expectedRevision:1},cIssuer).reason).toBe('notYourTemplate');
    expect(latestTemplates(w,c)[0].name).toBe('正規');
  });

  it('deletes unused template without recycling its ID',async()=>{
    const {w,c,issue}=await setup();
    expect(issue('createTemplate',{name:'A',...infantry()}).ok).toBe(true);
    expect(issue('reviseTemplate',{templateId:1,expectedRevision:1,name:'B',...infantry()}).ok).toBe(true);
    expect(issue('deleteTemplate',{templateId:1,expectedRevision:1}).reason).toBe('staleRevision');
    expect(issue('deleteTemplate',{templateId:1,expectedRevision:2}).ok).toBe(true);
    expect(w.customTemplates).toHaveLength(0);
    expect(issue('createTemplate',{name:'C',...infantry()}).ok).toBe(true);
    expect(latestTemplates(w,c)[0].templateId).toBe(2);
    expect(w.nextCustomTemplateId).toBe(3);
  });

  it('persists multiple revisions in v10 and refuses structurally invalid saves',async()=>{
    const {e,w,c,issue}=await setup();
    issue('createTemplate',{name:'A',...infantry()});
    issue('reviseTemplate',{templateId:1,expectedRevision:1,name:'B',...infantry(),supportIds:['engineer-v1']});
    const bytes=e.serialize(),original=hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(original);
    expect(latestTemplates(e.world,c)[0]).toMatchObject({name:'B',revision:2});
    for(const corrupt of [
      (s:any)=>{s.customTemplates[1].revision=1;},
      (s:any)=>{s.customTemplates[1].battalionIds=['not-found'];},
      (s:any)=>{s.customTemplates[0].country=9999;},
      (s:any)=>{s.counters.nextCustomTemplateId=1;},
    ]) {
      const invalid=decode(bytes) as any;
      corrupt(invalid.stores);
      invalid.payloadChecksum=savePayloadChecksum(invalid.header,invalid.stores);
      expect(e.loadFrom(encode(invalid)).ok).toBe(false);
      expect(hashWorld(e.world)).toBe(original);
    }
  });

  it('validates a v9-shaped save with its original hash and initializes templates empty',async()=>{
    const {e,w}=await setup();
    const old=decode(e.serialize()) as any;
    delete old.stores.customTemplates;
    delete old.stores.counters.nextCustomTemplateId;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode;
    old.header.v=9;
    old.header.integrity=hashWorld(w,false,true,true,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.customTemplates).toEqual([]);
    expect(e.world.nextCustomTemplateId).toBe(1);
    expect(validateCustomTemplates(e.world)).toEqual([]);
  });

  it('does not create or train units until a separate recruitment command is implemented',async()=>{
    const {w,c,issue}=await setup();
    const units=w.units.length,queue=w.trainingQueue.length;
    const before=[w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    expect(issue('createTemplate',{name:'No instant spawn',...infantry()}).ok).toBe(true);
    expect(w.units.length).toBe(units);
    expect(w.trainingQueue.length).toBe(queue);
    expect([w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(before);
  });
});
