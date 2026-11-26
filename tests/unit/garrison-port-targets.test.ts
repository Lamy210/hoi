import {describe,expect,it} from 'vitest';
import {appendGarrisonPortTargets,controlledPortTargets} from '../../src/ui/garrisonPortTargets';

describe('catalog-based garrison port target selection',()=>{
  it('includes only catalogued ports currently controlled by the chosen country',()=>{
    const controllers=[1,2,2,2,2,1];
    const ports=[4,1,4,2,-1,999,Number.NaN];
    expect(controlledPortTargets(ports,controllers,2)).toEqual([1,2,4]);
    // Province 3 is coastal/controlled but not in the actual port catalog.
    expect(controlledPortTargets(ports,controllers,2)).not.toContain(3);
    expect(controlledPortTargets(ports,controllers,1)).toEqual([]);
    expect(controlledPortTargets(undefined,controllers,2)).toEqual([]);
    expect(controlledPortTargets(ports,controllers,-1)).toEqual([]);
    const occupied=[...controllers];
    occupied[4]=1;
    expect(controlledPortTargets(ports,occupied,2)).toEqual([1,2]);
    expect(controllers[4]).toBe(2);
  });

  it('merges targets without duplication, preserves manual targets and orders deterministically',()=>{
    expect(appendGarrisonPortTargets([9,2,9],[7,2,5])).toEqual([2,5,7,9]);
    expect(appendGarrisonPortTargets([9,2],[5,7,2])).toEqual([2,5,7,9]);
    expect(appendGarrisonPortTargets([],[2,1])).toEqual([1,2]);
    expect(appendGarrisonPortTargets([4],[])).toEqual([4]);
  });

  it('rejects the whole draft at the 64-target boundary without silent truncation',()=>{
    const atLimit=Array.from({length:64},(_,i)=>i);
    expect(appendGarrisonPortTargets(atLimit,[63])).toEqual(atLimit);
    expect(appendGarrisonPortTargets(atLimit,[64])).toBeNull();
    expect(appendGarrisonPortTargets([],Array.from({length:65},(_,i)=>i))).toBeNull();
    expect(appendGarrisonPortTargets([1],[2],1)).toBeNull();
    expect(appendGarrisonPortTargets([1],[Number.NaN])).toBeNull();
  });
});
