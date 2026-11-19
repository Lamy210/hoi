// シミュレーションWorker — UIスレッドとの境界（game-ui/game-core仕様）。
// 上り: コマンド（検証はエンジン内）。下り: 差分スナップショット。トレースはオンデマンド。
import { createEngine, type Engine, type TraceRequest } from './engine';
import { civilFromDays } from './clock/date';
import type { Pack } from './scenario/types';

let engine: Engine | null = null;
let pack: Pack | null = null;

const post = (msg: unknown, transfer?: Transferable[]): void => {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
};

async function postSnapshot(sinceAlertId: number): Promise<void> {
  if (!engine) return;
  post({ type: 'snapshot', snap: engine.getUiSnapshot(sinceAlertId) });
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as Record<string, any>;
  try {
    switch (msg.type) {
      case 'initPack': {
        // パックはメインスレッドで検証済み（http: fetch+checksum / file: 静的インポート）
        pack = msg.pack as Pack;
        engine = createEngine(pack, msg.opts);
        post({ type: 'ready', meta: engine.getUiMeta() });
        await postSnapshot(0);
        break;
      }
      case 'command': {
        if (!engine) return;
        engine.queuePlayerCommand(msg.seq, msg.cmdType, msg.p);
        break;
      }
      case 'step': {
        if (!engine) return;
        const n: number = msg.ticks ?? 1;
        for (let i = 0; i < n; i++) engine.stepTick();
        // 月初で自動セーブ（save-system仕様）
        const day = civilFromDays(engine.world.epochDays + engine.world.tick).d;
        if (engine.world.tick > 0 && day === 1 && pack) {
          const buf = engine.serialize();
          post({ type: 'autosave', buf, tick: engine.world.tick }, [buf.buffer as ArrayBuffer]);
        }
        await postSnapshot(msg.sinceAlertId ?? 0);
        break;
      }
      case 'snapshot': {
        await postSnapshot(msg.sinceAlertId ?? 0);
        break;
      }
      case 'save': {
        if (!engine) return;
        const buf = engine.serialize();
        post({ type: 'saved', buf, tick: engine.world.tick, dateStr: engine.getUiSnapshot(0).dateStr }, [buf.buffer as ArrayBuffer]);
        break;
      }
      case 'load': {
        if (!engine || !pack) return;
        const r = engine.loadFrom(msg.buf);
        if (r.ok) {
          post({ type: 'loaded', ok: true, meta: engine.getUiMeta() });
          await postSnapshot(0);
        } else {
          post({ type: 'loaded', ok: false, violations: r.violations });
        }
        break;
      }
      case 'trace': {
        if (!engine) return;
        const result = engine.trace(msg.req as TraceRequest);
        post({ type: 'traceResult', req: msg.req, result });
        break;
      }
      case 'aiLog': {
        // 開発者モード: AI判断ログの照会（ai-system仕様）
        if (!engine) return;
        const logs = engine.world.runtime.decisionLog[String(msg.country)] ?? [];
        post({ type: 'aiLog', country: msg.country, logs });
        break;
      }
      default:
        post({ type: 'error', message: 'unknown message type: ' + msg.type });
    }
  } catch (err: any) {
    post({ type: 'error', message: String(err?.message ?? err), violations: err?.violations ?? undefined });
  }
};

export {};
