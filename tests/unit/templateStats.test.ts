import { describe, expect, it } from 'vitest';
import { previewTemplate, BUILTIN_BATTALIONS } from '../../src/engine/military/templateStats';
import { DIVISION_TEMPLATES } from '../../src/engine/military/templates';

function stats(battalionIds: string[], supportIds: string[] = []) {
  const result = previewTemplate({ battalionIds, supportIds });
  if (!result.ok) throw new Error(result.reason);
  return result.stats;
}
const infantry = (n: number) => Array<string>(n).fill('infantry-v1');
const heavy = (n: number) => Array<string>(n).fill('artillery-heavy-v1');

describe('Phase5B 編成プレビュー', () => {
  it('D01: 固定3編成の資源と訓練日数を維持する', () => {
    for (const [i, ids] of [infantry(5), infantry(10), heavy(10)].entries()) {
      const result = stats(ids);
      const legacy = DIVISION_TEMPLATES[i];
      expect([result.manpower, result.infantry, result.artillery, result.days])
        .toEqual([legacy.manpower, legacy.infantry, legacy.artillery, legacy.days]);
    }
  });
  it('D02: 複合編成の全能力を算出する', () => {
    expect(stats([...infantry(6), ...heavy(2)], ['engineer-v1'])).toEqual({
      manpower: 8200, infantry: 820, artillery: 200, width: 16, attack: 34.5,
      defense: 34, org: (6000*60+2000*50+200*60)/8200, speed: 1, supply: 9.2, days: 44,
    });
  });
  it('構成順序は集計値に影響しない', () => {
    expect(stats([...heavy(2), ...infantry(6)], ['recon-v1','engineer-v1']))
      .toEqual(stats([...infantry(6), ...heavy(2)], ['engineer-v1','recon-v1']));
    expect(Object.isFrozen(BUILTIN_BATTALIONS)).toBe(true);
    expect(BUILTIN_BATTALIONS.every(Object.isFrozen)).toBe(true);
  });
  it('境界1・25大隊と既存2支援を許す', () => {
    expect(stats(infantry(1)).days).toBe(30);
    expect(stats(heavy(25), ['engineer-v1','recon-v1']).days).toBe(132);
    expect(stats(heavy(25)).width).toBe(50);
  });
  it.each([
    [null, 'badParams'],
    [{ battalionIds: 'infantry-v1', supportIds: [] }, 'badParams'],
    [{ battalionIds: infantry(1), supportIds: [], manpower: 0 }, 'badParams'],
    [{ battalionIds: [], supportIds: [] }, 'limitExceeded'],
    [{ battalionIds: infantry(26), supportIds: [] }, 'limitExceeded'],
    [{ battalionIds: infantry(1), supportIds: Array(6).fill('engineer-v1') }, 'limitExceeded'],
    [{ battalionIds: infantry(1), supportIds: ['engineer-v1','engineer-v1'] }, 'duplicateSupport'],
    [{ battalionIds: ['unknown'], supportIds: [] }, 'unknownReference'],
    [{ battalionIds: ['engineer-v1'], supportIds: [] }, 'unknownReference'],
    [{ battalionIds: infantry(1), supportIds: ['infantry-v1'] }, 'unknownReference'],
    [{ battalionIds: [2], supportIds: [] }, 'unknownReference'],
  ])('不正構成を拒否する %j', (input, reason) => {
    expect(previewTemplate(input)).toEqual({ ok: false, reason });
  });
});
