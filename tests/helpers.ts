// テスト共通ヘルパ — Node環境でパックを読み込むためのfetchシム
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, type FetchImpl } from '../src/engine/scenario/loader';
import { createEngine, type Engine } from '../src/engine/engine';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACK_DIR = path.resolve(HERE, '..', 'public', 'packs', 'modern-eastasia');

export const nodeFetch: FetchImpl = (url: string) => {
  const marker = '/packs/modern-eastasia/';
  const idx = url.indexOf(marker);
  const file = idx >= 0 ? url.slice(idx + marker.length) : url;
  const text = fs.readFileSync(path.join(PACK_DIR, file), 'utf8');
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => text,
    json: async () => JSON.parse(text),
  });
};

export async function loadTestPack(verifyChecksums = true) {
  return loadPack('file:///packs/modern-eastasia/', { fetchImpl: nodeFetch, verifyChecksums });
}

export async function createTestEngine(difficulty: 0 | 1 | 2 = 1, seed = 20261114, player = 'JPN'): Promise<Engine> {
  const pack = await loadTestPack();
  return createEngine(pack, { seed, playerCountryId: player, difficulty });
}

/** プレイヤーとしてコマンドを発行する（テスト用） */
export function playerCommand(engine: Engine, type: string, p: Record<string, unknown>): void {
  engine.world.runtime.commandsSinceLastTick.push({
    issuer: 'player',
    seq: engine.world.tick * 1000 + engine.world.runtime.commandsSinceLastTick.length + 1,
    type,
    p,
  });
}
