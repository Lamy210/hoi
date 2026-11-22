import { describe, expect, it } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { hashWorld } from '../../src/engine/core/hash';
import { savePayloadChecksum } from '../../src/engine/save/serialize';
import { allocateAiSequence } from '../../src/engine/core/sequence';

describe('persistent command sequences', () => {
  it('D15: 履歴切捨てと復元後も成功/拒否命令を再適用しない', async () => {
    const e = await createTestEngine(), w = e.world, c = w.playerCountry;
    const p = { templateId: 'light-v1', province: w.countries.capital[c] };
    const first = { issuer: 'player', seq: 1, type: 'startTraining', p };
    expect(applyCommands(w, [first])[0].ok).toBe(true);
    const bad = { ...first, seq: 2, p: { ...p, province: -1 } };
    expect(applyCommands(w, [bad])[0].ok).toBe(false);
    for (let seq = 3; seq <= 405; seq++) applyCommands(w, [{ issuer: 'player', seq, type: 'unknown', p: {} }]);
    expect(w.journal.some(j => j.issuer === 'player' && j.seq === 1)).toBe(false);
    expect(w.journal.some(j => j.issuer === 'player' && j.seq === 2)).toBe(false);
    expect(e.loadFrom(e.serialize()).ok).toBe(true);
    const before = hashWorld(w);
    expect(applyCommands(w, [first, { ...first, seq: 2 }]).map(x => x.reason)).toEqual(['duplicateCommand','duplicateCommand']);
    expect(hashWorld(w)).toBe(before);
    expect(w.trainingQueue).toHaveLength(1);
    expect(applyCommands(w, [{ ...first, seq: 406 }])[0].ok).toBe(true);
    expect(w.trainingQueue).toHaveLength(2);
  });

  it('issuerと番号を検証しAI/戦線AIの番号を独立させる', async () => {
    const e = await createTestEngine(), w = e.world;
    for (const issuer of ['ai:01', 'ai:-1', 'ai:100000', '__proto__', 'event']) {
      expect(applyCommands(w, [{ issuer, seq: 1, type: 'unknown', p: {} }])[0].reason).toBe('badSequence');
    }
    for (const seq of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(applyCommands(w, [{ issuer: 'player', seq, type: 'unknown', p: {} }])[0].reason).toBe('badSequence');
    }
    expect(w.commandWatermarks).toEqual({});
    const ai = 'ai:0';
    applyCommands(w, [{ issuer: ai, seq: 50, type: 'unknown', p: {} }]);
    expect(allocateAiSequence(w, ai)).toBe(51);
    expect(allocateAiSequence(w, 'frontai')).toBe(1);
  });

  it('AIの未適用命令を実行せず保存し、復元後の次tickで同一結果', async () => {
    const e = await createTestEngine(), w = e.world;
    const issuer = 'ai:' + ((w.playerCountry+1)%w.countries.count);
    w.runtime.commandsSinceLastTick.push({ issuer, seq: allocateAiSequence(w, issuer), type: 'unknown', p: {} });
    const before = hashWorld(w), bytes = e.serialize();
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(w)).toBe(before);
    expect(w.runtime.commandsSinceLastTick).toHaveLength(1);
    const restored = await createTestEngine();
    expect(restored.loadFrom(bytes).ok).toBe(true);
    e.stepTick(); restored.stepTick();
    expect(hashWorld(restored.world)).toBe(hashWorld(w));
  });

  it.each([4,5])('旧v%i相当の構造を旧hashで検証し既知番号を復元', async version => {
    const e = await createTestEngine(), w = e.world;
    applyCommands(w, [{ issuer: 'player', seq: 20, type: 'unknown', p: {} }]);
    w.runtime.aiSeq[0] = 500;
    const old = decode(e.serialize()) as any;
    delete old.stores.customTemplates; delete old.stores.counters.nextCustomTemplateId;
    delete old.stores.productionLines; delete old.stores.counters.nextProductionLineId; delete old.stores.productionMode;
    old.header.v = version;
    old.header.integrity = hashWorld(w, true);
    delete old.stores.armies; delete old.stores.armyGroups;
    delete old.stores.counters.nextArmyId; delete old.stores.counters.nextArmyGroupId;
    delete old.stores.commandWatermarks;
    delete old.stores.pendingCommands;
    if (version === 4) {
      delete old.stores.trainingQueue;
      delete old.payloadChecksum;
    } else old.payloadChecksum = savePayloadChecksum(old.header, old.stores);
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(w.commandWatermarks.player).toBe(20);
    expect(w.commandWatermarks['ai:0']).toBe(500);
    expect(allocateAiSequence(w, 'ai:0')).toBe(501);
  });

  it('チェックサム再計算済みでも不正watermarkと未適用命令を拒否', async () => {
    const e = await createTestEngine();
    applyCommands(e.world, [{ issuer: 'player', seq: 5, type: 'unknown', p: {} }]);
    const before = hashWorld(e.world);
    for (const mutate of [
      (b: any) => { b.stores.commandWatermarks.player = 4; },
      (b: any) => { b.stores.commandWatermarks['ai:999'] = 5; },
      (b: any) => { b.stores.pendingCommands = [{ issuer:'player', seq:0, type:'unknown', p:{} }]; },
      (b: any) => { delete b.stores.commandWatermarks; },
    ]) {
      const blob = decode(e.serialize()) as any;
      mutate(blob);
      blob.payloadChecksum = savePayloadChecksum(blob.header, blob.stores);
      expect(e.loadFrom(encode(blob)).ok).toBe(false);
      expect(hashWorld(e.world)).toBe(before);
    }
  });
});
