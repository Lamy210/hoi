import {describe,expect,it} from 'vitest';
import {projectGarrisonCoverage,type CoverageUnit} from '../../src/ui/garrisonCoverage';
import type {GarrisonOrder} from '../../src/engine/military/garrisons';

const unit=(id:number,overrides:Partial<CoverageUnit>={}):CoverageUnit=>({
  id,owner:2,loc:0,moving:false,target:-1,manualHold:false,encircled:false,inBattle:false,
  ...overrides,
});
const order=(overrides:Partial<GarrisonOrder>={}):GarrisonOrder=>({
  id:1,owner:2,provinces:[1,2,3],unitIds:[10,11],paused:false,revision:1,
  ...overrides,
});
const controllers=[2,2,2,2,1];

describe('garrison coverage snapshot projection',()=>{
  it('distinguishes a stationary guard, incoming orders, and uncovered targets',()=>{
    const g=order();
    const snap={
      controller:controllers,
      units:[unit(10,{loc:1}),unit(11,{loc:0,moving:true,target:2})],
    };
    const before=structuredClone(snap);
    expect(projectGarrisonCoverage(g,snap)).toEqual([
      {province:1,status:'guarded',guardingUnitIds:[10],incomingUnitIds:[]},
      {province:2,status:'incoming',guardingUnitIds:[],incomingUnitIds:[11]},
      {province:3,status:'uncovered',guardingUnitIds:[],incomingUnitIds:[],gapReason:'noAvailableUnits'},
    ]);
    expect(snap).toEqual(before);
  });

  it('does not count a division moving away as currently defending its old province',()=>{
    const statuses=projectGarrisonCoverage(order({provinces:[1,2],unitIds:[10]}),{
      controller:controllers,
      units:[unit(10,{loc:1,moving:true,target:2})],
    });
    expect(statuses.map(t=>t.status)).toEqual(['uncovered','incoming']);
    expect(statuses[0].gapReason).toBe('noAvailableUnits');
  });

  it('distinguishes occupation even with a guard or planned arrival',()=>{
    const result=projectGarrisonCoverage(order({provinces:[4],unitIds:[10,11]}),{
      controller:controllers,
      units:[unit(10,{loc:4}),unit(11,{moving:true,target:4})],
    });
    expect(result).toEqual([{province:4,status:'lost',guardingUnitIds:[10],incomingUnitIds:[11]}]);
  });

  it('reports only observable reasons: paused, no divisions, held, or awaiting orders',()=>{
    const s={controller:controllers,units:[unit(10,{loc:0}),unit(11,{loc:0})]};
    const target=order({provinces:[1]});
    expect(projectGarrisonCoverage({...target,paused:true},s)[0].gapReason).toBe('paused');
    expect(projectGarrisonCoverage({...target,unitIds:[]},s)[0].gapReason).toBe('noUnits');
    expect(projectGarrisonCoverage(target,{
      ...s,units:[unit(10,{manualHold:true}),unit(11,{inBattle:true})],
    })[0].gapReason).toBe('noAvailableUnits');
    expect(projectGarrisonCoverage(target,s)[0].gapReason).toBe('awaitingOrders');
  });

  it('ignores foreign divisions, handles duplicate targets, and sorts IDs and provinces',()=>{
    const g=order({provinces:[3,1,3,2],unitIds:[11,10,12]});
    const snap={controller:controllers,units:[
      unit(11,{loc:1}),unit(10,{loc:1}),unit(12,{owner:1,loc:3}),unit(13,{loc:2}),
    ]};
    expect(projectGarrisonCoverage(g,snap).map(p=>p.province)).toEqual([1,2,3]);
    expect(projectGarrisonCoverage(g,snap)[0].guardingUnitIds).toEqual([10,11]);
    expect(projectGarrisonCoverage(g,snap)[1].status).toBe('uncovered');
    expect(projectGarrisonCoverage(g,snap)[2].status).toBe('uncovered');
  });
});
