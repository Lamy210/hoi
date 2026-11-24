import {describe,expect,it} from 'vitest';
import {NAVAL_MODELS,navalModel,validateNavalModels} from '../../src/engine/naval/models';
import {loadTestPack} from '../helpers';
import {createEngine} from '../../src/engine/engine';
import {calculateNavalTransportCapacity,type NavalShipAsset,
  type NavalCapacityReservation} from '../../src/engine/naval/transportCapacity';

const ship=(id:number,modelId:string,condition=100,
  readiness:NavalShipAsset['readiness']='ready',owner=1):NavalShipAsset=>({
  id,owner,modelId,condition,readiness,portId:'port-busan',zoneId:null,
});
const reservation=(id:number,shipIds:number[],requiredCapacity:number,
  purpose:NavalCapacityReservation['purpose']='amphibious'):NavalCapacityReservation=>({
  id,owner:1,purpose,shipIds,requiredCapacity,
});

describe('Phase8B naval model catalog',()=>{
  it('exposes models only as read-only metadata in maritime-capable scenarios',async()=>{
    const pack=await loadTestPack();
    const game=createEngine(pack,{seed:2026,playerCountryId:'KOR',difficulty:1});
    const info=game.getUiMeta();
    expect(info.navalModels?.length).toBe(4);
    expect(info.navalModels?.find(m=>m.role==='transport')?.transportCapacity).toBe(20);
    expect(game.getUiSnapshot(0)).not.toHaveProperty('navalShips');
  });

  it('defines four internally consistent, immutable abstract models',()=>{
    expect(validateNavalModels(NAVAL_MODELS)).toEqual([]);
    expect(NAVAL_MODELS.map(m=>m.id)).toEqual([
      'convoy-basic','escort-basic','patrol-basic','capital-basic',
    ]);
    expect(NAVAL_MODELS.find(m=>m.role==='transport')?.transportCapacity).toBeGreaterThan(0);
    expect(NAVAL_MODELS.filter(m=>m.role!=='transport').every(m=>m.transportCapacity===0)).toBe(true);
    expect(Object.isFrozen(NAVAL_MODELS)).toBe(true);
    for(const m of NAVAL_MODELS)expect(Object.isFrozen(m)).toBe(true);
    expect(navalModel('unknown-type')).toBeUndefined();
  });

  it('rejects model duplication, invalid float/NaN, role mismatch and insufficient names',()=>{
    const bad=structuredClone(NAVAL_MODELS);
    bad.push({...bad[0]});
    bad[0].industryCost=Number.NaN;
    bad[1].transportCapacity=100;
    bad[2].nameJa='';
    const err=validateNavalModels(bad);
    expect(err.some(x=>x.includes('duplicate'))).toBe(true);
    expect(err.some(x=>x.includes('industryCost'))).toBe(true);
    expect(err.some(x=>x.includes('transport role'))).toBe(true);
    expect(err.some(x=>x.includes('name'))).toBe(true);
  });
});

