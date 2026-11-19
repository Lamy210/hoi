// シミュレーションWorker — UIスレッドとの境界（game-ui/game-core仕様）。
// 上り: コマンド（検証はエンジン内）。下り: 差分スナップショット。トレースはオンデマンド。
import { createEngine, type Engine, type TraceRequest } from './engine';
import { civilFromDays } from './clock/date';
import type { Pack } from './scenario/types';

let engine: Engine | null = null;
let pack: Pack | null = null;
let playerSeq = 1;

function resumePlayerSequence(engine: Engine): number {
  return engine.world.journal.reduce((next, entry) =>
    entry.issuer === 'player' && Number.isSafeInteger(entry.seq) && entry.seq >= next
      ? entry.seq + 1 : next, 1);
}

const post = (msg: unknown, transfer?: Transferable[]): void => {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
};

async function postSnapshot(sinceAlertId: number, appliedPlayerCommands = 0): Promise<void> {
  if (!engine) return;
  post({ type: 'snapshot', snap: engine.getUiSnapshot(sinceAlertId), appliedPlayerCommands });
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as Record<string, any>;
  const reply = (data: Record<string, unknown>, transfer?: Transferable[]) => post({ ...data, requestId: msg.requestId }, transfer);
  try {
    switch (msg.type) {
      case 'initPack': {
        // パックはメインスレッドで検証済み（http: fetch+checksum / file: 静的インポート）
        pack = msg.pack as Pack;
        engine = createEngine(pack, msg.opts);
        playerSeq = 1;
        await postSnapshot(0);
        reply({ type: 'ready', meta: engine.getUiMeta() });
        break;
      }
      case 'command': {
        if (!engine) return;
        if (!Number.isSafeInteger(playerSeq)) throw new Error('player sequence exhausted');
        engine.queuePlayerCommand(playerSeq++, msg.cmdType, msg.p);
        break;
      }
      case 'step': {
        if (!engine) return;
        const n: number = msg.ticks ?? 1;
        const appliedPlayerCommands = n > 0 ? engine.world.runtime.commandsSinceLastTick.filter(c => c.issuer === 'player').length : 0;
        for (let i = 0; i < n; i++) engine.stepTick();
        // 月初で自動セーブ（save-system仕様）
        const day = civilFromDays(engine.world.epochDays + engine.world.tick).d;
        if (engine.world.tick > 0 && day === 1 && pack) {
          const buf = engine.serialize();
          post({ type: 'autosave', buf, tick: engine.world.tick, dateStr: engine.getUiSnapshot(0).dateStr }, [buf.buffer as ArrayBuffer]);
        }
        await postSnapshot(msg.sinceAlertId ?? 0, appliedPlayerCommands);
        break;
      }
      case 'snapshot': {
        await postSnapshot(msg.sinceAlertId ?? 0);
        break;
      }
      case 'save': {
        if (!engine) return;
        if (engine.world.runtime.commandsSinceLastTick.some(c => c.issuer === 'player')) throw new Error('Apply pending orders before saving');
        const buf = engine.serialize();
        reply({ type: 'saved', buf, tick: engine.world.tick, dateStr: engine.getUiSnapshot(0).dateStr }, [buf.buffer as ArrayBuffer]);
        break;
      }
      case 'load': {
        if (!engine || !pack) return;
        const r = engine.loadFrom(msg.buf);
        if (r.ok) {
          playerSeq = resumePlayerSequence(engine);
          reply({ type: 'loaded', ok: true, meta: engine.getUiMeta() });
          await postSnapshot(0);
        } else {
          reply({ type: 'loaded', ok: false, violations: r.violations });
        }
        break;
      }
      case 'trace': {
        if (!engine) return;
        const result = engine.trace(msg.req as TraceRequest);
        reply({ type: 'traceResult', req: msg.req, result });
        break;
      }
      case 'aiLog': {
        // 開発者モード: AI判断ログの照会（ai-system仕様）
        if (!engine) return;
        const logs = engine.world.runtime.decisionLog[String(msg.country)] ?? [];
        reply({ type: 'aiLog', country: msg.country, logs });
        break;
      }
      default:
        reply({ type: 'error', message: 'unknown message type: ' + msg.type });
    }
  } catch (err: any) {
    reply({ type: 'error', message: String(err?.message ?? err), violations: err?.violations ?? undefined });
  }
};

export {};
