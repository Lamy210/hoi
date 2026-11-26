import {describe,expect,it} from 'vitest';
import {hashWorld} from '../../src/engine/core/hash';
import {planGarrisonMoves,GARRISON_COMMAND_BUDGET} from '../../src/engine/military/garrisons';
import {emptyGarrisonRouteCacheStats} from '../../src/engine/military/garrisonRouteCache';
import {createGarrisonStressWorld,runGarrisonBench} from '../../tools/garrisonBenchmark';

describe('garrison stress-workload measurement',()=>{
  it('constructs the configured 256-unit / 64-objective maximum without mutating the pack',async()=>{
    const {world,order}=await createGarrisonStressWorld('distributed',256,64);
    expect(order.unitIds).toHaveLength(256);
    expect(order.provinces).toHaveLength(64);
    expect(new Set(order.unitIds).size).toBe(256);
    expect(new Set(order.provinces).size).toBe(64);
    expect(world.prov.count).toBeGreaterThan(64);
    expect(order.unitIds.every(id=>world.units.some(u=>u.id===id))).toBe(true);
  });

  it('reports actual planner route counts, preserves hash and never exceeds four moves',async()=>{
    const {world,order}=await createGarrisonStressWorld('stacked',32,8);
    const before=hashWorld(world);
    const stats=emptyGarrisonRouteCacheStats();
    const planned=planGarrisonMoves(world,order,stats);
    expect(planned.length).toBeLessThanOrEqual(GARRISON_COMMAND_BUDGET);
    expect(stats.requests).toBe(stats.searches+stats.hits);
    expect(stats.requests).toBeGreaterThan(0);
    expect(stats.searches).toBeGreaterThan(0);
    expect(stats.searches).toBeLessThan(stats.requests);
    expect(hashWorld(world)).toBe(before);
    expect(planGarrisonMoves(world,order)).toEqual(planned);
  });

  it('produces finite p50/p95 samples and deterministic plans in both distributions',async()=>{
    for(const workload of ['stacked','distributed'] as const){
      const result=await runGarrisonBench({
        workload,units:24,targets:8,iterations:2,warmup:1,
      });
      expect(result.provinceCount).toBeGreaterThan(8);
      expect(result.plannedMoves).toBeLessThanOrEqual(GARRISON_COMMAND_BUDGET);
      expect(result.routeRequests).toBe(result.pathSearches+result.cacheHits);
      expect(result.pathSearches).toBeGreaterThan(0);
      for(const timing of [result.minMs,result.p50Ms,result.p95Ms,result.maxMs]){
        expect(Number.isFinite(timing)).toBe(true);
        expect(timing).toBeGreaterThanOrEqual(0);
      }
      expect(result.p50Ms).toBeLessThanOrEqual(result.p95Ms);
    }
  });

  it('rejects workload limits outside the supported garrison command contract',async()=>{
    await expect(createGarrisonStressWorld('stacked',257,64)).rejects.toThrow();
    await expect(createGarrisonStressWorld('stacked',256,65)).rejects.toThrow();
    await expect(runGarrisonBench({
      workload:'stacked',units:8,targets:4,iterations:0,warmup:0,
    })).rejects.toThrow();
  });
});
