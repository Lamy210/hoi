import {describe,it,expect} from 'vitest';
import {provincesInRectangle,updateFrontDraftProvinces,canCommitFrontDraft} from '../../src/ui/frontMapPlanning';

describe('地図上の戦線計画',()=>{
  const controlled=[0,0,1,0,1,0];
  const project=(p:number)=>p===5?null:{x:p*10,y:p*20};
  it('DPRに依存しないCSS座標で逆方向も同じ自軍州を指定し敵国を除外する',()=>{
    const forward=provincesInRectangle(controlled,0,project,{x1:5,y1:10,x2:48,y2:90});
    const reversed=provincesInRectangle(controlled,0,project,{x1:48,y1:90,x2:5,y2:10});
    expect(forward).toEqual([1,3]);
    expect(reversed).toEqual(forward);
    expect(provincesInRectangle(controlled,0,()=>({x:NaN,y:0}),{x1:0,y1:0,x2:100,y2:100})).toEqual([]);
  });
  it('追加・除外・トグルでも所有者を検証しソートして上限を守る',()=>{
    const current=[3,0];
    expect(updateFrontDraftProvinces(current,[1,2,4],controlled,0,'add')).toEqual([0,1,3]);
    expect(updateFrontDraftProvinces(current,[0,1],controlled,0,'toggle')).toEqual([1,3]);
    expect(updateFrontDraftProvinces(current,[3,4],controlled,0,'remove')).toEqual([0]);
    expect(updateFrontDraftProvinces(current,[1,2],controlled,0,'replace')).toEqual([1]);
    expect(updateFrontDraftProvinces(current,[1],controlled,0,'add',2)).toBeNull();
    expect(current).toEqual([3,0]);
  });
  it('命令発行時に外交状態・州支配・重複・保留命令を再確認する',()=>{
    const allowed=(provs:number[],enemy:number,busy=false,controller=controlled)=>
      canCommitFrontDraft(provs,enemy,0,controller,[1],busy);
    expect(allowed([0,1],1)).toBe(true);
    expect(allowed([],1)).toBe(false);
    expect(allowed([0,0],1)).toBe(false);
    expect(allowed([2],1)).toBe(false);
    expect(allowed([0],0)).toBe(false);
    expect(allowed([0],1,true)).toBe(false);
    expect(allowed([0],1,false,[1,0,1])).toBe(false);
    expect(allowed([999],1)).toBe(false);
  });
});
