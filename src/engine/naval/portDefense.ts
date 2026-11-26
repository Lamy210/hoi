// Static scenario infrastructure index. It is derived from the verified pack,
// not saved into WorldState or recomputed from coastal geography.
import type {Pack} from '../scenario/types';
import {projectMaritimeCatalog} from './portProjection';

/** Maximum catalogued port capacity in each province, or zero without a port. */
export function portCapacitiesFromPack(pack:Pack):number[]{
  const capacities=new Array<number>(pack.provinces.length).fill(0);
  for(const port of projectMaritimeCatalog(pack)?.ports??[]){
    capacities[port.province]=Math.max(capacities[port.province],port.capacity);
  }
  return capacities;
}
