import { describe, expect, it } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { hashWorld } from '../../src/engine/core/hash';
import { savePayloadChecksum } from '../../src/engine/save/serialize';
import { tickTraining } from '../../src/engine/systems/training';
import { customTemplateStats } from '../../src/engine/military/customTemplates';

async function setup() {
  const e=await createTestEngine(),w=e.world,c=w.playerCountry,province=w.countries.capital[c];
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>,issuer='player')=>
    applyCommands(w,[{issuer,seq:++seq,type,p}])[0];
  const composition={battalionIds:Array(6).fill('infantry-v1').concat(Array(2).fill('artillery-heavy-v1')),
    supportIds:['engineer-v1']};
  expect(issue('createTemplate',{name:'独自編成',...composition}).ok).toBe(true);
  const t=w.customTemplates[0];
  return {e,w,c,province,issue,t,composition};
}
const resources=(w:Awaited<ReturnType<typeof setup>>['w'],c:number)=>[
  w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]
];

describe('v11 custom division training',()=>{
  it('reserves calculated equipment and manpower, deploys only after training, preserving revision',async()=>{
    const {e,w,c,province,issue,t}=await setup();
    const stats=customTemplateStats(t),before=resources(w,c),units=w.units.length;
    expect(stats).toMatchObject({manpower:8200,infantry:820,artillery:200,days:44});
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province}).ok).toBe(true);
    const order=w.trainingQueue[0];
    expect(order).toMatchObject({country:c,customTemplateId:t.templateId,customRevision:1,readyTick:w.tick+44});
    expect(resources(w,c)).toEqual([before[0]-8200,before[1]-820,before[2]-200]);
    expect(w.units).toHaveLength(units);
    const hash=hashWorld(w),bytes=e.serialize();
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(e.world)).toBe(hash);
    w.tick=order.readyTick-1; tickTraining(w);
    expect(w.units).toHaveLength(units);
    w.tick++;tickTraining(w);
    const u=w.units.find(x=>x.id===order.id)!;
    expect(u).toMatchObject({loc:province,owner:c,customTemplateId:t.templateId,customRevision:1,
      maxManpower:8200,maxInfEquipment:820,maxArtEquipment:200});
    expect(w.trainingQueue).toHaveLength(0);
    expect(w.units).toHaveLength(units+1);
  });

  it('cancellation refunds exactly once and prevents deleting referenced templates',async()=>{
    const {w,c,province,issue,t}=await setup();
    const before=resources(w,c);
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province}).ok).toBe(true);
    const order=w.trainingQueue[0];
    expect(issue('deleteTemplate',{templateId:t.templateId,expectedRevision:1}).reason).toBe('templateInUse');
    expect(issue('cancelTraining',{id:order.id}).ok).toBe(true);
    expect(issue('cancelTraining',{id:order.id}).ok).toBe(false);
    expect(resources(w,c)).toEqual(before);
    expect(issue('deleteTemplate',{templateId:t.templateId,expectedRevision:1}).ok).toBe(true);
  });

  it('revision remains frozen when template is revised while unit trains',async()=>{
    const {w,c,province,issue,t,composition}=await setup();
    const before=resources(w,c);
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province}).ok).toBe(true);
    const old=w.trainingQueue[0],tOld=customTemplateStats(t);
    expect(issue('reviseTemplate',{templateId:t.templateId,expectedRevision:1,name:'改訂版',
      battalionIds:composition.battalionIds.concat('infantry-v1'),supportIds:composition.supportIds}).ok).toBe(true);
    expect(customTemplateStats(w.customTemplates[1]).manpower).toBeGreaterThan(tOld.manpower);
    expect(old.customRevision).toBe(1);
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province}).ok).toBe(true);
    expect(w.trainingQueue[1].customRevision).toBe(1);
    expect(resources(w,c)).toEqual([before[0]-2*tOld.manpower,before[1]-2*tOld.infantry,before[2]-2*tOld.artillery]);
  });

  it('rejects foreign, insufficient-stock, foreign province and invalid revision atomically',async()=>{
    const {w,c,province,issue,t}=await setup();
    const foreign=w.countries.alive.findIndex((alive,i)=>alive&&i!==c);
    const foreignProv=w.prov.controller.findIndex(owner=>owner!==c);
    const baseline=resources(w,c),n=w.trainingQueue.length;
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:99,province}).reason).toBe('notYourTemplate');
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province:foreignProv}).reason).toBe('notControlledByYou');
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province},'ai:'+foreign).reason).toBe('notYourTemplate');
    w.countries.artEquipmentStock[c]=0;
    expect(issue('startCustomTraining',{templateId:t.templateId,revision:1,province}).reason).toBe('insufficientArtillery');
    w.countries.artEquipmentStock[c]=baseline[2];
    expect(resources(w,c)).toEqual(baseline);
    expect(w.trainingQueue).toHaveLength(n);
  });

  it('rejects references to missing revisions in checked v11 save and retains existing state',async()=>{
    const {e,w,province,issue,t}=await setup();
    issue('startCustomTraining',{templateId:t.templateId,revision:1,province});
    const bytes=e.serialize(),before=hashWorld(w);
    const bad=decode(bytes) as any;
    bad.stores.trainingQueue[0].customRevision=999;
    bad.payloadChecksum=savePayloadChecksum(bad.header,bad.stores);
    expect(e.loadFrom(encode(bad)).violations).toContain('invalid training order');
    expect(hashWorld(e.world)).toBe(before);
    const missing=decode(bytes) as any;
    missing.stores.customTemplates=[];
    missing.payloadChecksum=savePayloadChecksum(missing.header,missing.stores);
    expect(e.loadFrom(encode(missing)).ok).toBe(false);
  });

  it('loads a v10-shaped save with no custom unit or order references',async()=>{
    const {e,w}=await setup();
    const old=decode(e.serialize()) as any;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode; delete old.stores.modelProduction; delete old.stores.modelStock; delete old.stores.issuedEquipment;
    old.header.v=10;
    // Undo the v21 fields before emulating an actual historical save.
    delete old.stores.garrisons; delete old.stores.counters.nextGarrisonId;
    old.header.integrity=hashWorld(w,false,true,true,true,true,false);
    old.payloadChecksum=savePayloadChecksum(old.header,old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.customTemplates).toHaveLength(1);
    expect(e.world.trainingQueue).toHaveLength(0);
  });
});
