import {describe,it,expect} from 'vitest';
import {strategyFixture} from '../helpers/strategyFixture';
import {assertStrategyState,type StrategyState} from '../../src/engine/strategy/model';
import {createEquipmentDesign,switchEquipmentProduction} from '../../src/engine/strategy/designer/revisions';
import {equippedCombatStats} from '../../src/engine/strategy/rules';
import {runStrategyTick} from '../../src/engine/strategy/tick';
import {saveStrategy,loadStrategy,strategyHash} from '../../src/engine/strategy/save';
import {divisionEquipmentStatus,setDivisionEquipmentRequirement,transferDivisionEquipment}
  from '../../src/engine/strategy/equipment/division';
import {holderQuantity} from '../../src/engine/strategy/equipment/ledger';
import {airBaseStatus,assignAirWingPilots,createAirWing,
  sendAirWingAircraftForRepair,transferAirWingAircraft} from '../../src/engine/strategy/air/wings';
import {
  TANK_CHASSIS,TANK_GUNS,TANK_TURRETS,TANK_ENGINES,TANK_ARMORS,TANK_SPECIALS,
  AIR_FRAMES,AIR_ENGINES,AIR_WEAPONS,AIR_SPECIALS,
} from '../../src/engine/strategy/designer/catalog';

function equipped():StrategyState {
  const w=strategyFixture();
  w.nations[0].techDone=[
    TANK_CHASSIS.medium.tech,TANK_GUNS.multipurpose.tech,TANK_TURRETS.three.tech,
    TANK_ENGINES.diesel.tech,TANK_ARMORS.sloped.tech,TANK_SPECIALS.radio.tech,
    AIR_FRAMES.small.tech,AIR_ENGINES.piston.tech,AIR_WEAPONS.cannon.tech,
    AIR_SPECIALS.radar.tech,AIR_SPECIALS.dropTank.tech,
  ];
  Object.assign(w.regions[0].resources,{tungsten:100,rubber:100,aluminium:100});
  // Reserve two existing soldiers as pilots: POP total and regional population stay fixed.
  w.nations[0].population.reserves-=2;
  w.nations[0].population.soldiers+=2;
  w.airBases=[{id:1,province:0,country:0,capacity:2,damage:0}];
  assertStrategyState(w);
  return w;
}
const tank={chassis:'medium' as const,gun:'multipurpose' as const,turret:'three' as const,
  engine:'diesel' as const,armor:'sloped' as const,specials:['radio'] as const};
const air={frame:'small' as const,engine:'piston' as const,engineCount:1,
  weapons:['cannon'] as const,specials:['radar','dropTank'] as const};
function production(kind:'tank'|'aircraft'):{world:StrategyState;modelId:string;made:number}{
  const world=equipped();
  const registration=kind==='tank'
    ?createEquipmentDesign(world,{actorCountry:0,kind,familyId:'armored',blueprint:tank})
    :createEquipmentDesign(world,{actorCountry:0,kind,familyId:'fighter',blueprint:air});
  const setup=switchEquipmentProduction(registration.next,0,1,registration.modelId);
  setup.factories.find(f=>f.id===2)!.baseIC=400;
  const result=runStrategyTick(setup);
  return {world:result.next,modelId:registration.modelId,
    made:result.production.find(p=>p.modelId===registration.modelId)?.quantity??0};
}
const inventoryTotal=(w:StrategyState)=>
  w.lots.reduce((sum,lot)=>sum+lot.quantity,0);

