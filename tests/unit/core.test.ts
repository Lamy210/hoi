// 決定論基盤の単体テスト（PCG32・日付変換）
import { describe, it, expect } from 'vitest';
import { PCG32, deriveStream, fnv1a32 } from '../../src/engine/core/rng';
import { daysFromCivil, civilFromDays, formatDate } from '../../src/engine/clock/date';

describe('PCG32', () => {
  it('同一シードで同一系列を返す', () => {
    const a = PCG32.fromSeed(12345, 7);
    const b = PCG32.fromSeed(12345, 7);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint()).toBe(b.nextUint());
    }
  });

  it('異なるシード/ストリームで系列が異なる', () => {
    const a = PCG32.fromSeed(1, 1);
    const b = PCG32.fromSeed(2, 1);
    const c = PCG32.fromSeed(1, 2);
    const sa: number[] = [], sb: number[] = [], sc: number[] = [];
    for (let i = 0; i < 100; i++) {
      sa.push(a.nextUint());
      sb.push(b.nextUint());
      sc.push(c.nextUint());
    }
    expect(sa).not.toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('状態の退避・復元で系列が継続する', () => {
    const a = PCG32.fromSeed(99, 3);
    for (let i = 0; i < 10; i++) a.nextUint();
    const parts = a.toParts();
    const b = PCG32.fromParts(parts);
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < 50; i++) {
      xs.push(a.nextUint());
      ys.push(b.nextUint());
    }
    expect(xs).toEqual(ys);
  });

  it('nextFloat は [0,1) に収まる', () => {
    const r = PCG32.fromSeed(5, 5);
    for (let i = 0; i < 10000; i++) {
      const v = r.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('deriveStreamは名前・スコープで決定論的に派生する', () => {
    const a = deriveStream(42, 'combat', 'JP-13:100');
    const b = deriveStream(42, 'combat', 'JP-13:100');
    const c = deriveStream(42, 'combat', 'JP-13:101');
    expect(a.nextUint()).toBe(b.nextUint());
    expect(a.nextUint()).not.toBe(c.nextUint());
  });
});

describe('日付変換（プロレプティック・グレゴリオ暦）', () => {
  it('既知の日付が正しく変換される', () => {
    // 1970-01-01 = epoch 0
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    // 2026-01-01
    const z = daysFromCivil(2026, 1, 1);
    expect(formatDate(z)).toBe('2026-01-01');
    // 100日後 → 2026-04-11（1/1 + 100日: 1月30日分+2月30+3月30+10 → 2026-04-11）
    expect(formatDate(z + 100)).toBe('2026-04-11');
  });

  it('閏年を正しく扱う', () => {
    expect(formatDate(daysFromCivil(2024, 2, 29))).toBe('2024-02-29');
    // 2024-02-28の翌日は2024-02-29
    const z = daysFromCivil(2024, 2, 28);
    expect(formatDate(z + 1)).toBe('2024-02-29');
    // 2023年は閏年でない
    expect(formatDate(daysFromCivil(2023, 2, 28) + 1)).toBe('2023-03-01');
  });

  it('往復変換で同一の日付になる', () => {
    for (let z = 0; z < 50000; z += 7) {
      const c = civilFromDays(z);
      expect(daysFromCivil(c.y, c.m, c.d)).toBe(z);
    }
  });

  it('fnv1a32は決定論的', () => {
    expect(fnv1a32('combat')).toBe(fnv1a32('combat'));
    expect(fnv1a32('combat')).not.toBe(fnv1a32('ai'));
  });
});
