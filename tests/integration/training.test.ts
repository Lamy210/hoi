import { describe, expect, it } from 'vitest';
import { createTestEngine } from '../helpers';
import { applyCommands } from '../../src/engine/core/command';
import { tickTraining } from '../../src/engine/systems/training';
import { hashWorld } from '../../src/engine/core/hash';
import { decode, encode } from '@msgpack/msgpack';

describe('師団募集・配備', () => {
  it('人力装備を予約し、期限までは地図に出現せず、期限に配備する', async () => {
    const e = await createTestEngine(), w = e.world, c = w.playerCountry, p = w.countries.capital[c];
    const before = [w.countries.manpowerPool[c], w.countries.infEquipmentStock[c], w.countries.artEquipmentStock[c]];
    const n = w.units.length;
    expect(applyCommands(w, [{ issuer: 'player', seq: 1, type: 'startTraining', p: { templateId: 'light-v1', province: p } }])[0].ok).toBe(true);
    const order = w.trainingQueue[0];
    expect(w.units).toHaveLength(n);
    expect([w.countries.manpowerPool[c], w.countries.infEquipmentStock[c], w.countries.artEquipmentStock[c]]).toEqual([before[0]-5000,before[1]-500,before[2]-100]);
    const bytes = e.serialize(), hash = hashWorld(w);
    expect(e.loadFrom(bytes).ok).toBe(true);
    expect(hashWorld(w)).toBe(hash);
    w.tick = order.readyTick - 1;
    tickTraining(w);
    expect(w.units).toHaveLength(n);
    w.tick++;
    tickTraining(w);
    expect(w.trainingQueue).toHaveLength(0);
    const u = w.units.find(u => u.id === order.id)!;
    expect([u.templateId, u.maxManpower, u.maxInfEquipment, u.maxArtEquipment]).toEqual(['light-v1',5000,500,100]);
    expect(w.units).toHaveLength(n + 1);
  });

  it('中止で予約資源を返却し、他国の配備州を拒否する', async () => {
    const e = await createTestEngine(), w = e.world, c = w.playerCountry;
    const p = w.countries.capital[c], foreign = w.prov.controller.findIndex(x => x !== c);
    const before = [w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]];
    const issue = (seq: number, type: string, p: Record<string, unknown>) => applyCommands(w, [{ issuer: 'player', seq, type, p }])[0];
    expect(issue(1,'startTraining',{templateId:'standard-v1',province:foreign}).ok).toBe(false);
    expect(issue(2,'startTraining',{templateId:'standard-v1',province:p}).ok).toBe(true);
    expect(issue(3,'cancelTraining',{id:w.trainingQueue[0].id}).ok).toBe(true);
    expect(w.trainingQueue).toHaveLength(0);
    expect([w.countries.manpowerPool[c],w.countries.infEquipmentStock[c],w.countries.artEquipmentStock[c]]).toEqual(before);
    w.countries.artEquipmentStock[c] = 0;
    expect(issue(4,'startTraining',{templateId:'artillery-v1',province:p}).reason).toBe('insufficientArtillery');
  });

  it('旧v4の構造は訓練なしで復元し、不正な訓練データは拒否する', async () => {
    const e = await createTestEngine();
    const old = decode(e.serialize()) as any;
    old.header.v = 4;
    delete old.stores.trainingQueue;
    expect(e.loadFrom(encode(old)).ok).toBe(true);
    expect(e.world.trainingQueue).toEqual([]);
    const bad = decode(e.serialize()) as any;
    bad.stores.trainingQueue = [{id:1,country:0,province:0,templateId:'unknown',readyTick:40}];
    expect(e.loadFrom(encode(bad)).ok).toBe(false);
  });
});