describe('equipment deployment and air wings - canonical strategy inventory',()=>{
  it('新型戦車は生産→倉庫→師団へ移転し、戦闘力は実配備Lotから導出する',()=>{
    const {world,modelId,made}=production('tank');
    expect(made).toBe(1);
    const old=strategyHash(world),count=inventoryTotal(world);
    const requirement=setDivisionEquipmentRequirement(world,0,1,'tank',1,0);
    expect(requirement.equipmentCommandRevision).toBe(1);
    const before=equippedCombatStats(requirement,requirement.divisions[0]);
    const result=transferDivisionEquipment(requirement,0,1,modelId,1,'issue',1);
    expect(result.equipmentCommandRevision).toBe(2);
    expect(inventoryTotal(result)).toBe(count);
    expect(holderQuantity(result,modelId,{holder:'warehouse',holderId:0})).toBe(0);
    expect(holderQuantity(result,modelId,{holder:'division',holderId:1})).toBe(1);
    expect(divisionEquipmentStatus(result,1)).toEqual([
      {category:'tank',required:1,issued:1,fill:1},
    ]);
    const after=equippedCombatStats(result,result.divisions[0]);
    expect(after.softAttack).toBeGreaterThan(before.softAttack);
    expect(after.hardAttack).toBeGreaterThan(before.hardAttack);
    expect(after.breakthrough).toBeGreaterThan(before.breakthrough);
    expect(strategicReload(result)).toEqual(strategyHash(result));
    expect(strategyHash(world)).toBe(old);
    const afterTick=runStrategyTick(result);
    expect(holderQuantity(afterTick.next,modelId,{holder:'division',holderId:1})).toBe(1);
    expect(inventoryTotal(afterTick.next)).toBeGreaterThanOrEqual(inventoryTotal(result));
    const back=transferDivisionEquipment(result,0,1,modelId,1,'return',2);
    expect(holderQuantity(back,modelId,{holder:'warehouse',holderId:0})).toBe(1);
    expect(holderQuantity(back,modelId,{holder:'division',holderId:1})).toBe(0);
    expect(inventoryTotal(back)).toBe(count);
  });

  it('カテゴリー別上限・移動/交戦・数量不足・国境越え・古いRevisionの再送を拒否',()=>{
    const {world,modelId}=production('tank');
    const withNeed=setDivisionEquipmentRequirement(world,0,1,'tank',1,0);
    const withLot=transferDivisionEquipment(withNeed,0,1,modelId,1,'issue',1);
    const before=strategyHash(withLot);
    expect(()=>transferDivisionEquipment(withLot,0,1,modelId,1,'issue',2)).toThrow(/capacity/);
    expect(()=>transferDivisionEquipment(withLot,0,1,modelId,1,'issue',1)).toThrow(/stale/);
    expect(()=>transferDivisionEquipment(withLot,1,1,modelId,1,'return',2)).toThrow(/unauthorized/);
    expect(()=>transferDivisionEquipment(withLot,0,1,modelId,2,'return',2)).toThrow(/insufficient/);
    expect(()=>setDivisionEquipmentRequirement(withLot,0,1,'tank',0,2)).toThrow(/below/);
    expect(()=>transferDivisionEquipment(withLot,0,1,modelId,0,'return',2)).toThrow(/positive/);
    const moving=structuredClone(withLot);moving.divisions[0].moving=true;
    expect(()=>transferDivisionEquipment(moving,0,1,modelId,1,'return',2)).toThrow(/division unavailable/);
    expect(strategicReload(withLot)).toBe(before);
  });

  it('基地満杯でも既存機が出撃枠を持ち、pilotと機体は別正本から計算される',()=>{
    const {world,modelId,made}=production('aircraft');
    expect(made).toBe(2);
    const {next:created,wingId}=createAirWing(world,0,1,modelId,0);
    expect(created.airWings?.[0].pilots).toBe(0);
    const withPilots=assignAirWingPilots(created,0,wingId,2,1);
    const loaded=transferAirWingAircraft(withPilots,0,wingId,2,'issue',2);
    const status=airBaseStatus(loaded,1);
    expect(status.freeHangars).toBe(0);
    expect(status.parked).toBe(2);
    expect(status.operationalCapacity).toBe(2);
    expect(status.wings).toEqual([{id:wingId,baseId:1,modelId,
      ready:2,repairing:0,pilots:2,operationalSlots:2}]);
    expect(holderQuantity(loaded,modelId,{holder:'warehouse',holderId:0})).toBe(0);
    expect(inventoryTotal(loaded)).toBe(inventoryTotal(world));
    expect(strategicReload(loaded)).toBe(strategyHash(loaded));
    const day=runStrategyTick(loaded).next;
    expect(airBaseStatus(day,1).wings[0].ready).toBe(2);
    expect(loaded.airWings?.[0].mission).toBe('grounded');
  });

  it('修理待ちは稼働機から一度だけ移動し、航空基地の駐機総数は変わらない',()=>{
    const {world,modelId}=production('aircraft');
    const created=createAirWing(world,0,1,modelId,0);
    const crew=assignAirWingPilots(created.next,0,created.wingId,2,1);
    const issued=transferAirWingAircraft(crew,0,created.wingId,2,'issue',2);
    const damaged=sendAirWingAircraftForRepair(issued,0,created.wingId,1,3);
    expect(airBaseStatus(damaged,1).parked).toBe(2);
    expect(airBaseStatus(damaged,1).wings[0]).toMatchObject({
      ready:1,repairing:1,pilots:2,operationalSlots:1,
    });
    expect(inventoryTotal(damaged)).toBe(inventoryTotal(issued));
    expect(()=>transferAirWingAircraft(damaged,0,created.wingId,2,'return',4))
      .toThrow(/insufficient/);
    const returned=transferAirWingAircraft(damaged,0,created.wingId,1,'return',4);
    expect(airBaseStatus(returned,1).parked).toBe(1);
    expect(holderQuantity(returned,modelId,{holder:'repairing',holderId:created.wingId})).toBe(1);
    expect(holderQuantity(returned,modelId,{holder:'warehouse',holderId:0})).toBe(1);
    expect(inventoryTotal(returned)).toBe(inventoryTotal(world));
  });

  it('他国航空機・基地容量・パイロット兵員超過・偽装lotを拒否して入力を維持する',()=>{
    const {world,modelId}=production('aircraft');
    const {next:created,wingId}=createAirWing(world,0,1,modelId,0);
    const original=strategyHash(created);
    expect(()=>createAirWing(created,1,1,modelId,1)).toThrow(/airbase/);
    expect(()=>createAirWing(created,0,1,'rifle',1)).toThrow(/aircraft/);
    expect(()=>assignAirWingPilots(created,0,wingId,3,1)).toThrow(/deployed soldiers/);
    expect(()=>assignAirWingPilots(created,0,wingId,-1,1)).toThrow(/pilot/);
    expect(()=>assignAirWingPilots(created,0,wingId,1,0)).toThrow(/stale/);
    expect(()=>transferAirWingAircraft(created,0,wingId,3,'issue',1)).toThrow(/insufficient/);
    expect(strategicReload(created)).toBe(original);
    const capacity=structuredClone(created);
    capacity.airBases![0].capacity=1;
    expect(()=>transferAirWingAircraft(capacity,0,wingId,2,'issue',1)).toThrow(/hangar/);
    const illegal=structuredClone(created);
    illegal.lots.push({holder:'division',holderId:1,modelId,quantity:1});
    expect(()=>assertStrategyState(illegal)).toThrow(/lot holder/);
    const spoofed=structuredClone(created);
    spoofed.lots.push({holder:'airwing',holderId:wingId,modelId:'rifle',quantity:1});
    expect(()=>assertStrategyState(spoofed)).toThrow(/lot holder/);
  });

  it('複数航空隊は航空基地の損害後も同一稼働枠を二重に使用しない',()=>{
    const {world,modelId}=production('aircraft');
    world.airBases![0].capacity=4;
    let state=createAirWing(world,0,1,modelId,0);
    const second=createAirWing(state.next,0,1,modelId,1);
    const wing1=state.wingId,wing2=second.wingId;
    let w=assignAirWingPilots(second.next,0,wing1,1,2);
    w=assignAirWingPilots(w,0,wing2,1,3);
    w=transferAirWingAircraft(w,0,wing1,1,'issue',4);
    w=transferAirWingAircraft(w,0,wing2,1,'issue',5);
    expect(airBaseStatus(w,1).wings.map(x=>x.operationalSlots)).toEqual([1,1]);
    w.airBases![0].damage=.75; // Hangar still holds 2 parked planes; one operational slot remains
    assertStrategyState(w);
    expect(airBaseStatus(w,1).wings.map(x=>x.operationalSlots)).toEqual([1,0]);
    expect(airBaseStatus(w,1).parked).toBe(2);
  });
});

function strategicReload(w:StrategyState):number {
  const reload=loadStrategy(saveStrategy(w));
  expect(reload.errors).toEqual([]);
  expect(reload.state).not.toBeNull();
  return strategyHash(reload.state!);
}
