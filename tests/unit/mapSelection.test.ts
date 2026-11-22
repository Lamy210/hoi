import {describe,expect,it} from 'vitest';
import {divisionsInRectangle,mergeDivisionSelection} from '../../src/ui/mapSelection';

describe('地図のドラッグ範囲選択',()=>{
  const units=[{id:13,loc:2},{id:4,loc:1},{id:7,loc:2},{id:99,loc:9}];
  const anchors=new Map([[1,{x:20,y:40}],[2,{x:70,y:80}],[9,{x:900,y:900}]]);
  const project=(p:number)=>anchors.get(p)??null;
  it('逆向きの矩形も同じ師団を安定ID順で選択し、同じ州の複数師団を含む',()=>{
    const forward=divisionsInRectangle(units,project,{x1:10,y1:30,x2:100,y2:90});
    const reverse=divisionsInRectangle(units,project,{x1:100,y1:90,x2:10,y2:30});
    expect(forward).toEqual([4,7,13]);
    expect(reverse).toEqual(forward);
    expect(units).toEqual([{id:13,loc:2},{id:4,loc:1},{id:7,loc:2},{id:99,loc:9}]);
  });
  it('境界を含み、投影に失敗した州やNaNを除外する',()=>{
    expect(divisionsInRectangle(units,project,{x1:20,y1:40,x2:20,y2:40})).toEqual([4]);
    expect(divisionsInRectangle(units,p=>p===2?{x:NaN,y:80}:project(p),{x1:0,y1:0,x2:100,y2:100})).toEqual([4]);
    expect(divisionsInRectangle(units,()=>null,{x1:0,y1:0,x2:100,y2:100})).toEqual([]);
    expect(divisionsInRectangle(units,project,{x1:NaN,y1:0,x2:100,y2:100})).toEqual([]);
  });
  it('置換・加算・除外・トグルで他国IDを排除し、256件上限を保つ',()=>{
    const own=[4,7,13],current=[13,4];
    expect(mergeDivisionSelection(current,[7,1000],own,'replace')).toEqual([7]);
    expect(mergeDivisionSelection(current,[7,1000],own,'add')).toEqual([4,7,13]);
    expect(mergeDivisionSelection(current,[4,1000],own,'remove')).toEqual([13]);
    expect(mergeDivisionSelection(current,[4,7,1000],own,'toggle')).toEqual([7,13]);
    expect(mergeDivisionSelection(current,[],own,'replace')).toEqual([]);
    expect(mergeDivisionSelection([],own,own,'add',2)).toBeNull();
    expect(mergeDivisionSelection([4,7,13],[13],own,'remove',2)).toEqual([4,7]);
    expect(current).toEqual([13,4]);
  });
});
