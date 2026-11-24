import {describe,expect,it} from 'vitest';
import {loadTestPack} from '../helpers';
import {validateMaritimeCatalog} from '../../src/engine/naval/maritimeCatalog';
import {createEngine} from '../../src/engine/engine';
import {hashWorld} from '../../src/engine/core/hash';

describe('East Asia Phase8A maritime starter catalog',()=>{
  it('loads seven curated coastal ports and four abstract zones through verified checksums',async()=>{
    const pack=await loadTestPack(true);
    expect(pack.manifest.maritimeMapVersion).toBe(1);
    expect(pack.manifest.version).toBe('0.2.0');
    expect(pack.maritime).toBeDefined();
    expect(pack.maritime!.ports).toHaveLength(7);
    expect(pack.maritime!.seaZones).toHaveLength(4);
    expect(pack.maritime!.navEdges).toHaveLength(5);
    expect(pack.maritime!.gates).toHaveLength(0);
    expect(validateMaritimeCatalog(pack.provinces,pack.maritime)).toEqual([]);
    const selected=new Map(pack.maritime!.ports.map(p=>[p.id,p]));
    expect(selected.get('port-tokyo')?.provinceId).toBe('JP-13');
    expect(selected.get('port-yokohama')?.provinceId).toBe('JP-14');
    expect(selected.get('port-osaka')?.provinceId).toBe('JP-27');
    expect(selected.get('port-hakata')?.provinceId).toBe('JP-40');
    expect(selected.get('port-busan')?.provinceId).toBe('KR-26');
    expect(selected.get('port-incheon')?.provinceId).toBe('KR-28');
    expect(selected.get('port-shanghai')?.provinceId).toBe('CN-SH');
    for(const port of pack.maritime!.ports){
      const prov=pack.provinces.find(p=>p.id===port.provinceId);
      expect(prov?.coastal,port.id).toBe(true);
      // Capacities are dimensionless game-balance weights, NOT throughput.
      expect(port.capacity).toBeGreaterThan(0);
    }
  });

  it('all four abstract sea zones are connected through five explicit routes',async()=>{
    const pack=await loadTestPack(true),sea=pack.maritime!;
    const seen=new Set<string>(),todo=[sea.seaZones[0].id];
    while(todo.length){
      const id=todo.shift()!;
      if(seen.has(id))continue;
      seen.add(id);
      for(const e of sea.navEdges){
        if(e.a===id&&!seen.has(e.b))todo.push(e.b);
        if(e.b===id&&!seen.has(e.a))todo.push(e.a);
      }
    }
    expect(seen.size).toBe(sea.seaZones.length);
  });

  it('displays the port catalog but does not change movement, supply or deterministic combat state',async()=>{
    const pack=await loadTestPack(true);
    const game=createEngine(pack,{seed:61005,playerCountryId:'KOR',difficulty:1});
    const before=hashWorld(game.world);
    const meta=game.getUiMeta();
    expect(meta.maritime?.ports).toHaveLength(7);
    expect(meta.maritime?.ports.find(p=>p.id==='port-busan')?.provinceId).toBe('KR-26');
    expect(hashWorld(game.world)).toBe(before);
    const restored=createEngine(pack,{seed:61005,playerCountryId:'KOR',difficulty:1});
    expect(restored.loadFrom(game.serialize()).ok).toBe(true);
    for(let day=0;day<14;day++){
      game.stepTick();
      restored.stepTick();
      expect(hashWorld(game.world)).toBe(hashWorld(restored.world));
    }
  });
});