describe('fail-closed naval transport capacity',()=>{
  it('starts at exactly zero without ships and without guessing sea control',()=>{
    expect(calculateNavalTransportCapacity(1,[],[])).toEqual({
      valid:true,errors:[],totalCapacity:0,reservedCapacity:0,
      availableCapacity:0,totalEscortPower:0,availableEscortPower:0,
    });
  });
  it('counts only own ready ships and applies condition degradation with exact flooring',()=>{
    const ships=[ship(1,'convoy-basic',100),ship(2,'convoy-basic',75),
      ship(3,'convoy-basic',49),ship(4,'convoy-basic',100,'building'),
      ship(5,'convoy-basic',100,'repairing'),ship(6,'convoy-basic',100,'ready',2),
      ship(7,'escort-basic',80),ship(8,'patrol-basic',100)];
    const result=calculateNavalTransportCapacity(1,ships,[]);
    expect(result.valid).toBe(true);
    expect(result.totalCapacity).toBe(35); // 20 + floor(20*.75)
    expect(result.totalEscortPower).toBe(23); // floor(22*.8) + 6
    expect(result.availableCapacity).toBe(35);
    expect(result.availableEscortPower).toBe(23);
  });
  it('reserves the WHOLE ship to avoid reuse, even if the requested cargo is smaller',()=>{
    const ships=[ship(1,'convoy-basic'),ship(2,'convoy-basic',80),ship(3,'escort-basic')];
    const ok=calculateNavalTransportCapacity(1,ships,[reservation(11,[1,3],8)]);
    expect(ok).toEqual({
      valid:true,errors:[],totalCapacity:36,reservedCapacity:20,
      availableCapacity:16,totalEscortPower:22,availableEscortPower:0,
    });
  });
  it('does not permit two missions to reuse a convoy or escorts',()=>{
    const ships=[ship(1,'convoy-basic'),ship(2,'convoy-basic')];
    const result=calculateNavalTransportCapacity(1,ships,[
      reservation(11,[1],10),reservation(12,[1,2],20,'supply'),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ship reserved twice: 1');
    expect(result.availableCapacity).toBe(0);
    expect(result.totalCapacity).toBe(0);
  });
  it('rejects undersupplied operations and never pretends unknown models are valid',()=>{
    const shortage=calculateNavalTransportCapacity(1,[ship(1,'convoy-basic')],
      [reservation(1,[1],21)]);
    expect(shortage.valid).toBe(false);
    expect(shortage.errors).toContain('insufficient reserved transport capacity: 1');
    const unknown=calculateNavalTransportCapacity(1,[ship(1,'not-a-ship')],[]);
    expect(unknown.valid).toBe(false);
    expect(unknown.errors.some(e=>e.includes('unknown naval model'))).toBe(true);
    expect(unknown.availableCapacity).toBe(0);
  });
  it('rejects foreign, incomplete, damaged, duplicate and impossible ship assignments',()=>{
    const cases=[
      {assets:[ship(1,'convoy-basic'),ship(1,'convoy-basic')],reservations:[]},
      {assets:[ship(1,'convoy-basic',-1)],reservations:[]},
      {assets:[{...ship(1,'convoy-basic'),portId:'port-busan',zoneId:'sea-korea'}],reservations:[]},
      {assets:[ship(1,'convoy-basic',40)],reservations:[reservation(1,[1],1)]},
      {assets:[ship(1,'convoy-basic',100,'building')],reservations:[reservation(1,[1],1)]},
      {assets:[ship(1,'convoy-basic',100,'ready',2)],reservations:[reservation(1,[1],1)]},
      {assets:[ship(1,'convoy-basic')],reservations:[reservation(1,[2],1)]},
      {assets:[ship(1,'convoy-basic')],reservations:[reservation(1,[1,1],1)]},
    ];
    for(const input of cases){
      const result=calculateNavalTransportCapacity(1,input.assets,input.reservations);
      expect(result.valid,JSON.stringify(input)).toBe(false);
      expect(result.availableCapacity).toBe(0);
    }
  });
  it('is deterministic, read-only, and refuses unsafe input bounds',()=>{
    const assets=[ship(10,'convoy-basic'),ship(5,'escort-basic')];
    const reserved=[reservation(7,[10,5],20)];
    const before=JSON.stringify({assets,reserved});
    const x=calculateNavalTransportCapacity(1,assets,reserved);
    const y=calculateNavalTransportCapacity(1,assets,reserved);
    expect(x).toEqual(y);
    expect(JSON.stringify({assets,reserved})).toBe(before);
    expect(calculateNavalTransportCapacity(-1,assets,reserved).valid).toBe(false);
    expect(calculateNavalTransportCapacity(1,new Array(4097).fill(assets[0]),[]).valid).toBe(false);
  });
});
