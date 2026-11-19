// 速度段階と経過時間に基づくtick要求。フレーム単位の丸めによる過剰進行を防ぐ。
import { appStore } from './store';
import { engineClient } from './engineClient';

let raf = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastFrame = 0;
let awaitingSnapshot = false;
let suppressUntil = 0;
let credit = 0;
let lastSpeed = 0;

const SPEED_TICKS_PER_SEC: Record<number, number> = { 1: 1, 2: 2, 4: 4, 8: 8 };

export function startPacer(): void {
  stopPacer();
  lastFrame = performance.now();
  engineClient.onSnapshotHook = () => {
    awaitingSnapshot = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const st = appStore.get();
    const dt = Math.min(1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (lastSpeed !== st.speed) {
      lastSpeed = st.speed;
      credit = 0;
    }
    if (!st.snap || st.speed === 0 || awaitingSnapshot || now < suppressUntil) return;
    credit += (SPEED_TICKS_PER_SEC[st.speed] ?? 0) * dt;
    const ticks = Math.floor(credit);
    if (ticks < 1) return;
    credit -= ticks;
    awaitingSnapshot = true;
    engineClient.step(ticks, st.lastAlertId);
    timer = setTimeout(() => {
      if (awaitingSnapshot) {
        // 同一要求の応答を待機し続け、未完了のままtickを重複送信しない。
        suppressUntil = performance.now() + 500;
        appStore.set({ perfWarn: true });
      }
    }, 600);
  };
  raf = requestAnimationFrame(loop);
}

export function stopPacer(): void {
  if (raf) cancelAnimationFrame(raf);
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  raf = 0;
  awaitingSnapshot = false;
  suppressUntil = credit = lastSpeed = 0;
  engineClient.onSnapshotHook = null;
}
