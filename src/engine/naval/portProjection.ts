// Phase8A map projection: static catalog -> readonly screen metadata.
// Port icons are anchored to provinces; this grants no embarkation or supply.
import type {Pack} from '../scenario/types';

export interface UiPort {
  id:string;
  province:number;
  provinceId:string;
  zoneId:string;
  capacity:number;
  repairSlots:number;
  dockyardSlots:number;
}
export interface UiSeaZone {
  id:string;
  nameJa:string;
  nameEn:string;
  neighbors:string[];
}
export interface UiMaritimeCatalog {
  ports:UiPort[];
  seaZones:UiSeaZone[];
  routes:{id:string;a:string;b:string;cost:number;gateId?:string}[];
}

const compareId=(a:string,b:string):number=>a<b?-1:a>b?1:0;

export function projectMaritimeCatalog(pack:Pack):UiMaritimeCatalog|undefined {
  const maritime=pack.maritime;
  if(!maritime)return undefined;
  const provIds=new Map(pack.provinces.map((p,i)=>[p.id,i]));
  const ports=maritime.ports.map(p=>{
    const province=provIds.get(p.provinceId);
    if(province===undefined)throw new Error('unresolved maritime port province: '+p.id);
    return {id:p.id,province,provinceId:p.provinceId,
      zoneId:p.zoneId,capacity:p.capacity,
      repairSlots:p.repairSlots,dockyardSlots:p.dockyardSlots};
  }).sort((a,b)=>a.province-b.province||compareId(a.id,b.id));
  return {
    ports,
    seaZones:maritime.seaZones.map(z=>({
      id:z.id,nameJa:z.nameJa,nameEn:z.nameEn,
      neighbors:z.neighbors.slice().sort(),
    })).sort((a,b)=>compareId(a.id,b.id)),
    routes:maritime.navEdges.map(e=>({
      id:e.id,a:e.a,b:e.b,cost:e.cost,
      ...(e.gateId?{gateId:e.gateId}:{}),
    })).sort((a,b)=>compareId(a.id,b.id)),
  };
}
