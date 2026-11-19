// セーブ/ロード統合テスト（INV-8: 往復一致＋継続一致）
import { describe, it, expect } from 'vitest';
import { createTestEngine, loadTestPack } from '../helpers';
import { deserializeWorld, savePayloadChecksum } from '../../src/engine/save/serialize';
import { hashWorld } from '../../src/engine/core/hash';

describe('セーブ/ロード', () => {
  it('スナップショットの直列化は決定論的（同状態→同バイト列）', async () => {
    const engine = await createTestEngine(1, 11, 'JPN');
    for (let t = 0; t < 100; t++) engine.stepTick();
    const a = engine.serialize();
    const b = engine.serialize();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('往復復元で状態ハッシュ一致・継続tickも一致（INV-8）', async () => {
    const pack = await loadTestPack();
    const engine = await createTestEngine(1, 12, 'JPN');
    for (let t = 0; t < 300; t++) engine.stepTick();
    const buf = engine.serialize();

    const r = deserializeWorld(buf, pack);
    expect(r.violations).toEqual([]);
    expect(r.world).not.toBeNull();
    expect(hashWorld(r.world!)).toBe(hashWorld(engine.world));

    // 復元後も同一tick数進めると同一ハッシュ
    for (let t = 0; t < 60; t++) {
      engine.stepTick();
      r.world!.runtime.commandsSinceLastTick = [];
      // 復元側はコマンドなしで進行（AIのみ）
      const restored = r.world!;
      // stepTick相当を手動実行（Engineファサードではなく世界直操作）
      const { applyCommands } = await import('../../src/engine/core/command');
      applyCommands(restored, restored.runtime.commandsSinceLastTick);
      restored.runtime.commandsSinceLastTick = [];
      restored.tick++;
      const { runDailySystems, runWeeklySystems, runMonthlySystems } = await import('../../src/engine/core/scheduler');
      runDailySystems(restored);
      runWeeklySystems(restored);
      runMonthlySystems(restored);
    }
    expect(hashWorld(r.world!)).toBe(hashWorld(engine.world));
  });

  it('改ざんセーブは拒否される（不正セーブ処理）', async () => {
    const engine = await createTestEngine(1, 13, 'JPN');
    for (let t = 0; t < 50; t++) engine.stepTick();
    const buf = engine.serialize();
    const pack = await loadTestPack();
    // v5の全ペイロード検証は、状態ハッシュ対象外の保存フィールドも保護する。
    const corrupt = new Uint8Array(buf);
    const mid = Math.floor(corrupt.length / 2);
    corrupt[mid] ^= 0xff;
    const r = deserializeWorld(corrupt, pack);
    // decode、payload checksum、canonical表現、状態検証のいずれかで拒否する。
    expect(r.world).toBeNull();
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it('不明バージョンのセーブは拒否される', async () => {
    const engine = await createTestEngine(1, 14, 'JPN');
    for (let t = 0; t < 10; t++) engine.stepTick();
    const buf = engine.serialize();
    // ヘッダのvを書き換え（msgpack先頭付近の整数を探して1→9）
    const pack = await loadTestPack();
    const { decode } = await import('@msgpack/msgpack');
    const blob = decode(buf) as Record<string, any>;
    blob.header.v = 999;
    const { encode } = await import('@msgpack/msgpack');
    const bad = encode(blob);
    const r = deserializeWorld(new Uint8Array(bad), pack);
    expect(r.world).toBeNull();
    expect(r.violations.some((v) => v.includes('version'))).toBe(true);
  });

  it('デコード可能な不正構造を例外ではなく拒否結果として返す', async () => {
    const engine = await createTestEngine(1, 15, 'JPN');
    const { decode, encode } = await import('@msgpack/msgpack');
    const valid = engine.serialize();
    const originalHash = hashWorld(engine.world);
    const originalPlayer = engine.world.playerCountry;
    const originalTick = engine.world.tick;
    const originalUnits = engine.world.units;
    const makeBlob = () => decode(valid) as Record<string, any>;
    const missingStores = makeBlob();
    delete missingStores.stores;
    const missingProv = makeBlob();
    delete missingProv.stores.prov;
    const nullUnit = makeBlob();
    nullUnit.stores.units = [null];
    const badOwner = makeBlob();
    badOwner.stores.prov.owner[0] = null;
    const badController = makeBlob();
    badController.stores.prov.controller[0] = 0.5;
    const badUnitStock = makeBlob();
    badUnitStock.stores.units[0].manpower = NaN;
    const badPlayer = makeBlob();
    badPlayer.header.playerCountry = engine.pack.countries.length;
    badPlayer.stores.playerCountry = badPlayer.header.playerCountry;
    const badTick = makeBlob();
    badTick.stores.tick++;
    const badSavedAt = makeBlob();
    badSavedAt.header.savedAtTick++;
    for (const value of [null, [], 0, {}, missingStores, missingProv, nullUnit, badOwner, badController, badUnitStock, badPlayer, badTick, badSavedAt]) {
      // チェックサムを再計算しても構造・参照検証で拒否することを確認する。
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && value.header && value.stores) {
        value.payloadChecksum = savePayloadChecksum(value.header, value.stores);
      }
      const bytes = encode(value);
      const result = deserializeWorld(bytes, engine.pack);
      expect(result.world).toBeNull();
      expect(result.violations.length).toBeGreaterThan(0);
      const loaded = engine.loadFrom(bytes);
      expect(loaded.ok).toBe(false);
      expect(loaded.violations.length).toBeGreaterThan(0);
      expect(hashWorld(engine.world)).toBe(originalHash);
      expect(engine.world.playerCountry).toBe(originalPlayer);
      expect(engine.world.tick).toBe(originalTick);
      expect(engine.world.units).toBe(originalUnits);
    }
    expect(engine.loadFrom(valid)).toEqual({ ok: true, violations: [] });
    expect(hashWorld(engine.world)).toBe(originalHash);
  });

});
