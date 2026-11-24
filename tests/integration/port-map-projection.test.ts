import {describe,expect,it} from 'vitest';
import {loadTestPack} from '../helpers';
import {createEngine} from '../../src/engine/engine';
import {hashWorld} from '../../src/engine/core/hash';
import {packFingerprint} from '../../src/engine/scenario/loader';
import {projectMaritimeCatalog} from '../../src/engine/naval/portProjection';
import type {Pack,MaritimeCatalog} from '../../src/engine/scenario/types';

async function fixture(){
  const base=await loadTestPack();
  const coastal=base.provinces.filter(p=>p.coastal);
  const catalog:MaritimeCatalog={
    seaZones:[{id:'sea-b',nameJa:'架空B',nameEn:'Fictional B',polygonRef:'shape-b',neighbors:['sea-a']},
      {id:'sea-a',nameJa:'架空A',nameEn:'Fictional A',polygonRef:'shape-a',neighbors:['sea-b']}],
    ports:[
      {id:'port-two',provinceId:coastal[1].id,zoneId:'sea-b',capacity:50,repairSlots:2,dockyardSlots:0},
      {id:'port-one',provinceId:coastal[0].id,zoneId:'sea-a',capacity:20,repairSlots:0,dockyardSlots:1},
    ],
    navEdges:[{id:'route-b',a:'sea-b',b:'sea-a',cost:2}],
    gates:[],
  };
  const pack:Pack={...base,manifest:{...base.manifest,maritimeMapVersion:1},maritime:catalog};
  return {pack,base,coastal};
}
describe('maritime map UI projection',()=>{
  it('never invents ports on a legacy coastal-only pack',async()=>{
    const pack=await loadTestPack();
    const projection=projectMaritimeCatalog(pack);
    expect(projection).toBeUndefined();
    const game=createEngine(pack,{seed:2026,playerCountryId:'KOR',difficulty:1});
    expect(game.getUiMeta().maritime).toBeUndefined();
  });

  it('projects stable port provinces and sea-zone labels without world mutation',async()=>{
    const {pack,base,coastal}=await fixture();
    const game=createEngine(pack,{seed:2026,playerCountryId:'KOR',difficulty:1});
    const before=hashWorld(game.world);
    const meta=game.getUiMeta();
    expect(meta.maritime?.ports).toHaveLength(2);
    for(const port of meta.maritime!.ports){
      expect(meta.provIds[port.province]).toBe(port.provinceId);
      expect([coastal[0].id,coastal[1].id]).toContain(port.provinceId);
    }
    expect(meta.maritime?.seaZones.map(z=>z.id)).toEqual(['sea-a','sea-b']);
    expect(meta.maritime?.routes).toEqual([{id:'route-b',a:'sea-b',b:'sea-a',cost:2}]);
    expect(meta.maritime?.ports.map(p=>p.capacity).sort((a,b)=>a-b)).toEqual([20,50]);
    expect(hashWorld(game.world)).toBe(before);
    expect(packFingerprint(pack)).not.toBe(packFingerprint(base));
    const current=game.getUiSnapshot(0);
    expect(current.controller).toEqual(game.world.prov.controller);
    // The controller is not cached in static port metadata.
    const port=meta.maritime!.ports[0];
    const enemy=(current.playerCountry+1)%current.countries.length;
    game.world.prov.controller[port.province]=enemy;
    expect(game.getUiSnapshot(0).controller[port.province]).toBe(enemy);
    expect(game.getUiMeta().maritime?.ports[0]).toEqual(port);
  });

  it('rejects unresolved province references instead of silently linking a different coast',async()=>{
    const {pack}=await fixture();
    pack.maritime!.ports[0].provinceId='nonexistent-province';
    expect(()=>projectMaritimeCatalog(pack)).toThrow(/unresolved maritime port province/);
  });
});
