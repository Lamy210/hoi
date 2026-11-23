import {describe,it,expect} from 'vitest';
import {canCommitFrontEdit,frontProvinceChangeSummary,nearestProjectedProvince} from '../../src/ui/frontMapPlanning';

describe('地図戦線の差分・世代検証',()=>{
  const owner=0,enemy=1,controller=[0,0,0,1,1];
  it('同じ集合は順不同でも未変更、追加・削除件数を表示',()=>{
    expect(frontProvinceChangeSummary([0,1],[1,0])).toEqual({added:0,removed:0,changed:false});
    expect(frontProvinceChangeSummary([0,1],[1,2])).toEqual({added:1,removed:1,changed:true});
    expect(frontProvinceChangeSummary([0,1],[0,1,2])).toEqual({added:1,removed:0,changed:true});
  });
  it('変更なし・空集合・旧世代・敵州混入・保留命令は保存不可',()=>{
    const valid=(before:number[],after:number[],expected=2,current:number|undefined=2,busy=false)=>
      canCommitFrontEdit(before,after,expected,current,enemy,owner,controller,[enemy],busy);
    expect(valid([0],[0,1])).toBe(true);
    expect(valid([0],[0])).toBe(false);
    expect(valid([0],[])).toBe(false);
    expect(valid([0],[1],2,3)).toBe(false);
    expect(valid([0],[1],0,0)).toBe(false);
    expect(valid([0],[0,3])).toBe(false);
    expect(valid([0],[1,1])).toBe(false);
    expect(valid([0],[1],2,2,true)).toBe(false);
    expect(canCommitFrontEdit([0],[0,1],2,2,enemy,owner,controller,[],false)).toBe(false);
  });
  it('投影マーカーの近くではポリゴン境界より当該自軍州を優先し、他国や不正投影を無視する',()=>{
    const controlled=[0,0,1,0,1];
    const point=(p:number)=>p===3?{x:NaN,y:0}:{x:p*40,y:20};
    expect(nearestProjectedProvince(controlled,0,point,{x:40,y:20},18)).toBe(1);
    expect(nearestProjectedProvince(controlled,0,point,{x:80,y:20},18)).toBeNull();
    expect(nearestProjectedProvince(controlled,0,point,{x:40,y:20},-1)).toBeNull();
    expect(nearestProjectedProvince(controlled,0,point,{x:NaN,y:20})).toBeNull();
    expect(nearestProjectedProvince([0,0],0,()=>({x:10,y:10}),{x:10,y:10})).toBe(0);
  });

});
