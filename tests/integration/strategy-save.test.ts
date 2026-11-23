import {describe,it,expect} from 'vitest';
import {encode,decode} from '@msgpack/msgpack';
import {strategyFixture} from '../helpers/strategyFixture';
import {runStrategyTick} from '../../src/engine/strategy/tick';
import {STRATEGY_SAVE_VERSION,loadStrategy,saveStrategy,strategyHash} from '../../src/engine/strategy/save';
describe('strategy v19 save and recover',()=>{
  it('新スキーマの完全往復は同じ状態ハッシュ・連続tickを再現する',()=>{
    const original=runStrategyTick(strategyFixture()).next;
    const bytes=saveStrategy(original);
    const restored=loadStrategy(bytes);
    expect(restored.errors).toEqual([]);
    expect(restored.state).not.toBeNull();
    expect(strategyHash(restored.state!)).toBe(strategyHash(original));
    expect(strategyHash(runStrategyTick(restored.state!).next))
      .toBe(strategyHash(runStrategyTick(original).next));
    expect(STRATEGY_SAVE_VERSION).toBe(19);
  });
  it('旧v18、改竄checksum、異なるtick、不正人口を拒否',()=>{
    const original=strategyFixture();
    const data=decode(saveStrategy(original)) as any;
    expect(loadStrategy(encode({header:{schema:'orbis-save',version:18},state:original})).errors)
      .toContain('unsupported save version');
    data.state.nations[0].population.workers=-1;
    expect(loadStrategy(encode(data)).state).toBeNull();
    const data2=decode(saveStrategy(original)) as any;
    data2.header.tick=99;
    expect(loadStrategy(encode(data2)).errors).toContain('header tick mismatch');
    const data3=decode(saveStrategy(original)) as any;
    data3.checksum=0;
    expect(loadStrategy(encode(data3)).errors).toContain('payload checksum mismatch');
  });
});