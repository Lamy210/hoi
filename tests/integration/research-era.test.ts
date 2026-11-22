import { describe, expect, it } from 'vitest';
import { createTestEngine, loadTestPack, playerCommand } from '../helpers';
import { researchEraPenalty, techMods } from '../../src/engine/systems/research';
import { unitPowerFactors } from '../../src/engine/systems/combat';

describe('dated technology research', () => {
  it('keeps legacy definitions compatible and caps ahead-of-time penalty', () => {
    expect(researchEraPenalty(2026)).toBe(1);
    expect(researchEraPenalty(2026, 2026)).toBe(1);
    expect(researchEraPenalty(2026, 2028)).toBeCloseTo(1.7);
    expect(researchEraPenalty(2026, 2050)).toBe(4);
    expect(researchEraPenalty(2035, 2032)).toBe(1);
  });

  it('adds connected gun, artillery and doctrine branches to the verified pack', async () => {
    const pack = await loadTestPack(true);
    const names = new Set(pack.techs.map(t => t.id));
    expect(pack.techs.length).toBeGreaterThan(20);
    for (const id of ['small-arms-standard','small-arms-modular','small-arms-next','artillery-precision','drone-strike','doctrine-networked']) expect(names.has(id)).toBe(true);
    for (const t of pack.techs) {
      expect(t.req.every(id => names.has(id))).toBe(true);
      expect(t.year).toBeGreaterThanOrEqual(1900);
    }
  });

  it('advances the far-future rifle more slowly than present-day research, then lifts the penalty', async () => {
    const engine = await createTestEngine();
    const w = engine.world, c = w.playerCountry;
    w.research[c].done.push('small-arms-standard','small-arms-modular','small-arms-smart');
    playerCommand(engine,'startResearch',{techId:'small-arms-next'});
    playerCommand(engine,'startResearch',{techId:'industry-basic'});
    engine.stepTick();
    const future = w.research[c].active.find(a => a.id === 'small-arms-next');
    const current = w.research[c].active.find(a => a.id === 'industry-basic');
    expect(future).toBeDefined();
    expect(current).toBeDefined();
    expect(future!.progress).toBeLessThan(current!.progress);
    expect(future!.progress).toBeGreaterThan(0);
  });

  it('applies researched infantry and artillery improvements to the combat trace', async () => {
    const engine = await createTestEngine();
    const w = engine.world, c = w.playerCountry;
    const unit = w.units.find(u => u.owner === c)!;
    const base = unitPowerFactors(w,unit,unit.loc,'attack');
    expect(base.find(f => f.label === 'technology')).toBeUndefined();
    w.research[c].done.push('small-arms-standard','artillery-guidance');
    expect(techMods(w,c,'infantryAttack')).toBeGreaterThan(0);
    const upgraded = unitPowerFactors(w,unit,unit.loc,'attack');
    expect(upgraded.find(f => f.label === 'technology')!.value).toBeGreaterThan(1);
  });
});
