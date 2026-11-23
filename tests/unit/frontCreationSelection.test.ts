import {describe,it,expect} from 'vitest';
import {frontCreationCandidates} from '../../src/ui/frontCreationSelection';
import type {UiSnapshot,UiUnit} from '../../src/engine/ui';

const make=(id:number,owner:number,armyId:number|null,frontId=-1,manualHold=false)=>
  ({id,owner,armyId,frontId,manualHold} as UiUnit);
const fixture={
  playerCountry:0,
  armies:[{id:10,owner:0,groupId:100},{id:11,owner:0,groupId:100},{id:20,owner:1,groupId:200}] as UiSnapshot['armies'],
  armyGroups:[{id:100,owner:0},{id:200,owner:1}] as UiSnapshot['armyGroups'],
  units:[make(1,0,10),make(2,0,10,7),make(3,0,11,-1,true),make(4,0,null),make(5,1,20),make(6,0,20)] as UiUnit[],
};
describe('front creation unit selection',()=>{
  it('軍団・軍集団から自軍師団のみ抽出し既存戦線所属は除外する',()=>{
    expect(frontCreationCandidates(fixture,'army:10',[])).toEqual({ids:[1],alreadyAssigned:1,manualHold:0});
    expect(frontCreationCandidates(fixture,'group:100',[])).toEqual({ids:[1,3],alreadyAssigned:1,manualHold:1});
    expect(frontCreationCandidates(fixture,'army:20',[]).ids).toEqual([]);
    expect(frontCreationCandidates(fixture,'group:200',[]).ids).toEqual([]);
  });
  it('既存戦線を奪わず、選択済み・軍未所属・noneでも安全に対象を抽出する',()=>{
    expect(frontCreationCandidates(fixture,'selected',[4,1,2,5,1])).toEqual({ids:[1,4],alreadyAssigned:1,manualHold:0});
    expect(frontCreationCandidates(fixture,'unassigned',[]).ids).toEqual([4]);
    expect(frontCreationCandidates(fixture,'none',[1,4]).ids).toEqual([]);
    expect(frontCreationCandidates(fixture,'army:garbage',[1]).ids).toEqual([]);
  });
});
