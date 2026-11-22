import { describe, it, expect } from 'vitest';
import { loadTestPack, createTestEngine } from '../helpers';
import { availableEquipmentModels } from '../../src/engine/military/equipmentCatalog';

describe('versioned equipment design catalogue',()=>{
  it('loads model catalog with SHA-256 pack verification and known research dependencies',async()=>{
    const pack=await loadTestPack(true),models=pack.equipmentModels??[];
    expect(models.length).toBeGreaterThanOrEqual(10);
    const ids=new Set(pack.techs.map(t=>t.id));
    expect(models.every(m=>!m.unlockTechId||ids.has(m.unlockTechId))).toBe(true);
  });
  it('new rifles only become design-unlocked after their technology has been researched',async()=>{
    const pack=await loadTestPack();
    const models=pack.equipmentModels??[];
    const start=availableEquipmentModels(models,[]);
    expect(start.some(m=>m.id==='infantry-rifle-1990')).toBe(true);
    expect(start.some(m=>m.id==='infantry-rifle-2035')).toBe(false);
    const later=availableEquipmentModels(models,['small-arms-next']);
    expect(later.some(m=>m.id==='infantry-rifle-2035')).toBe(true);
  });
  it('catalogue registration has no side-effects on existing production stocks or old save schema',async()=>{
    const e=await createTestEngine();
    const w=e.world,c=w.playerCountry;
    const original=[w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const modelCount=e.getUiSnapshot(0).equipmentModels.length;
    expect(modelCount).toBeGreaterThanOrEqual(10);
    expect([w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(original);
    const loaded=e.loadFrom(e.serialize());
    expect(loaded.ok).toBe(true);
    expect(e.getUiSnapshot(0).equipmentModels.length).toBe(modelCount);
  });
});
