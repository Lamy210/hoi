// 時間ペーサー — 速度段階に応じてWorkerへtick要求を出す（clock仕様のUI側実装）。
// スナップショット応答が遅延した場合は自動抑制し、警告フラグを立てる（未計測性能の保証禁止）。
import { appStore } from './store';
import { engineClient } from './engineClient';

let raf = 0;
let lastFrame = 0;
let awaitingSnapshot = false;
let suppressUntil = 0;

const SPEED_TICKS_PER_SEC: Record<number, number> = { 1: 1, 2: 2, 4: 4, 8: 8 };

export function startPacer(): void {
  stopPacer();
  lastFrame = performance.now();
  engineClient.onSnapshotHook = () => {
    awaitingSnapshot = false;
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const st = appStore.get();
    const dt = Math.min(1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!st.snap || st.speed === 0 || awaitingSnapshot || now < suppressUntil) return;
    const ticks = SPEED_TICKS_PER_SEC[st.speed] ?? 0;
    if (ticks <= 0) return;
    awaitingSnapshot = true;
    engineClient.step(Math.max(1, Math.round(ticks * dt)), st.lastAlertId);
    // 応答が遅い場合の自動抑制（遅延警告フラグを公開）
    setTimeout(() => {
      if (awaitingSnapshot) {
        awaitingSnapshot = false;
        suppressUntil = performance.now() + 500;
        appStore.set({ perfWarn: true });
      }
    }, 600);
  };
  raf = requestAnimationFrame(loop);
}

export function stopPacer(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  awaitingSnapshot = false;
  engineClient.onSnapshotHook = null;
}
