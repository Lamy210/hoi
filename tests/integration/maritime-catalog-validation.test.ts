import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {loadTestPack,nodeFetch} from '../helpers';
import {loadPack,PackValidationError,packFingerprint,type FetchImpl} from '../../src/engine/scenario/loader';
import {validateMaritimeCatalog} from '../../src/engine/naval/maritimeCatalog';
import type {MaritimeCatalog,PackProvince} from '../../src/engine/scenario/types';

async function fakeCatalog(){
  const pack=await loadTestPack();
  const coastal=pack.provinces.filter(p=>p.coastal);
  expect(coastal.length).toBeGreaterThan(1);
  const maritime:MaritimeCatalog={
    seaZones:[
      {id:'zone-a',nameJa:'架空海域A',nameEn:'Fictional A',polygonRef:'a-shape',neighbors:['zone-b']},
      {id:'zone-b',nameJa:'架空海域B',nameEn:'Fictional B',polygonRef:'b-shape',neighbors:['zone-a']},
    ],
    ports:[
      {id:'port-a',provinceId:coastal[0].id,zoneId:'zone-a',capacity:100,repairSlots:1,dockyardSlots:2},
      {id:'port-b',provinceId:coastal[1].id,zoneId:'zone-b',capacity:50,repairSlots:0,dockyardSlots:0},
    ],
    navEdges:[{id:'route-a-b',a:'zone-a',b:'zone-b',cost:12,gateId:'gate-a'}],
    gates:[{id:'gate-a',landProvinceIds:[coastal[0].id],seaEdgeIds:['route-a-b']}],
  };
  return {maritime,provinces:pack.provinces,base:pack};
}
const clone=<T>(v:T):T=>structuredClone(v);

async function syntheticFetch(overrides?:Record<string,string>):Promise<FetchImpl>{
  const {maritime}=await fakeCatalog();
  const original=await nodeFetch('file:///packs/modern-eastasia/manifest.json');
  const manifest={...await original.json() as Record<string,unknown>,maritimeMapVersion:1};
  const files:Record<string,string>={
    'manifest.json':JSON.stringify(manifest),
    'sea-zones.json':JSON.stringify(maritime.seaZones),
    'ports.json':JSON.stringify(maritime.ports),
    'nav-edges.json':JSON.stringify(maritime.navEdges),
    'sea-gates.json':JSON.stringify(maritime.gates),
  };
  Object.assign(files,overrides);
  const sums=await (await nodeFetch('file:///packs/modern-eastasia/checksums.json')).json() as Record<string,string>;
  for(const [file,payload] of Object.entries(files))
    sums[file]=createHash('sha256').update(payload).digest('hex');
  files['checksums.json']=JSON.stringify(sums);
  return async(url)=>{
    const file=url.split('/').pop()!;
    if(!(file in files))return nodeFetch(url);
    const value=files[file];
    return {ok:true,status:200,text:async()=>value,json:async()=>JSON.parse(value)};
  };
}

describe('Phase8A maritime catalog validation',()=>{
  it('preserves legacy pack capability and verifies a wholly fictitious reference graph',async()=>{
    const {maritime,provinces}=await fakeCatalog();
    expect(validateMaritimeCatalog(provinces,maritime)).toEqual([]);
    const current=await loadTestPack();
    const old={...current,manifest:{...current.manifest},maritime:undefined};
    delete old.manifest.maritimeMapVersion;
    expect(old.maritime).toBeUndefined();
    expect(old.manifest.maritimeMapVersion).toBeUndefined();
    const loaded=await loadPack('file:///packs/modern-eastasia/',{
      fetchImpl:await syntheticFetch(),verifyChecksums:true,
    });
    expect(loaded.maritime?.ports).toHaveLength(2);
    expect(loaded.maritime?.seaZones[0].neighbors).toEqual(['zone-b']);
    expect(packFingerprint(loaded)).not.toBe(packFingerprint(old));
  });

  it('rejects impossible land ports, duplicates and negative capacities',async()=>{
    const {maritime,provinces}=await fakeCatalog();
    const nonCoastal=provinces.find(p=>!p.coastal) as PackProvince;
    expect(nonCoastal).toBeTruthy();
    const bad=clone(maritime);
    bad.ports[0].provinceId=nonCoastal.id;
    bad.ports[1].id=bad.ports[0].id;
    bad.ports[1].capacity=-5;
    const err=validateMaritimeCatalog(provinces,bad);
    expect(err.some(x=>x.includes('coastal province'))).toBe(true);
    expect(err.some(x=>x.includes('duplicate or invalid id'))).toBe(true);
    expect(err.some(x=>x.includes('capacity'))).toBe(true);
  });

  it('rejects sea edges with inconsistent reciprocal links, unknown gates and invalid costs',async()=>{
    const {maritime,provinces}=await fakeCatalog();
    const bad=clone(maritime);
    bad.seaZones[1].neighbors=[];
    bad.navEdges[0].cost=0;
    bad.navEdges[0].gateId='missing-gate';
    const err=validateMaritimeCatalog(provinces,bad);
    expect(err.some(x=>x.includes('asymmetric'))).toBe(true);
    expect(err.some(x=>x.includes('reciprocal'))).toBe(true);
    expect(err.some(x=>x.includes('cost'))).toBe(true);
    expect(err.some(x=>x.includes('unknown sea gate'))).toBe(true);
  });

  it('checksum verification rejects altered maritime data before creating a pack',async()=>{
    const fetchImpl=await syntheticFetch();
    const tampered:FetchImpl=async url=>{
      if(url.endsWith('/ports.json')){
        const r=await fetchImpl(url);
        const ports=await r.json() as Array<{capacity:number}>;
        ports[0].capacity=999;
        const text=JSON.stringify(ports);
        return {ok:true,status:200,text:async()=>text,json:async()=>ports};
      }
      return fetchImpl(url);
    };
    await expect(loadPack('file:///packs/modern-eastasia/',{
      fetchImpl:tampered,verifyChecksums:true,
    })).rejects.toBeInstanceOf(PackValidationError);
  });

  it('explicit capability requires all assets; missing port file is not silently ignored',async()=>{
    const source=await syntheticFetch();
    const missing:FetchImpl=async url=>url.endsWith('/ports.json')
      ?{ok:false,status:404,text:async()=>'',json:async()=>null}
      :source(url);
    await expect(loadPack('file:///packs/modern-eastasia/',{
      fetchImpl:missing,verifyChecksums:false,
    })).rejects.toBeInstanceOf(PackValidationError);
  });
});
