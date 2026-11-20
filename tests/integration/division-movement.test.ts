import { describe, expect, it } from 'vitest';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';

describe('手動師団移動の一括命令', () => {
  it('重複IDと他国混在は全件拒否し既存経路を変更しない', async () => {
    const e = await createTestEngine(), w = e.world;
    const own = w.units.filter(u => u.owner === w.playerCountry);
    const foreign = w.units.find(u => u.owner !== w.playerCountry)!;
    const target = w.prov.id.indexOf('JP-14');
    const issue = (seq: number, units: number[]) => applyCommands(w, [{issuer:'player', seq, type:'moveUnits', p:{units,target}}])[0];
    const before = w.units.map(u => u.path.slice());
    expect(issue(1,[own[0].id,own[0].id]).reason).toBe('badParams');
    expect(issue(2,[own[0].id,foreign.id]).ok).toBe(false);
    expect(w.units.map(u => u.path)).toEqual(before);
    expect(issue(3,[own[0].id,own[1].id]).ok).toBe(true);
    const route = own[1].path.slice();
    expect(route.at(-1)).toBe(target);
    expect(issue(4,[own[1].id]).reason).toContain('unitBusy');
    expect(own[1].path).toEqual(route);
  });
});
